//! Metadata-only local search. Source files are never opened for content or modified.
mod db;
mod models;
mod paths;
mod worker;
pub use models::*;
pub use paths::normalize;
use rusqlite::{params, Connection};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::JoinHandle,
};

#[derive(Clone)]
pub struct Engine {
    inner: Arc<Inner>,
}
struct Inner {
    tx: mpsc::SyncSender<worker::Command>,
    reader: Mutex<Connection>,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}
impl Drop for Inner {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.tx.try_send(worker::Command::Shutdown);
        if let Ok(slot) = self.thread.get_mut() {
            if let Some(thread) = slot.take() {
                let _ = thread.join();
            }
        }
    }
}
impl Engine {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_events(path, Arc::new(|_| {}))
    }
    pub fn open_with_events(path: impl AsRef<Path>, callback: EventCallback) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if path == Path::new(":memory:") {
            return Err(AppError::new(
                "E_DATABASE",
                "Cần đường dẫn SQLite trên đĩa cho writer/reader riêng.",
            ));
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(paths::io_error)?;
        }
        let writer = db::connect(&path)?;
        let path = dunce::canonicalize(&path).map_err(paths::io_error)?;
        writer.execute_batch(include_str!("schema.sql"))?;
        let has_fold: bool = writer.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('files') WHERE name='name_fold')",
            [],
            |r| r.get(0),
        )?;
        if !has_fold {
            writer.execute_batch(
                "ALTER TABLE files ADD COLUMN name_fold TEXT NOT NULL DEFAULT '';",
            )?;
            let rows = {
                let mut q = writer.prepare("SELECT id,name FROM files")?;
                let rows = q
                    .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            };
            for (id, name) in rows {
                writer.execute(
                    "UPDATE files SET name_fold=?2 WHERE id=?1",
                    params![id, paths::normalize(&name)],
                )?;
            }
        }
        let reader = db::connect(&path)?;
        let (tx, rx) = mpsc::sync_channel(64);
        let worker_path = path.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = stop.clone();
        let thread = std::thread::Builder::new()
            .name("vxsearch_index".into())
            .spawn(move || worker::run(writer, rx, callback, worker_path, worker_stop))
            .map_err(|e| AppError::new("E_WORKER", e.to_string()))?;
        Ok(Self {
            inner: Arc::new(Inner {
                tx,
                reader: Mutex::new(reader),
                path,
                stop,
                thread: Mutex::new(Some(thread)),
            }),
        })
    }
    fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let guard = self
            .inner
            .reader
            .lock()
            .map_err(|_| AppError::new("E_DATABASE", "Database lock poisoned"))?;
        f(&guard)
    }
    fn request<T>(
        &self,
        make: impl FnOnce(mpsc::Sender<Result<T>>) -> worker::Command,
    ) -> Result<T> {
        if self.inner.stop.load(Ordering::Acquire) {
            return Err(AppError::new("E_WORKER", "Indexer đã dừng."));
        }
        let (tx, rx) = mpsc::channel();
        self.inner
            .tx
            .send(make(tx))
            .map_err(|_| AppError::new("E_WORKER", "Indexer đã dừng."))?;
        rx.recv()
            .map_err(|_| AppError::new("E_WORKER", "Indexer không trả lời."))?
    }
    pub fn shutdown(&self) {
        self.inner.stop.store(true, Ordering::Release);
        let _ = self.inner.tx.try_send(worker::Command::Shutdown);
        if let Ok(mut slot) = self.inner.thread.lock() {
            if let Some(thread) = slot.take() {
                let _ = thread.join();
            }
        }
    }
    pub fn list_roots(&self) -> Result<Vec<WatchedRootItem>> {
        self.read(db::list)
    }
    pub fn search(&self, params: SearchParams) -> Result<SearchResponse> {
        self.read(|c| db::search(c, params))
    }
    pub fn add_root(&self, path: &str) -> Result<AddRootResponse> {
        self.request(|reply| worker::Command::Add(path.into(), reply))
    }
    pub fn confirm_merge(
        &self,
        parent_path: &str,
        covered_root_ids: Vec<i64>,
    ) -> Result<MergeResponse> {
        self.request(|reply| worker::Command::Merge(parent_path.into(), covered_root_ids, reply))
    }
    pub fn relink_root(&self, id: i64, path: &str) -> Result<Success> {
        self.request(|reply| worker::Command::Relink(id, path.into(), reply))
    }
    pub fn remove_root(&self, id: i64) -> Result<RemoveResponse> {
        self.request(|reply| worker::Command::Remove(id, reply))
    }
    pub fn refresh_root(&self, id: i64) -> Result<Success> {
        self.request(|reply| worker::Command::Refresh(id, reply))
    }
    pub fn get_settings(&self) -> Result<AppSettings> {
        self.read(db::settings)
    }
    pub fn update_settings(&self, s: AppSettings) -> Result<Success> {
        s.validate()?;
        self.request(|reply| worker::Command::Settings(s, reply))
    }
    pub fn reset_settings(&self) -> Result<AppSettings> {
        let s = AppSettings::default();
        self.update_settings(s.clone())?;
        Ok(s)
    }
    pub fn vacuum(&self) -> Result<VacuumResponse> {
        self.request(worker::Command::Vacuum)
    }
    pub fn system_status(&self) -> Result<SystemStatus> {
        self.read(|c| {
            let roots = db::list(c)?;
            let (total, size) = c.query_row(
                "SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM files",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            Ok(SystemStatus {
                total_roots: roots.len() as i64,
                total_files: total,
                total_size_bytes: size,
                db_size_bytes: db::db_size(&self.inner.path),
                is_any_scanning: roots
                    .iter()
                    .any(|r| r.status == "SCANNING_INITIAL" || r.status == "RECONCILING"),
                platform: if cfg!(target_os = "macos") {
                    "macos"
                } else if cfg!(windows) {
                    "windows"
                } else {
                    "linux"
                }
                .into(),
                app_version: env!("CARGO_PKG_VERSION").into(),
                hotkey_error: None,
            })
        })
    }
    pub fn contains_indexed_path(&self, path: &str) -> Result<bool> {
        self.read(|c| {
            Ok(c.query_row(
                "SELECT EXISTS(SELECT 1 FROM files WHERE path=?1)",
                params![path],
                |r| r.get(0),
            )?)
        })
    }
    pub fn validate_action(&self, path: &str) -> Result<PathBuf> {
        let (root,expected,status)=self.read(|c|c.query_row("SELECT r.path,r.identity,r.status FROM files f JOIN watched_roots r ON r.id=f.root_id WHERE f.path=?1",params![path],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).map_err(|_|AppError::new("E_NOT_INDEXED","Đường dẫn không thuộc chỉ mục.")))?;
        if !["WATCHING_ACTIVE", "SCANNING_INITIAL", "RECONCILING"].contains(&status.as_str()) {
            return Err(AppError::new(
                "E_ROOT_OFFLINE",
                "Thư mục chưa khả dụng hoặc cần đối chiếu lại.",
            ));
        }
        paths::ensure_identity(Path::new(&root), &expected)
            .map_err(|e| AppError::new("E_ROOT_OFFLINE", e.message))?;
        let p = PathBuf::from(path);
        std::fs::symlink_metadata(&p).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::new("E_STALE_FILE", "Tệp không còn tồn tại; hãy quét đối chiếu.")
            } else {
                paths::io_error(e)
            }
        })?;
        let resolved = dunce::canonicalize(&p).map_err(paths::io_error)?;
        if !resolved.starts_with(&root) {
            return Err(AppError::new(
                "E_OUTSIDE_SCOPE",
                "Liên kết trỏ ra ngoài thư mục theo dõi.",
            ));
        }
        Ok(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::AtomicBool,
        time::{Duration, Instant},
    };
    #[test]
    fn cancellation_during_scan_does_not_sweep_cached_rows() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("source");
        fs::create_dir(&root).unwrap();
        for i in 0..2200 {
            fs::write(root.join(format!("cached_{i:04}.txt")), b"cached").unwrap();
        }
        let armed = Arc::new(AtomicBool::new(false));
        let holder: Arc<Mutex<Option<Arc<AtomicBool>>>> = Arc::new(Mutex::new(None));
        let trigger = armed.clone();
        let stop = holder.clone();
        let engine = Engine::open_with_events(
            temp.path().join("private_data/index.db"),
            Arc::new(move |event| {
                if event.name == "scan_progress" && trigger.swap(false, Ordering::AcqRel) {
                    stop.lock()
                        .unwrap()
                        .as_ref()
                        .unwrap()
                        .store(true, Ordering::Release);
                }
            }),
        )
        .unwrap();
        *holder.lock().unwrap() = Some(engine.inner.stop.clone());
        let id = engine.add_root(root.to_str().unwrap()).unwrap().root_id;
        let start = Instant::now();
        while engine.list_roots().unwrap()[0].status != "WATCHING_ACTIVE" {
            assert!(start.elapsed() < Duration::from_secs(15));
            std::thread::sleep(Duration::from_millis(20));
        }
        armed.store(true, Ordering::Release);
        engine.refresh_root(id).unwrap();
        let start = Instant::now();
        while !engine.inner.stop.load(Ordering::Acquire) {
            assert!(start.elapsed() < Duration::from_secs(15));
            std::thread::sleep(Duration::from_millis(20));
        }
        engine.shutdown();
        assert_eq!(
            engine
                .search(SearchParams {
                    query: "cached_".into(),
                    ..Default::default()
                })
                .unwrap()
                .total_matched,
            2200
        );
    }
}
