use crate::{db, models::*, paths};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

type Reply<T> = mpsc::Sender<Result<T>>;
pub(crate) enum Command {
    Add(String, Reply<AddRootResponse>),
    Merge(String, Vec<i64>, Reply<MergeResponse>),
    Relink(i64, String, Reply<Success>),
    Remove(i64, Reply<RemoveResponse>),
    Refresh(i64, Reply<Success>),
    Settings(AppSettings, Reply<Success>),
    Vacuum(Reply<VacuumResponse>),
    Shutdown,
}
struct FsEvent {
    root: i64,
    event: notify::Event,
    failed: bool,
}
struct Root {
    id: i64,
    path: PathBuf,
    identity: String,
    generation: i64,
}
struct Worker {
    db: Connection,
    callback: EventCallback,
    db_path: PathBuf,
    watchers: HashMap<i64, RecommendedWatcher>,
    events_tx: mpsc::SyncSender<FsEvent>,
    overflow: Arc<AtomicBool>,
    pending: BTreeSet<i64>,
    stop: Arc<AtomicBool>,
    watch_retry: HashMap<i64, WatchRetry>,
    #[cfg(test)]
    force_watcher_failure: bool,
}
struct WatchRetry {
    attempts: u32,
    after: Instant,
    message: String,
}
impl Worker {
    fn emit(&self, name: &str, payload: serde_json::Value) {
        (self.callback)(CoreEvent {
            name: name.into(),
            payload,
        });
    }
    fn roots(&self) -> Result<Vec<Root>> {
        let mut s = self
            .db
            .prepare("SELECT id,path,identity,scan_generation FROM watched_roots ORDER BY id")?;
        let roots = s
            .query_map([], |r| {
                Ok(Root {
                    id: r.get(0)?,
                    path: PathBuf::from(r.get::<_, String>(1)?),
                    identity: r.get(2)?,
                    generation: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(roots)
    }
    fn root(&self, id: i64) -> Result<Root> {
        self.roots()?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or_else(|| AppError::new("E_ROOT_NOT_FOUND", "Thư mục không còn được theo dõi."))
    }
    fn status(&self, id: i64, status: &str, message: Option<&str>) -> Result<()> {
        self.db.execute(
            "UPDATE watched_roots SET status=?2,error_message=?3 WHERE id=?1",
            params![id, status, message],
        )?;
        self.emit(
            "root_status_changed",
            json!({"root_id":id,"new_status":status,"message":message}),
        );
        Ok(())
    }
    fn register(&mut self, root: &Root) -> Result<()> {
        if self.watchers.contains_key(&root.id) {
            return Ok(());
        }
        if let Some(retry) = self.watch_retry.get(&root.id) {
            if Instant::now() < retry.after {
                return Err(AppError::new("E_WATCHER", retry.message.clone()));
            }
        }
        match self.register_now(root) {
            Ok(()) => {
                self.watch_retry.remove(&root.id);
                Ok(())
            }
            Err(error) => {
                let attempts = self
                    .watch_retry
                    .get(&root.id)
                    .map(|retry| retry.attempts + 1)
                    .unwrap_or(1)
                    .min(6);
                let delay = Duration::from_secs((1u64 << attempts).min(60));
                self.watch_retry.insert(
                    root.id,
                    WatchRetry {
                        attempts,
                        after: Instant::now() + delay,
                        message: error.message.clone(),
                    },
                );
                Err(error)
            }
        }
    }
    fn register_now(&mut self, root: &Root) -> Result<()> {
        #[cfg(test)]
        if self.force_watcher_failure {
            return Err(AppError::new("E_WATCHER", "Injected watcher failure"));
        }
        paths::ensure_identity(&root.path, &root.identity)?;
        let tx = self.events_tx.clone();
        let overflow = self.overflow.clone();
        let id = root.id;
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
                Ok(event) => {
                    if matches!(event.kind, EventKind::Access(_)) {
                        return;
                    }
                    if tx
                        .try_send(FsEvent {
                            root: id,
                            event,
                            failed: false,
                        })
                        .is_err()
                    {
                        overflow.store(true, Ordering::Release);
                    }
                }
                Err(_) => {
                    if tx
                        .try_send(FsEvent {
                            root: id,
                            event: notify::Event::new(EventKind::Other),
                            failed: true,
                        })
                        .is_err()
                    {
                        overflow.store(true, Ordering::Release);
                    }
                }
            })
            .map_err(|e| AppError::new("E_WATCHER", e.to_string()))?;
        watcher
            .watch(&root.path, RecursiveMode::Recursive)
            .map_err(|e| AppError::new("E_WATCHER", e.to_string()))?;
        self.watchers.insert(root.id, watcher);
        Ok(())
    }
    fn recover_roots(&mut self) -> Result<()> {
        for root in self.roots()? {
            match paths::ensure_identity(&root.path, &root.identity) {
                Err(error) => {
                    self.watchers.remove(&root.id);
                    self.status(root.id, "UNAVAILABLE_OFFLINE", Some(&error.message))?;
                }
                Ok(()) if !self.watchers.contains_key(&root.id) => {
                    let was_offline: bool = self.db.query_row(
                        "SELECT status='UNAVAILABLE_OFFLINE' FROM watched_roots WHERE id=?1",
                        [root.id],
                        |r| r.get(0),
                    )?;
                    match self.register(&root) {
                        Ok(()) => {
                            self.pending.insert(root.id);
                        }
                        Err(error) => {
                            self.status(
                                root.id,
                                "ERROR_ACCESS",
                                Some(&format!(
                                    "Watcher tạm lỗi, đang thử lại với backoff: {}",
                                    error.message
                                )),
                            )?;
                            if was_offline {
                                self.pending.insert(root.id);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
    fn overlap(&self, path: &Path, ignore: Option<i64>) -> Result<Vec<i64>> {
        let mut covered = vec![];
        for r in self.roots()? {
            if Some(r.id) == ignore {
                continue;
            }
            if path == r.path {
                return Err(AppError::new(
                    "E_EXACT_DUPLICATE",
                    "Thư mục đã có trong danh sách.",
                ));
            }
            if path.starts_with(&r.path) {
                return Err(AppError::new(
                    "E_CHILD_OF_EXISTING",
                    "Thư mục đã nằm trong phạm vi theo dõi.",
                ));
            }
            if r.path.starts_with(path) {
                covered.push(r.id);
            }
        }
        Ok(covered)
    }
    fn add(&mut self, path: &str, merge: Option<Vec<i64>>) -> Result<AddRootResponse> {
        let p = paths::canonical_root(path)?;
        let identity = paths::identity(&p)?;
        if self
            .db_path
            .parent()
            .is_some_and(|data_dir| p.starts_with(data_dir))
        {
            return Err(AppError::new(
                "E_PRIVATE_DATA",
                "Không theo dõi thư mục dữ liệu riêng của VXSearch.",
            ));
        }
        let mut covered = self.overlap(&p, None)?;
        covered.sort_unstable();
        if let Some(mut expected) = merge {
            expected.sort_unstable();
            if covered != expected || covered.is_empty() {
                return Err(AppError::new(
                    "E_MERGE_CHANGED",
                    "Danh sách thư mục đã thay đổi. Hãy thêm lại thư mục cha.",
                ));
            }
        } else if !covered.is_empty() {
            return Err(AppError::new(
                "E_PARENT_OF_EXISTING",
                "Thư mục bao trùm các thư mục đang theo dõi. Xác nhận để gộp.",
            )
            .details(json!({"covered_root_ids":covered})));
        }
        let tx = self.db.transaction()?;
        tx.execute("INSERT INTO watched_roots(path,identity,status,is_removable) VALUES(?1,?2,'SCANNING_INITIAL',?3)",params![paths::path_text(&p)?,identity,paths::removable(&p)])?;
        let id = tx.last_insert_rowid();
        for child in &covered {
            tx.execute(
                "UPDATE files SET root_id=?1 WHERE root_id=?2",
                params![id, child],
            )?;
            tx.execute("DELETE FROM watched_roots WHERE id=?1", [child])?;
        }
        tx.commit()?;
        for child in covered {
            self.watchers.remove(&child);
            self.watch_retry.remove(&child);
            self.pending.remove(&child);
        }
        db::totals(&self.db, id)?;
        let r = self.root(id)?;
        if let Err(e) = self.register(&r) {
            self.status(id, "ERROR_ACCESS", Some(&e.message))?;
        }
        self.pending.insert(id);
        self.emit(
            "index_changed",
            json!({"affected_roots":[id],"delta_count":0}),
        );
        Ok(AddRootResponse {
            success: true,
            root_id: id,
            status: "SCANNING_INITIAL".into(),
        })
    }
    fn relink(&mut self, id: i64, path: &str) -> Result<Success> {
        self.root(id)?;
        let p = paths::canonical_root(path)?;
        if self
            .db_path
            .parent()
            .is_some_and(|data_dir| p.starts_with(data_dir))
        {
            return Err(AppError::new(
                "E_PRIVATE_DATA",
                "Không theo dõi thư mục dữ liệu riêng của VXSearch.",
            ));
        }
        let covered = self.overlap(&p, Some(id))?;
        if !covered.is_empty() {
            return Err(AppError::new(
                "E_PARENT_OF_EXISTING",
                "Đường dẫn mới bao trùm thư mục khác; hãy dùng Thêm thư mục để gộp.",
            ));
        }
        let identity = paths::identity(&p)?;
        let tx = self.db.transaction()?;
        tx.execute("UPDATE watched_roots SET path=?2,identity=?3,status='RECONCILING',error_message=NULL,last_scan_at=NULL WHERE id=?1",params![id,paths::path_text(&p)?,identity])?;
        tx.execute("DELETE FROM files WHERE root_id=?1", [id])?;
        tx.commit()?;
        self.watchers.remove(&id);
        self.watch_retry.remove(&id);
        let r = self.root(id)?;
        if let Err(e) = self.register(&r) {
            self.status(id, "ERROR_ACCESS", Some(&e.message))?;
        }
        db::totals(&self.db, id)?;
        self.pending.insert(id);
        Ok(Success::default())
    }
    fn excluded(&self, path: &Path) -> bool {
        self.db_path
            .parent()
            .is_some_and(|parent| path.starts_with(parent))
    }
    fn record(&self, root: &Root, path: &Path, generation: i64) -> Result<Record> {
        let meta = fs::symlink_metadata(path).map_err(paths::io_error)?;
        // A parent changed into a symlink during traversal must never escape scope.
        let parent = path
            .parent()
            .ok_or_else(|| AppError::new("E_INVALID_PATH", "Thiếu thư mục cha."))?;
        let canonical_parent = dunce::canonicalize(parent).map_err(paths::io_error)?;
        if !canonical_parent.starts_with(&root.path) {
            return Err(AppError::new(
                "E_OUTSIDE_SCOPE",
                "Nhánh thư mục đã đổi sang liên kết ngoài phạm vi.",
            ));
        }
        let path = paths::path_text(path)?;
        let name = Path::new(&path)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| AppError::new("E_PATH_ENCODING", "Tên tệp không phải Unicode hợp lệ."))?
            .to_owned();
        let dir = meta.is_dir();
        let ext = if dir {
            String::new()
        } else {
            Path::new(&path)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
        };
        Ok(Record {
            path: path.clone(),
            parent: paths::path_text(parent)?,
            name_fold: paths::normalize(&name),
            name,
            ext: ext.clone(),
            kind: paths::file_type(&ext, dir).into(),
            size: if dir {
                0
            } else {
                meta.len().min(i64::MAX as u64) as i64
            },
            mtime: meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis().min(i64::MAX as u128) as i64)
                .unwrap_or(0),
            is_dir: dir,
            is_link: meta.file_type().is_symlink(),
            search: paths::normalize(&path),
            generation,
        })
    }
    fn write_batch(&mut self, root: i64, records: &[Record], staging: bool) -> Result<()> {
        let tx = self.db.transaction()?;
        {
            let sql="INSERT INTO files(root_id,path,parent_dir,name,extension,file_type,size_bytes,modified_at,is_directory,is_symlink,search_text,generation,name_fold) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT(path) DO UPDATE SET root_id=excluded.root_id,parent_dir=excluded.parent_dir,name=excluded.name,extension=excluded.extension,file_type=excluded.file_type,size_bytes=excluded.size_bytes,modified_at=excluded.modified_at,is_directory=excluded.is_directory,is_symlink=excluded.is_symlink,search_text=excluded.search_text,generation=excluded.generation,name_fold=excluded.name_fold";
            let statement = if staging {
                sql.replace("INSERT INTO files(", "INSERT INTO scan_entries(")
            } else {
                sql.to_owned()
            };
            let mut q = tx.prepare_cached(&statement)?;
            for r in records {
                q.execute(params![
                    root,
                    r.path,
                    r.parent,
                    r.name,
                    r.ext,
                    r.kind,
                    r.size,
                    r.mtime,
                    r.is_dir,
                    r.is_link,
                    r.search,
                    r.generation,
                    r.name_fold
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    fn scan(&mut self, id: i64) -> Result<()> {
        let root = self.root(id)?;
        if let Err(e) = paths::ensure_identity(&root.path, &root.identity) {
            self.watchers.remove(&id);
            let state = if e.code == "E_ACCESS_DENIED" {
                "ERROR_ACCESS"
            } else {
                "UNAVAILABLE_OFFLINE"
            };
            self.status(id, state, Some(&e.message))?;
            return Ok(());
        }
        let watch_error = self.register(&root).err();
        self.status(id, "RECONCILING", None)?;
        let started = Instant::now();
        let generation = root
            .generation
            .checked_add(1)
            .ok_or_else(|| AppError::new("E_GENERATION", "Số thế hệ quét vượt giới hạn."))?;
        self.db.execute(
            "UPDATE watched_roots SET scan_generation=?2 WHERE id=?1",
            params![id, generation],
        )?;
        self.db.execute_batch("CREATE TEMP TABLE IF NOT EXISTS scan_entries AS SELECT * FROM files WHERE 0; CREATE UNIQUE INDEX IF NOT EXISTS temp.scan_entries_path ON scan_entries(path); DELETE FROM scan_entries;")?;
        let mut batch = Vec::with_capacity(500);
        let mut count = 0usize;
        let mut error = None;
        let data_dir = self.db_path.parent().map(Path::to_path_buf);
        for item in walkdir::WalkDir::new(&root.path)
            .follow_links(false)
            .min_depth(1)
            .max_open(32)
            .into_iter()
            .filter_entry(|entry| {
                !data_dir
                    .as_ref()
                    .is_some_and(|dir| entry.path().starts_with(dir))
            })
        {
            if self.stop.load(Ordering::Acquire) {
                error = Some("Đã dừng quét; giữ chỉ mục cũ.".into());
                break;
            }
            match item {
                Ok(entry) => {
                    if self.excluded(entry.path()) {
                        continue;
                    }
                    match self.record(&root, entry.path(), generation) {
                        Ok(record) => {
                            batch.push(record);
                            count += 1;
                        }
                        Err(e) => {
                            error = Some(e.message);
                        }
                    }
                }
                Err(e) => {
                    error = Some(e.to_string());
                }
            }
            if batch.len() >= 500 {
                self.write_batch(id, &batch, true)?;
                batch.clear();
                if let Err(e) = paths::ensure_identity(&root.path, &root.identity) {
                    error = Some(e.message);
                    break;
                }
            }
            if count > 0 && count % 2000 == 0 {
                self.emit(
                    "scan_progress",
                    json!({"root_id":id,"current_path":root.path,"scanned_count":count}),
                );
            }
        }
        if !batch.is_empty() {
            self.write_batch(id, &batch, true)?;
        }
        let same_identity = match paths::ensure_identity(&root.path, &root.identity) {
            Ok(()) => true,
            Err(e) => {
                error = Some(e.message);
                self.watchers.remove(&id);
                false
            }
        };
        // Stage metadata until the final identity check. An unplug/replacement during
        // traversal cannot inject the replacement volume's rows into the cached index.
        if same_identity && !self.stop.load(Ordering::Acquire) {
            let mut after_rowid = 0i64;
            loop {
                let rows = {
                    let mut q = self.db.prepare("SELECT rowid,path,parent_dir,name,extension,file_type,size_bytes,modified_at,is_directory,is_symlink,search_text,generation,name_fold FROM scan_entries WHERE rowid>?1 ORDER BY rowid LIMIT 500")?;
                    let rows = q
                        .query_map([after_rowid], |r| {
                            Ok((
                                r.get::<_, i64>(0)?,
                                Record {
                                    path: r.get(1)?,
                                    parent: r.get(2)?,
                                    name: r.get(3)?,
                                    ext: r.get(4)?,
                                    kind: r.get(5)?,
                                    size: r.get(6)?,
                                    mtime: r.get(7)?,
                                    is_dir: r.get(8)?,
                                    is_link: r.get(9)?,
                                    search: r.get(10)?,
                                    generation: r.get(11)?,
                                    name_fold: r.get(12)?,
                                },
                            ))
                        })?
                        .collect::<std::result::Result<Vec<_>, _>>()?;
                    rows
                };
                if rows.is_empty() {
                    break;
                }
                after_rowid = rows.last().unwrap().0;
                let records: Vec<Record> = rows.into_iter().map(|(_, r)| r).collect();
                self.write_batch(id, &records, false)?;
                if self.stop.load(Ordering::Acquire) {
                    error = Some("Đã dừng quét; giữ chỉ mục cũ.".into());
                    break;
                }
            }
        }
        self.db.execute("DELETE FROM scan_entries", [])?;
        if self.stop.load(Ordering::Acquire) {
            error = Some("Đã dừng quét; giữ chỉ mục cũ.".into());
        }
        if let Err(e) = paths::ensure_identity(&root.path, &root.identity) {
            error = Some(e.message);
        }
        // Sweep only after a complete traversal, imported staging and same identity.
        if error.is_none() && same_identity {
            self.db.execute(
                "DELETE FROM files WHERE root_id=?1 AND generation!=?2",
                params![id, generation],
            )?;
            self.db.execute(
                "UPDATE watched_roots SET last_scan_at=?2 WHERE id=?1",
                params![id, db::now()],
            )?;
        }
        db::totals(&self.db, id)?;
        if let Some(message) = error {
            self.status(id, "ERROR_ACCESS", Some(&message))?;
        } else if let Some(e) = watch_error {
            self.status(
                id,
                "ERROR_ACCESS",
                Some(&format!(
                    "Watcher không hoạt động; đối chiếu định kỳ: {}",
                    e.message
                )),
            )?;
        } else {
            self.status(id, "WATCHING_ACTIVE", None)?;
        }
        if let Some(r) = db::list(&self.db)?.into_iter().find(|r| r.id == id) {
            self.emit("scan_completed",json!({"root_id":id,"total_files":r.total_files,"total_size_bytes":r.total_size_bytes,"duration_ms":started.elapsed().as_millis() as u64}));
        }
        self.emit(
            "index_changed",
            json!({"affected_roots":[id],"delta_count":count}),
        );
        Ok(())
    }
    fn incremental(&mut self, id: i64, paths: HashSet<PathBuf>) -> Result<()> {
        let root = self.root(id)?;
        if let Err(e) = paths::ensure_identity(&root.path, &root.identity) {
            self.watchers.remove(&id);
            self.status(id, "UNAVAILABLE_OFFLINE", Some(&e.message))?;
            return Ok(());
        }
        let status: String =
            self.db
                .query_row("SELECT status FROM watched_roots WHERE id=?1", [id], |r| {
                    r.get(0)
                })?;
        if status != "WATCHING_ACTIVE" {
            self.pending.insert(id);
            return Ok(());
        }
        let mut records = vec![];
        let mut removed = vec![];
        for path in paths {
            if self.excluded(&path) {
                continue;
            }
            if !path.starts_with(&root.path) || path == root.path {
                self.pending.insert(id);
                continue;
            }
            match fs::symlink_metadata(&path) {
                Ok(m) => {
                    if m.is_dir() {
                        self.pending.insert(id);
                    } else {
                        match self.record(&root, &path, root.generation) {
                            Ok(r) => records.push(r),
                            Err(_) => {
                                self.pending.insert(id);
                            }
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    let text = paths::path_text(&path)?;
                    let was_dir: Option<bool> = self
                        .db
                        .query_row(
                            "SELECT is_directory FROM files WHERE root_id=?1 AND path=?2",
                            params![id, text],
                            |r| r.get(0),
                        )
                        .optional()?;
                    if was_dir == Some(true) {
                        self.pending.insert(id);
                    } else {
                        // Parent inaccessible/missing may indicate incomplete observation, reconcile instead.
                        match path.parent().and_then(|p| fs::read_dir(p).ok()) {
                            Some(_) => removed.push(text),
                            None => {
                                self.pending.insert(id);
                            }
                        }
                    }
                }
                Err(e) => {
                    self.status(id, "ERROR_ACCESS", Some(&e.to_string()))?;
                    self.pending.insert(id);
                }
            }
        }
        paths::ensure_identity(&root.path, &root.identity)?;
        if !records.is_empty() {
            self.write_batch(id, &records, false)?;
        }
        if !removed.is_empty() {
            let tx = self.db.transaction()?;
            for p in &removed {
                tx.execute(
                    "DELETE FROM files WHERE root_id=?1 AND path=?2",
                    params![id, p],
                )?;
            }
            tx.commit()?;
        }
        db::totals(&self.db, id)?;
        self.emit(
            "index_changed",
            json!({"affected_roots":[id],"delta_count":records.len()+removed.len()}),
        );
        Ok(())
    }
}
struct Record {
    path: String,
    parent: String,
    name: String,
    name_fold: String,
    ext: String,
    kind: String,
    size: i64,
    mtime: i64,
    is_dir: bool,
    is_link: bool,
    search: String,
    generation: i64,
}

pub(crate) fn run(
    db: Connection,
    commands: mpsc::Receiver<Command>,
    callback: EventCallback,
    db_path: PathBuf,
    stop: Arc<AtomicBool>,
) {
    let (events_tx, events_rx) = mpsc::sync_channel(4096);
    let overflow = Arc::new(AtomicBool::new(false));
    let mut w = Worker {
        db,
        callback,
        db_path,
        watchers: HashMap::new(),
        events_tx,
        overflow,
        pending: BTreeSet::new(),
        stop,
        watch_retry: HashMap::new(),
        #[cfg(test)]
        force_watcher_failure: false,
    };
    if let Ok(roots) = w.roots() {
        for root in roots {
            let _ = w.register(&root);
            w.pending.insert(root.id);
        }
    }
    let mut dirty: HashMap<i64, HashSet<PathBuf>> = HashMap::new();
    let mut dirty_since = Instant::now();
    let mut periodic = Instant::now();
    let mut recovery = Instant::now();
    let mut last_served_id = 0i64;
    while !w.stop.load(Ordering::Acquire) {
        // Time only the blocking wait: a long scan must not look like OS resume.
        let before_wait_instant = Instant::now();
        let before_wait_wall = SystemTime::now();
        let received = commands.recv_timeout(Duration::from_millis(50));
        let resumed = before_wait_instant.elapsed() > Duration::from_secs(5)
            || before_wait_wall
                .elapsed()
                .is_ok_and(|gap| gap > Duration::from_secs(5));
        if resumed {
            if let Ok(roots) = w.roots() {
                for root in roots {
                    w.pending.insert(root.id);
                }
            }
        }
        match received {
            Ok(Command::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Command::Add(p, reply)) => {
                let _ = reply.send(w.add(&p, None));
            }
            Ok(Command::Merge(p, ids, reply)) => {
                let result = w.add(&p, Some(ids)).map(|r| MergeResponse {
                    success: true,
                    new_root_id: r.root_id,
                });
                let _ = reply.send(result);
            }
            Ok(Command::Relink(id, p, reply)) => {
                let _ = reply.send(w.relink(id, &p));
            }
            Ok(Command::Remove(id, reply)) => {
                let result = (|| {
                    let root = w.root(id)?;
                    let count: i64 =
                        w.db.query_row("SELECT COUNT(*) FROM files WHERE root_id=?1", [id], |r| {
                            r.get(0)
                        })?;
                    w.db.execute("DELETE FROM watched_roots WHERE id=?1", [id])?;
                    w.watchers.remove(&root.id);
                    w.watch_retry.remove(&root.id);
                    w.pending.remove(&id);
                    dirty.remove(&id);
                    w.emit(
                        "index_changed",
                        json!({"affected_roots":[id],"delta_count":count}),
                    );
                    Ok(RemoveResponse {
                        success: true,
                        removed_files_count: count,
                    })
                })();
                let _ = reply.send(result);
            }
            Ok(Command::Refresh(id, reply)) => {
                let result = w.root(id).and_then(|_| {
                    w.pending.insert(id);
                    w.status(id, "RECONCILING", None)?;
                    Ok(Success::default())
                });
                let _ = reply.send(result);
            }
            Ok(Command::Settings(s, reply)) => {
                let _ = reply.send(db::save_settings(&w.db, &s).map(|_| Success::default()));
            }
            Ok(Command::Vacuum(reply)) => {
                let before = db::db_size(&w.db_path);
                let result =
                    w.db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
                        .map(|_| VacuumResponse {
                            success: true,
                            db_size_before_bytes: before,
                            db_size_after_bytes: db::db_size(&w.db_path),
                        })
                        .map_err(AppError::from);
                let _ = reply.send(result);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if w.overflow.swap(false, Ordering::AcqRel) {
            w.watchers.clear();
            if let Ok(roots) = w.roots() {
                for r in roots {
                    w.pending.insert(r.id);
                }
            }
        }
        for _ in 0..1000 {
            match events_rx.try_recv() {
                Ok(mut msg) => {
                    if msg.failed {
                        w.watchers.remove(&msg.root);
                        w.pending.insert(msg.root);
                        continue;
                    }
                    msg.event.paths.retain(|path| !w.excluded(path));
                    if msg.event.paths.is_empty() && !msg.event.need_rescan() {
                        continue;
                    }
                    if matches!(
                        msg.event.kind,
                        EventKind::Modify(notify::event::ModifyKind::Name(_))
                            | EventKind::Other
                            | EventKind::Any
                    ) || msg.event.need_rescan()
                    {
                        w.pending.insert(msg.root);
                        continue;
                    }
                    if dirty.is_empty() {
                        dirty_since = Instant::now();
                    }
                    let entries = dirty.entry(msg.root).or_default();
                    for p in msg.event.paths {
                        if entries.len() >= 1000 {
                            w.pending.insert(msg.root);
                            break;
                        }
                        entries.insert(p);
                    }
                }
                Err(_) => break,
            }
        }
        let debounce = db::settings(&w.db)
            .map(|s| s.debounce_ms)
            .unwrap_or(300)
            .min(2000);
        if !dirty.is_empty()
            && (dirty_since.elapsed() >= Duration::from_millis(debounce)
                || dirty.values().map(HashSet::len).sum::<usize>() >= 1000)
        {
            for (id, paths) in std::mem::take(&mut dirty) {
                if w.root(id).is_ok() {
                    if let Err(e) = w.incremental(id, paths) {
                        let _ = w.status(id, "ERROR_ACCESS", Some(&e.message));
                    }
                }
            }
        }
        if periodic.elapsed() >= Duration::from_secs(600) {
            if let Ok(roots) = w.roots() {
                for r in roots {
                    w.pending.insert(r.id);
                }
            }
            periodic = Instant::now();
        }
        if recovery.elapsed() >= Duration::from_secs(2) {
            let _ = w.recover_roots();
            recovery = Instant::now();
        }
        let next_id = w
            .pending
            .range((
                std::ops::Bound::Excluded(last_served_id),
                std::ops::Bound::Unbounded,
            ))
            .next()
            .copied()
            .or_else(|| w.pending.first().copied());
        if let Some(id) = next_id {
            w.pending.remove(&id);
            last_served_id = id;
            if w.root(id).is_ok() {
                if let Err(e) = w.scan(id) {
                    let _ = w.status(id, "ERROR_ACCESS", Some(&e.message));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistent_watcher_failure_retries_with_backoff_without_repeated_full_scan() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("kept.txt"), b"kept").unwrap();
        let data = temp.path().join("data");
        fs::create_dir(&data).unwrap();
        let db_path = data.join("index.db");
        let db = db::connect(&db_path).unwrap();
        db.execute_batch(include_str!("schema.sql")).unwrap();
        let db_path = dunce::canonicalize(db_path).unwrap();
        let (tx, _rx) = mpsc::sync_channel(4096);
        let mut worker = Worker {
            db,
            callback: Arc::new(|_| {}),
            db_path,
            watchers: HashMap::new(),
            events_tx: tx,
            overflow: Arc::new(AtomicBool::new(false)),
            pending: BTreeSet::new(),
            stop: Arc::new(AtomicBool::new(false)),
            watch_retry: HashMap::new(),
            force_watcher_failure: true,
        };
        let id = worker.add(source.to_str().unwrap(), None).unwrap().root_id;
        worker.pending.clear();
        worker.scan(id).unwrap();
        let generation = worker.root(id).unwrap().generation;
        assert_eq!(generation, 1);
        for _ in 0..5 {
            worker.recover_roots().unwrap();
            assert!(worker.pending.is_empty());
            assert_eq!(worker.root(id).unwrap().generation, generation);
        }
        assert_eq!(worker.watch_retry.get(&id).unwrap().attempts, 1);
        // Advance the scheduler deadline without sleeping: another failed attempt backs off.
        worker.watch_retry.get_mut(&id).unwrap().after = Instant::now();
        worker.recover_roots().unwrap();
        assert_eq!(worker.watch_retry.get(&id).unwrap().attempts, 2);
        assert!(worker.pending.is_empty());
        worker.force_watcher_failure = false;
        worker.watch_retry.get_mut(&id).unwrap().after = Instant::now();
        worker.recover_roots().unwrap();
        assert!(worker.pending.contains(&id));
        assert!(worker.watchers.contains_key(&id));
        worker.pending.clear();
        worker.scan(id).unwrap();
        assert_eq!(db::list(&worker.db).unwrap()[0].status, "WATCHING_ACTIVE");
    }
}
