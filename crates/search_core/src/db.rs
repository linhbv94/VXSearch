use crate::{models::*, paths::normalize};
use rusqlite::{params, params_from_iter, types::Value, Connection};
use std::{
    path::Path,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
pub(crate) fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
pub(crate) fn connect(path: &Path) -> Result<Connection> {
    let c = Connection::open(path)?;
    c.busy_timeout(std::time::Duration::from_secs(5))?;
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA cache_size=-8192;")?;
    Ok(c)
}
pub(crate) fn list(c: &Connection) -> Result<Vec<WatchedRootItem>> {
    let mut q=c.prepare("SELECT id,path,alias,status,total_files,total_size_bytes,is_removable,last_scan_at,error_message FROM watched_roots ORDER BY id")?;
    let result = q
        .query_map([], |r| {
            Ok(WatchedRootItem {
                id: r.get(0)?,
                path: r.get(1)?,
                alias: r.get(2)?,
                status: r.get(3)?,
                total_files: r.get(4)?,
                total_size_bytes: r.get(5)?,
                is_removable: r.get(6)?,
                last_scan_at: r.get(7)?,
                error_message: r.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(result)
}
pub(crate) fn settings(c: &Connection) -> Result<AppSettings> {
    use rusqlite::OptionalExtension;
    let json: Option<String> = c
        .query_row(
            "SELECT value_json FROM app_settings WHERE key='settings'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    match json {
        Some(j) => serde_json::from_str(&j).map_err(|e| AppError::new("E_SETTINGS", e.to_string())),
        None => Ok(AppSettings::default()),
    }
}
pub(crate) fn save_settings(c: &Connection, s: &AppSettings) -> Result<()> {
    s.validate()?;
    c.execute("INSERT INTO app_settings(key,value_json) VALUES('settings',?1) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",params![serde_json::to_string(s).map_err(|e|AppError::new("E_SETTINGS",e.to_string()))?])?;
    Ok(())
}
pub(crate) fn totals(c: &Connection, id: i64) -> Result<()> {
    c.execute("UPDATE watched_roots SET total_files=(SELECT COUNT(*) FROM files WHERE root_id=?1),total_size_bytes=(SELECT COALESCE(SUM(size_bytes),0) FROM files WHERE root_id=?1) WHERE id=?1",[id])?;
    Ok(())
}
pub(crate) fn search(c: &Connection, p: SearchParams) -> Result<SearchResponse> {
    let start = Instant::now();
    if p.query.len() > 2048 || p.offset > 1_000_000 || p.query.contains('\0') {
        return Err(AppError::new(
            "E_INVALID_QUERY",
            "Truy vấn quá dài hoặc phân trang không hợp lệ.",
        ));
    }
    let query = normalize(p.query.trim());
    let tokens: Vec<_> = query.split_whitespace().collect();
    if tokens.len() > 32 {
        return Err(AppError::new("E_INVALID_QUERY", "Tối đa 32 từ khóa."));
    }
    let mut where_sql = vec!["1=1".to_string()];
    let mut values: Vec<Value> = vec![];
    let mut matches = vec![];
    for token in tokens {
        if token.starts_with('.')
            && token.len() > 1
            && token[1..].chars().all(char::is_alphanumeric)
        {
            where_sql.push("f.extension = ?".into());
            values.push(token[1..].to_owned().into());
        } else {
            where_sql.push("instr(f.search_text, ?) > 0".into());
            values.push(token.to_owned().into());
            if token.chars().count() >= 3 {
                matches.push(format!("\"{}\"", token.replace('"', "\"\"")));
            }
        }
    }
    if !matches.is_empty() {
        where_sql.push("f.id IN (SELECT rowid FROM files_fts WHERE files_fts MATCH ?)".into());
        values.push(matches.join(" AND ").into());
    }
    if let Some(root) = p.root_id {
        where_sql.push("f.root_id = ?".into());
        values.push(root.into());
    }
    if p.filter_type != "all" {
        if ![
            "document",
            "image",
            "video",
            "audio",
            "code",
            "archive",
            "directory",
            "other",
        ]
        .contains(&p.filter_type.as_str())
        {
            return Err(AppError::new("E_INVALID_QUERY", "Loại tệp không hợp lệ."));
        }
        where_sql.push("f.file_type = ?".into());
        values.push(p.filter_type.into());
    }
    let condition = where_sql.join(" AND ");
    // A read transaction keeps count and page consistent while the indexer commits.
    let tx = c.unchecked_transaction()?;
    let total: i64 = tx.query_row(
        &format!("SELECT COUNT(*) FROM files f WHERE {condition}"),
        params_from_iter(values.iter()),
        |r| r.get(0),
    )?;
    let order = match p.sort_by.as_str() {
        "relevance" if !query.is_empty() => {
            let first = query
                .split_whitespace()
                .find(|token| !token.starts_with('.'))
                .unwrap_or("");
            values.push(query.clone().into());
            values.push(first.to_owned().into());
            values.push(first.to_owned().into());
            "CASE WHEN f.name_fold=? THEN 0 WHEN instr(f.name_fold,?)=1 THEN 1 WHEN instr(f.name_fold,?)>0 THEN 2 ELSE 3 END,f.name_fold ASC,f.path ASC,f.id ASC"
        }
        "relevance" | "name_asc" => "f.name_fold ASC,f.path ASC,f.id ASC",
        "size_desc" => "f.size_bytes DESC,f.path ASC,f.id ASC",
        "modified_desc" => "f.modified_at DESC,f.path ASC,f.id ASC",
        _ => return Err(AppError::new("E_INVALID_QUERY", "Thứ tự không hợp lệ.")),
    };
    values.push((p.limit.clamp(1, 200) as i64).into());
    values.push((p.offset as i64).into());
    let items = {
        let mut q=tx.prepare(&format!("SELECT f.id,f.root_id,f.path,f.parent_dir,f.name,f.extension,f.file_type,f.size_bytes,f.modified_at,f.is_directory,r.status NOT IN ('WATCHING_ACTIVE','SCANNING_INITIAL','RECONCILING') FROM files f JOIN watched_roots r ON r.id=f.root_id WHERE {condition} ORDER BY {order} LIMIT ? OFFSET ?"))?;
        let rows = q
            .query_map(params_from_iter(values.iter()), |r| {
                Ok(SearchResultItem {
                    id: r.get(0)?,
                    root_id: r.get(1)?,
                    path: r.get(2)?,
                    parent_dir: r.get(3)?,
                    name: r.get(4)?,
                    extension: r.get(5)?,
                    file_type: r.get(6)?,
                    size_bytes: r.get(7)?,
                    modified_at: r.get(8)?,
                    is_directory: r.get(9)?,
                    is_offline: r.get(10)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };
    tx.commit()?;
    Ok(SearchResponse {
        items,
        total_matched: total as usize,
        took_ms: start.elapsed().as_secs_f64() * 1000.0,
    })
}
pub(crate) fn db_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
        + std::fs::metadata(format!("{}-wal", path.display()))
            .map(|m| m.len())
            .unwrap_or(0)
}
