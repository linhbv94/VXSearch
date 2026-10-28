PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA recursive_triggers=ON;
PRAGMA busy_timeout=5000;
PRAGMA cache_size=-8192;
CREATE TABLE IF NOT EXISTS watched_roots (
 id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE,
 identity TEXT NOT NULL, alias TEXT, status TEXT NOT NULL,
 total_files INTEGER NOT NULL DEFAULT 0, total_size_bytes INTEGER NOT NULL DEFAULT 0,
 is_removable INTEGER NOT NULL, last_scan_at INTEGER, error_message TEXT,
 scan_generation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS files (
 id INTEGER PRIMARY KEY AUTOINCREMENT, root_id INTEGER NOT NULL REFERENCES watched_roots(id) ON DELETE CASCADE,
 path TEXT NOT NULL UNIQUE, parent_dir TEXT NOT NULL, name TEXT NOT NULL, name_fold TEXT NOT NULL,
 extension TEXT NOT NULL, file_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
 modified_at INTEGER NOT NULL, is_directory INTEGER NOT NULL, is_symlink INTEGER NOT NULL,
 search_text TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS files_root ON files(root_id,generation);
CREATE INDEX IF NOT EXISTS files_extension ON files(extension);
CREATE INDEX IF NOT EXISTS files_type ON files(file_type);
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(search_text,content='files',content_rowid='id',tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
 INSERT INTO files_fts(rowid,search_text) VALUES(new.id,new.search_text);
END;
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
 INSERT INTO files_fts(files_fts,rowid,search_text) VALUES('delete',old.id,old.search_text);
END;
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE OF search_text ON files WHEN old.search_text != new.search_text BEGIN
 INSERT INTO files_fts(files_fts,rowid,search_text) VALUES('delete',old.id,old.search_text);
 INSERT INTO files_fts(rowid,search_text) VALUES(new.id,new.search_text);
END;
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
PRAGMA user_version=1;
