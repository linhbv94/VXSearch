# 04. Kiến trúc Dữ liệu & IPC Contracts — VXSearch (`_spec4_api_data`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Tài liệu liên quan:** [00_system_overview.md](00_system_overview.md) | [02_feature_flow.md](02_feature_flow.md)

---

## 1. Mục đích & Phạm vi

Tài liệu này đặc tả toàn bộ kiến trúc cơ sở dữ liệu cục bộ SQLite (Local SQLite Persistence Schema), định nghĩa chỉ mục B-Tree và bảng ảo FTS5, các giao ước gọi hàm Tauri 2 IPC (Commands & Events), cấu trúc dữ liệu Rust/TypeScript đồng bộ và ma trận mã lỗi hệ thống.

---

## 2. Kiến trúc Cơ sở Dữ liệu Cục bộ (SQLite Persistence Schema)

### 2.1. Vị trí Lưu trữ CSDL & Chế độ Vận hành
- **Đường dẫn CSDL trên macOS:** `~/Library/Application Support/com.vxsearch.desktop/vxsearch.db`
- **Đường dẫn CSDL trên Windows:** `%APPDATA%\com.vxsearch.desktop\vxsearch.db`
- **Cấu hình Hiệu năng Cao (PRAGMA Settings):**
  ```sql
  PRAGMA journal_mode = WAL;          -- Kích hoạt Write-Ahead Logging để đọc và ghi đồng thời không bị khóa
  PRAGMA synchronous = NORMAL;        -- Giảm độ trễ fsync đĩa cứng mà vẫn bảo đảm toàn vẹn khi sập nguồn
  PRAGMA busy_timeout = 5000;         -- Chờ tối đa 5000ms nếu DB tạm bị khóa
  PRAGMA temp_store = MEMORY;         -- Lưu trữ bảng tạm và sắp xếp trong RAM
  PRAGMA cache_size = -64000;         -- Dành tối đa 64MB RAM làm bộ nhớ đệm trang CSDL
  PRAGMA foreign_keys = ON;           -- Kích hoạt ràng buộc khóa ngoại để bảo toàn toàn vẹn dữ liệu
  PRAGMA recursive_triggers = ON;     -- Đảm bảo trigger chạy chuẩn khi xóa/sửa cascade
  ```

### 2.2. Chi tiết Lược đồ Bảng (Table Schemas)

#### Bảng 1: `watched_roots` (Danh sách thư mục theo dõi)
```sql
CREATE TABLE IF NOT EXISTS watched_roots (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    path                 TEXT NOT NULL UNIQUE,              -- Đường dẫn hiển thị gốc
    normalized_path      TEXT NOT NULL UNIQUE,              -- Đường dẫn đã chuẩn hóa (canonical)
    alias                TEXT,                              -- Tên hiển thị tùy chọn (Mặc định là tên thư mục cuối, nullable)
    status               TEXT NOT NULL DEFAULT 'SCANNING_INITIAL', 
    -- Các giá trị status: 'SCANNING_INITIAL', 'WATCHING_ACTIVE', 'RECONCILING', 'UNAVAILABLE_OFFLINE', 'ERROR_ACCESS'
    volume_uuid          TEXT,                              -- Định danh phần cứng phân vùng (Hardware Volume UUID)
    mount_point          TEXT,                              -- Điểm mount hệ thống (vd: /Volumes/T7 hoặc D:\)
    relative_root_path   TEXT,                              -- Đường dẫn tương đối từ mount point
    scan_generation      INTEGER NOT NULL DEFAULT 0,        -- Số thế hệ quét tăng dần
    total_files          INTEGER NOT NULL DEFAULT 0,
    total_size_bytes     INTEGER NOT NULL DEFAULT 0,
    is_removable         BOOLEAN NOT NULL DEFAULT 0,        -- 1 nếu nằm trên ổ cứng ngoài / USB
    last_scan_at         INTEGER,                           -- Unix Epoch Timestamp (ms)
    last_scan_session_id TEXT,                              -- UUID phiên quét đối chiếu gần nhất
    error_message        TEXT,                              -- Mô tả lỗi nếu status == 'ERROR_ACCESS'
    created_at           INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at           INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_roots_normalized ON watched_roots(normalized_path);
CREATE INDEX IF NOT EXISTS idx_roots_status ON watched_roots(status);
CREATE INDEX IF NOT EXISTS idx_roots_volume ON watched_roots(volume_uuid);
```

#### Bảng 2: `files` (Danh mục tệp và thư mục đã lập chỉ mục)
```sql
CREATE TABLE IF NOT EXISTS files (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    root_id              INTEGER NOT NULL,
    path                 TEXT NOT NULL UNIQUE,              -- Đường dẫn tuyệt đối chuẩn hóa
    parent_dir           TEXT NOT NULL,                     -- Đường dẫn thư mục cha chứa tệp
    name                 TEXT NOT NULL,                     -- Tên tệp đầy đủ (kèm phần mở rộng)
    name_lower           TEXT NOT NULL,                     -- Tên tệp chuyển chữ thường (B-Tree index)
    name_unaccent        TEXT NOT NULL DEFAULT '',          -- Tên tệp bỏ dấu tiếng Việt (Tìm kiếm tiếng Việt không dấu)
    extension            TEXT NOT NULL DEFAULT '',          -- Phần mở rộng chữ thường không có dấu chấm (vd: 'pdf', 'rs')
    file_type            TEXT NOT NULL DEFAULT 'other',     -- 'document', 'image', 'video', 'audio', 'code', 'archive', 'other', 'directory'
    size_bytes           INTEGER NOT NULL DEFAULT 0,        -- Dung lượng tệp (bytes)
    modified_at          INTEGER NOT NULL DEFAULT 0,        -- mtime từ OS (Epoch ms)
    indexed_at           INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_seen_scan_id    TEXT,                              -- Dùng cho thuật toán quét đối chiếu delta
    is_directory         BOOLEAN NOT NULL DEFAULT 0,        -- 1 nếu là thư mục, 0 nếu là tệp
    is_symlink           BOOLEAN NOT NULL DEFAULT 0,        -- 1 nếu là liên kết tượng trưng
    FOREIGN KEY(root_id) REFERENCES watched_roots(id) ON DELETE CASCADE
);

-- Chỉ mục tối ưu hóa tốc độ truy vấn sub-10ms
CREATE INDEX IF NOT EXISTS idx_files_name_lower ON files(name_lower);
CREATE INDEX IF NOT EXISTS idx_files_name_unaccent ON files(name_unaccent);
CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
CREATE INDEX IF NOT EXISTS idx_files_root_parent ON files(root_id, parent_dir);
CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_scan_recon ON files(root_id, last_seen_scan_id);
```

#### Bảng 3: `files_fts` (Bảng ảo FTS5 Trigram Substring Search)
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    name,
    parent_dir,
    content='files',
    content_rowid='id',
    tokenize='trigram'                                     -- Tokenizer 3 ký tự tìm substring siêu tốc
);

-- Triggers tự động đồng bộ từ bảng files sang bảng ảo FTS5
CREATE TRIGGER IF NOT EXISTS trg_files_ai AFTER INSERT ON files BEGIN
    INSERT INTO files_fts(rowid, name, parent_dir) VALUES (new.id, new.name, new.parent_dir);
END;

CREATE TRIGGER IF NOT EXISTS trg_files_ad AFTER DELETE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, name, parent_dir) VALUES ('delete', old.id, old.name, old.parent_dir);
END;

-- TỐI ƯU HÓA: Chỉ kích hoạt Trigger UPDATE khi có thay đổi name hoặc parent_dir
-- Tránh rebuild FTS lãng phí khi chỉ cập nhật last_seen_scan_id, size_bytes hoặc modified_at trong quá trình đối chiếu!
CREATE TRIGGER IF NOT EXISTS trg_files_au AFTER UPDATE OF name, parent_dir ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, name, parent_dir) VALUES ('delete', old.id, old.name, old.parent_dir);
    INSERT INTO files_fts(rowid, name, parent_dir) VALUES (new.id, new.name, new.parent_dir);
END;
```
```

#### Bảng 4: `app_settings` (Cấu hình ứng dụng)
```sql
CREATE TABLE IF NOT EXISTS app_settings (
    key                  TEXT PRIMARY KEY,
    value_json           TEXT NOT NULL,
    updated_at           INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
```

---

## 3. Giao ước Tauri 2 IPC Commands (Rust Backend ⟷ React Frontend)

Mọi lệnh IPC đều trả về định dạng chuẩn: `Result<T, AppError>`.

### 3.1. Nhóm Lệnh Tìm kiếm & Trạng thái Hệ thống

#### Command: `get_system_status`
- **Mục đích:** Lấy thông tin tổng quan hệ thống, tổng số tệp đã index, dung lượng CSDL và trạng thái bộ quét.
- **Arguments:** Không có.
- **Return Type:**
  ```typescript
  interface SystemStatus {
    total_roots: number;
    total_files: number;
    total_size_bytes: number;
    db_size_bytes: number;
    is_any_scanning: boolean;
    platform: "macos" | "windows";
    app_version: string;
  }
  ```

#### Command: `search_files`
- **Mục đích:** Thực thi truy vấn tìm kiếm tệp tức thì có phân trang và bộ lọc.
- **Arguments:**
  ```typescript
  interface SearchQueryPayload {
    query: string;                       // Chuỗi tìm kiếm người dùng nhập
    filter_type?: "all" | "document" | "image" | "video" | "audio" | "code" | "archive";
    root_id?: number | null;             // Lọc theo một thư mục cụ thể (tùy chọn)
    sort_by?: "relevance" | "name_asc" | "size_desc" | "modified_desc"; // Mặc định 'relevance'
    limit: number;                       // Mặc định 50
    offset: number;                      // Mặc định 0
  }
  ```
- **Return Type:**
  ```typescript
  interface SearchResultItemDto {
    id: number;
    root_id: number;
    path: string;
    parent_dir: string;
    name: string;
    extension: string;
    file_type: string;
    size_bytes: number;
    modified_at: number;                // Epoch ms
    is_directory: boolean;
    is_offline: boolean;                // true nếu thư mục gốc đang ở ổ ngoài bị ngắt (JOIN từ watched_roots)
  }

  interface SearchResponse {
    items: SearchResultItemDto[];
    total_matched: number;
    took_ms: number;
  }
  ```

### 3.2. Nhóm Lệnh Quản lý Thư mục Theo dõi

#### Command: `get_watched_roots`
- **Mục đích:** Lấy toàn bộ danh sách các thư mục đang theo dõi kèm trạng thái chi tiết.
- **Return Type:**
  ```typescript
  interface WatchedRootItem {
    id: number;
    path: string;
    alias: string | null;               // Nullable (Mặc định lấy tên thư mục cuối)
    status: "SCANNING_INITIAL" | "WATCHING_ACTIVE" | "RECONCILING" | "UNAVAILABLE_OFFLINE" | "ERROR_ACCESS";
    total_files: number;
    total_size_bytes: number;
    is_removable: boolean;
    last_scan_at: number | null;
    error_message: string | null;
  }
  ```

#### Command: `add_watched_root`
- **Mục đích:** Thêm một thư mục vào danh sách theo dõi sau khi kiểm tra lồng nhau.
- **Arguments:** `{ path: string }`
- **Return Type:**
  ```typescript
  interface AddRootResponse {
    success: boolean;
    root_id: number;
    status: string;
  }
  ```
- **Lỗi có thể trả về:**
  - `E_EXACT_DUPLICATE`: Thư mục đã có trong danh sách.
  - `E_CHILD_OF_EXISTING`: Thư mục con của một root đã tồn tại.
  - `E_PARENT_OF_EXISTING`: Thư mục cha bao trùm một hoặc nhiều root hiện có (trả về kèm mảng `covered_root_ids`).
  - `E_PATH_NOT_FOUND`: Đường dẫn không tồn tại.

#### Command: `confirm_merge_roots`
- **Mục đích:** Xác nhận hợp nhất các thư mục con vào thư mục cha bao trùm trong 1 transaction an toàn.
- **Arguments:**
  ```typescript
  interface ConfirmMergeRootsPayload {
    parent_path: string;
    covered_root_ids: number[];
  }
  ```
- **Return Type:** `{ success: boolean, new_root_id: number }`

#### Command: `relink_watched_root`
- **Mục đích:** Định vị lại đường dẫn mới cho một thư mục bị chuyển ổ hoặc đổi tên.
- **Arguments:** `{ root_id: number, new_path: string }`
- **Return Type:** `{ success: boolean }`

#### Command: `remove_watched_root`
- **Mục đích:** Ngừng theo dõi và xóa sạch chỉ mục của thư mục đó khỏi SQLite.
- **Arguments:** `{ root_id: number }`
- **Return Type:** `{ success: boolean, removed_files_count: number }`

#### Command: `refresh_watched_root`
- **Mục đích:** Kích hoạt quét đối chiếu delta thủ công cho một thư mục.
- **Arguments:** `{ root_id: number }`
- **Return Type:** `{ success: boolean, status: "RECONCILING" }`

### 3.3. Nhóm Lệnh Thao tác Tệp Native

#### Command: `reveal_file`
- **Mục đích:** Mở Finder (macOS) hoặc File Explorer (Windows) và bôi đen chọn đúng tệp.
- **Arguments:** `{ path: string }`
- **Return Type:** `{ success: boolean }`
- **Lỗi:** 
  - `E_ROOT_OFFLINE`: Thư mục gốc nằm trên ổ ngoài đang ngắt kết nối (CẤM xóa bản ghi).
  - `E_STALE_FILE`: Tệp không còn tồn tại trên đĩa cứng và Root đang online (Đã xóa an toàn khỏi SQLite).

#### Command: `open_file`
- **Mục đích:** Mở tệp bằng ứng dụng mặc định của hệ điều hành.
- **Arguments:** `{ path: string }`
- **Return Type:** `{ success: boolean }`

#### Command: `copy_file_path`
- **Mục đích:** Sao chép đường dẫn tuyệt đối của tệp vào clipboard hệ thống.
- **Arguments:** `{ path: string }`
- **Return Type:** `{ success: boolean }`

### 3.4. Nhóm Lệnh Cài đặt (Settings) & Bảo trì

#### Command: `get_settings`
- **Return Type:**
  ```typescript
  interface AppSettings {
    global_hotkey: string;              // macOS: "CommandOrControl+Shift+F", Windows: "Alt+Shift+F"
    close_to_tray: boolean;             // Mặc định true
    auto_select_input: boolean;         // Mặc định true
    start_at_login: boolean;            // P1 feature (mặc định false)
    debounce_ms: number;                // Mặc định 300
    theme: "dark" | "light" | "system"; // Mặc định "dark"
  }
  ```

#### Command: `update_settings`
- **Arguments:** `Partial<AppSettings>`
- **Return Type:** `{ success: boolean }`

#### Command: `reset_settings`
- **Mục đích:** Khôi phục cấu hình mặc định ban đầu của ứng dụng.
- **Return Type:** `AppSettings`

#### Command: `vacuum_database`
- **Mục đích:** Chạy lệnh SQLite `VACUUM` để dọn dẹp phân mảnh và thu hồi dung lượng đĩa.
- **Return Type:**
  ```typescript
  interface VacuumDbResponse {
    success: boolean;
    db_size_before_bytes: number;
    db_size_after_bytes: number;
  }
  ```

---

## 4. Giao ước Tauri 2 Events (Backend Rust ──► Frontend React)

Các sự kiện được phát bất đồng bộ từ luồng nền Rust qua kênh `app_handle.emit()`:

| Tên Sự kiện (Event Name) | Payload Schema | Tần suất / Điều kiện kích hoạt |
|:---|:---|:---|
| `scan_progress` | `{ root_id: number, current_path: string, scanned_count: number }` | Phát định kỳ mỗi 2,000 tệp trong lúc quét đệ quy ban đầu. |
| `scan_completed` | `{ root_id: number, total_files: number, total_size_bytes: number, duration_ms: number }` | Phát ngay khi quét xong một Root và chuyển sang `WATCHING_ACTIVE`. |
| `index_changed` | `{ affected_roots: number[], delta_count: number }` | Phát sau khi gom sự kiện thay đổi I/O (Tiết lưu tối đa 10Hz). |
| `root_status_changed` | `{ root_id: number, new_status: string, message?: string }` | Phát khi ổ ngoài bị rút (`UNAVAILABLE_OFFLINE`) hoặc có lỗi I/O. |

---

## 5. Cấu trúc Rust Models & DTOs (`src-tauri/src/db/models.rs`)

```rust
use serde::{Deserialize, Serialize};

/// Entity đại diện bản ghi trong bảng `watched_roots`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedRootEntity {
    pub id: i64,
    pub path: String,
    pub normalized_path: String,
    pub alias: Option<String>,
    pub status: String,
    pub volume_uuid: Option<String>,
    pub mount_point: Option<String>,
    pub relative_root_path: Option<String>,
    pub scan_generation: i64,
    pub total_files: i64,
    pub total_size_bytes: i64,
    pub is_removable: bool,
    pub last_scan_at: Option<i64>,
    pub error_message: Option<String>,
}

/// Entity đại diện bản ghi trong bảng `files` (Persistence Model)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntity {
    pub id: i64,
    pub root_id: i64,
    pub path: String,
    pub parent_dir: String,
    pub name: String,
    pub name_lower: String,
    pub name_unaccent: String,
    pub extension: String,
    pub file_type: String,
    pub size_bytes: i64,
    pub modified_at: i64,
    pub indexed_at: i64,
    pub last_seen_scan_id: Option<String>,
    pub is_directory: bool,
    pub is_symlink: bool,
}

/// DTO trả về cho Frontend qua Tauri IPC (Result Item DTO)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItemDto {
    pub id: i64,
    pub root_id: i64,
    pub path: String,
    pub parent_dir: String,
    pub name: String,
    pub extension: String,
    pub file_type: String,
    pub size_bytes: i64,
    pub modified_at: i64,
    pub is_directory: bool,
    pub is_offline: bool, // Được tính toán qua JOIN với bảng watched_roots
}

/// DTO phản hồi truy vấn tìm kiếm
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub items: Vec<SearchResultItemDto>,
    pub total_matched: usize,
    pub took_ms: f64,
}

/// Định nghĩa lỗi hệ thống chuẩn hóa (AppError)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}
```

---

## 6. Ma trận Mã Lỗi Hệ thống (System Error Code Matrix)

| Mã Lỗi | Tên Lỗi Chuẩn Hóa | Mô tả Chi tiết | Cách xử lý phía Giao diện (Frontend) |
|:---|:---|:---|:---|
| `E_EXACT_DUPLICATE` | Thư mục trùng lặp | Người dùng chọn đúng thư mục đã tồn tại trong danh sách. | Hiển thị Toast thông tin: `"Thư mục này đã có trong danh sách theo dõi."` |
| `E_CHILD_OF_EXISTING`| Thư mục con của root có sẵn | Người dùng thêm thư mục con trong khi thư mục cha đã được theo dõi. | Toast cảnh báo nhẹ: `"Thư mục này đã nằm trong phạm vi theo dõi của [Thư mục cha]."` |
| `E_PARENT_OF_EXISTING`| Thư mục cha bao trùm | Thư mục mới chọn bao trùm các root con đang có. | Bật Modal xác nhận: Hỏi người dùng có muốn gộp các root con vào root cha không. |
| `E_PATH_NOT_FOUND` | Không tìm thấy đường dẫn | Đường dẫn không tồn tại hoặc không thể truy cập. | Toast lỗi đỏ: `"Không tìm thấy đường dẫn thư mục đã chọn."` |
| `E_ROOT_OFFLINE` | Thư mục gốc ngoại tuyến | Ổ cứng ngoài chứa tệp đang bị ngắt kết nối. | Toast cảnh báo vàng: `"Không thể mở tệp: Ổ cứng ngoài đang bị ngắt kết nối."` |
| `E_STALE_FILE` | Tệp không còn tồn tại | Tệp vừa bị xóa ngoài đĩa trước khi bấm Mở hoặc Reveal. | Toast cảnh báo: `"Tệp không còn tồn tại trên đĩa cứng. Đã cập nhật kết quả."` Tự làm mới dòng. |
| `E_ACCESS_DENIED` | Quyền truy cập bị từ chối | Hệ điều hành chặn quyền đọc thư mục (EACCES). | Ghi nhận huy hiệu cảnh báo trên thẻ thư mục. |
| `E_HOTKEY_OCCUPIED` | Phím tắt bị chiếm dụng | Phím tắt toàn cục đã bị ứng dụng khác đăng ký trước. | Toast cảnh báo và tự động fallback sang phím tắt dự phòng (`Ctrl+Alt+F`). |
| `E_DB_BUSY` | Cơ sở dữ liệu bận | SQLite đang bận xử lý transaction lớn. | Chờ retry tự động theo `busy_timeout (5000ms)`; không làm sập ứng dụng. |
