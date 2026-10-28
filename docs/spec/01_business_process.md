# 01. Quy trình Nghiệp vụ — VXSearch (`_spec1_business_process`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Tài liệu liên quan:** [00_system_overview.md](00_system_overview.md) | [02_feature_flow.md](02_feature_flow.md)

---

## 1. Mục đích & Phạm vi Nghiệp vụ

Tài liệu này chuẩn hóa toàn bộ các quy trình nghiệp vụ ở cấp độ **Vĩ mô (Macro Business Processes)** của VXSearch, mô tả sự phối hợp chặt chẽ giữa 5 chủ thể (Actors & Systems):
1. **Người dùng (User):** Thao tác chuột, gõ từ khóa tìm kiếm, phím tắt toàn cục và quản lý danh mục thư mục.
2. **Giao diện VXSearch (Presentation UI — React):** Hiển thị thanh tìm kiếm, danh sách kết quả ảo hóa, thông báo trạng thái quét và hộp thoại cài đặt.
3. **Bộ điều phối Chỉ mục & Truy vấn (Coordinator & Indexer — Rust):** Chuẩn hóa đường dẫn, kiểm tra lồng nhau, gom sự kiện (debounce), thực thi truy vấn SQLite và bảo đảm an toàn dữ liệu.
4. **Bộ Giám sát & Đối chiếu (Watcher & Reconciler — Rust):** Lắng nghe sự kiện FSEvents/ReadDirectoryChangesW, phát hiện ngắt kết nối ổ đĩa ngoài, và quét đối chiếu delta khi ứng dụng khởi động lại.
5. **Hệ điều hành & File Manager (OS Shell — macOS Finder / Windows Explorer):** Cung cấp API duyệt cây thư mục, hộp thoại chọn folder, và thực thi lệnh mở tệp / bôi đen tệp (Reveal in Finder/Explorer).

---

## 2. Mô hình SIPOC (Supplier — Input — Process — Output — Customer)

### 2.1. SIPOC 1: Quy trình Thêm Thư mục & Quét Lập Chỉ mục Ban đầu (Add Watched Root & Initial Scan)
- **Supplier (Nhà cung cấp):** Người dùng, Hệ thống tệp OS (Hộp thoại chọn thư mục native).
- **Input (Đầu vào):** Đường dẫn thư mục được chọn từ hộp thoại hoặc kéo thả; danh sách các thư mục hiện có trong CSDL.
- **Process (Quy trình):**
  1. Người dùng bấm `[+ Thêm thư mục]` hoặc kéo thả một folder vào giao diện.
  2. Giao diện gửi lệnh `add_watched_root(path)` xuống Backend Rust qua Tauri IPC.
  3. Coordinator chuẩn hóa đường dẫn tuyệt đối (Canonicalized path), giải quyết symlink và đối chiếu với danh sách Roots hiện có để loại trừ trùng lặp hoặc lồng nhau.
  4. Nếu hợp lệ: Thêm bản ghi vào bảng `watched_roots` với trạng thái `SCANNING_INITIAL`, lưu trữ `volume_uuid` / `mount_point` để định danh phân vùng phần cứng.
  5. **Đăng ký Watcher trước (Pre-watch Stream):** Đăng ký ngay đường dẫn với `notify::RecommendedWatcher` trước khi bắt đầu duyệt đệ quy; mọi sự kiện I/O phát sinh trong quá trình quét được tạm đưa vào Replay buffer.
  6. Kích hoạt luồng quét nền (Background Worker) sử dụng `walkdir` để duyệt đệ quy cây thư mục.
  7. Với mỗi tệp/thư mục: Thu thập metadata (tên, phần mở rộng, dung lượng, thời gian sửa đổi) mà tuyệt đối không đọc nội dung bên trong tệp.
  8. Gom dữ liệu theo từng khối (Chunks 2,000 tệp) và ghi hàng loạt vào bảng `files` qua SQLite Transaction sử dụng cú pháp UPSERT (`ON CONFLICT(path) DO UPDATE`).
  9. Phát sự kiện tiến độ `scan_progress` (`{ root_id, current_path, scanned_count }`) lên UI.
  10. Áp dụng Replay buffer các sự kiện I/O ghi nhận được trong lúc duyệt.
  11. Khi quét xong trọn vẹn: Cập nhật trạng thái Root thành `WATCHING_ACTIVE`.
- **Output (Đầu ra):** Thư mục được thêm vào danh sách theo dõi; toàn bộ tệp con được lập chỉ mục trong SQLite; trạng thái hiển thị sẵn sàng tìm kiếm.
- **Customer (Người thụ hưởng):** Người dùng (có thể tìm kiếm ngay lập tức toàn bộ tệp trong thư mục vừa thêm).

### 2.2. SIPOC 2: Quy trình Theo dõi Thay đổi Hệ thống Tệp & Cập nhật Tức thì (Real-time Watch & Debounced Indexing)
- **Supplier (Nhà cung cấp):** Hệ thống tệp OS (FSEvents trên macOS, ReadDirectoryChangesW trên Windows).
- **Input (Đầu vào):** Các sự kiện I/O hệ thống tệp (`Create`, `Modify`, `Remove`, `Rename`).
- **Process (Quy trình):**
  1. Thư viện `notify` bắt các sự kiện I/O thô từ kernel và đẩy vào kênh Bounded MPSC Queue (tối đa 50,000 events) trong RAM. Nếu hàng đợi bị tràn: Đánh dấu Root `has_gap = true` và lên lịch quét đối chiếu delta (deadline tối đa 5 giây).
  2. Module Debouncer gom các sự kiện trong cửa sổ trượt 300ms (tối đa trì hoãn cứng 1000ms khi có bão sự kiện liên tục).
  3. Rút gọn chuỗi sự kiện có đối chiếu CSDL:
     - Tạo rồi xóa trong cùng 300ms: Triệt tiêu nếu tệp chưa từng có trong DB; chuyển thành `DeleteRecord` nếu tệp đã tồn tại từ trước.
     - Sửa liên tiếp: Gộp thành 1 thao tác `UpdateMetadata` tại thời điểm cuối.
     - Atomic save (Text editor ghi `.tmp` rồi rename đè): Chuyển thành `UpdateMetadata` thay vì Delete + Insert.
  4. Mở các Transaction SQLite WAL theo mẻ (Batch tối đa 2,000 operations/transaction):
     - Tệp mới: Chèn bản ghi vào bảng `files` qua UPSERT.
     - Tệp bị xóa: Xóa bản ghi tương ứng khỏi bảng `files` và FTS.
     - Tệp bị đổi tên/di chuyển: Cập nhật lại `name`, `path` và `parent_dir`. Nếu là đổi tên thư mục cha: Cập nhật đường dẫn tiền tố cho toàn bộ cây con.
     - Tệp bị sửa đổi: Cập nhật `size_bytes` và `modified_at` (Trigger SQLite chỉ cập nhật FTS khi đổi tên/đường dẫn).
  5. Đóng transaction và phát tín hiệu `index_changed` (tiết lưu tối đa 10 lần/giây) lên UI.
- **Output (Đầu ra):** Chỉ mục SQLite phản ánh chính xác 100% hiện trạng đĩa cứng; giao diện người dùng tự làm mới nếu kết quả đang tìm kiếm chịu ảnh hưởng; không gây giật lag hệ thống.
- **Customer (Người thụ hưởng):** Người dùng (không bao giờ phải bấm F5 hay quét lại thủ công khi có tệp mới).

### 2.3. SIPOC 3: Quy trình Tìm kiếm Nhanh & Định vị / Mở Tệp (Instant Search & Reveal Action)
- **Supplier (Nhà cung cấp):** Người dùng (Gõ từ khóa, chọn bộ lọc loại tệp, bấm phím tắt).
- **Input (Đầu vào):** Chuỗi truy vấn (`query`), Filter Chips (All, Documents, Images, Videos, Code, Archives), Root Filter ID, Giới hạn phân trang (`limit = 50`, `offset = 0`).
- **Process (Quy trình):**
  1. Người dùng nhập ký tự vào thanh tìm kiếm (hoặc nhấn phím tắt toàn cục để bật cửa sổ).
  2. Giao diện React áp dụng debounce 50ms rồi gọi command `search_files`.
  3. Backend Rust phân tích chuỗi tìm kiếm theo Grammar chuẩn:
     - Nếu có đuôi mở rộng dạng `.pdf`, `.rs`, `.png`: Tự động trích xuất điều kiện lọc `extension`.
     - Nếu truy vấn ngắn (1–2 ký tự): Thực thi truy vấn B-Tree Index trên `name_lower`.
     - Nếu truy vấn từ 3 ký tự trở lên: Thực thi truy vấn SQLite FTS5 trigram kết hợp JOIN bảng `files` trên `rowid = files.id` (tìm cả tên tệp và đường dẫn `parent_dir`).
  4. Truy vấn trả về danh sách kết quả (tối đa 50 mục đầu tiên kèm tổng số lượng khớp `total_matched` và `took_ms`).
  5. Giao diện kích hoạt `@tanstack/react-virtual` để render danh sách kết quả mượt mà.
  6. Người dùng chọn một dòng kết quả và thực hiện hành động:
     - Bấm phím `Enter` (hoặc đúp chuột): Gọi `open_file(path)` để mở bằng ứng dụng mặc định của hệ điều hành.
     - Bấm phím `Cmd+Enter` (macOS) / `Ctrl+Enter` (Windows): Gọi `reveal_file(path)`.
     - Bấm phím `Cmd+C` / `Ctrl+C`: Sao chép đường dẫn tệp vào clipboard.
  7. Backend kiểm tra tính khả dụng của tệp:
     - Kiểm tra trạng thái Root: Nếu Root đang `UNAVAILABLE_OFFLINE`, từ chối thao tác và báo lỗi `E_ROOT_OFFLINE`.
     - Gọi `fs::metadata(&path)`:
       - Nếu thành công: Gọi API hệ thống để mở Finder/Explorer và tự động bôi đen chọn đúng tệp.
       - Nếu trả về `ErrorKind::NotFound` VÀ Root đang `ONLINE_ACTIVE`: Xóa an toàn bản ghi stale khỏi SQLite và trả mã lỗi `E_STALE_FILE`.
       - Nếu gặp lỗi quyền: Trả lỗi `E_ACCESS_DENIED`, tuyệt đối không xóa bản ghi.
- **Output (Đầu ra):** Kết quả hiển thị tức thì; tệp được mở hoặc hiển thị trực quan trong File Manager của hệ điều hành.
- **Customer (Người thụ hưởng):** Người dùng (tiết kiệm thời gian tìm kiếm thủ công, truy cập tệp trong 1 giây).

### 2.4. SIPOC 4: Quy trình Quét Đối chiếu khi Mở lại Ứng dụng hoặc Cắm lại Ổ đĩa ngoài (Reconciliation & Recovery)
- **Supplier (Nhà cung cấp):** Người dùng (Khởi động lại máy, mở lại VXSearch, hoặc cắm lại ổ cứng di động).
- **Input (Đầu vào):** Danh sách `watched_roots` đã lưu trong SQLite; trạng thái kết nối phần cứng đĩa cứng.
- **Process (Quy trình):**
  1. Khi ứng dụng khởi động (Cold Start) hoặc thức giấc (Wake/Resume): Luôn kích hoạt kiểm tra đối chiếu (không phụ thuộc ngưỡng 60 giây).
  2. Hệ thống kiểm tra từng đường dẫn Root:
     - So khớp `volume_uuid` / `mount_point` để xác thực danh tính phân vùng phần cứng chính xác, tránh nhầm ổ khác cùng mount path.
     - Nếu phân vùng không khả dụng: Đánh dấu trạng thái Root là `UNAVAILABLE_OFFLINE`. Tuyệt đối không xóa chỉ mục.
     - Nếu phân vùng khả dụng: Tạo mã phiên quét mới (`scan_session_id = UUIDv4`), chuyển trạng thái Root sang `RECONCILING`.
  3. Đăng ký watcher `notify` TRƯỚC KHI quét để thu thập các sự kiện đồng thời vào Replay buffer.
  4. Luồng nền thực hiện quét duyệt nhanh (Reconciliation Walk via `walkdir`):
     - Duyệt cây thư mục và so khớp `(path, size, modified_at)` giữa đĩa cứng và bản ghi SQLite.
     - Mọi tệp quan sát được (tệp không đổi, tệp mới, tệp cập nhật) ĐỀU ĐƯỢC GÁN `last_seen_scan_id = scan_session_id`.
  5. Xử lý Replay buffer để cập nhật các biến động I/O xảy ra trong lúc scan.
  6. **Cơ chế Purge Guard An toàn:**
     - CHỈ KHI toàn bộ cây thư mục được duyệt thành công trọn vẹn (`scan_state == COMPLETED_SUCCESS`), hệ thống mới thực thi dọn dẹp:
       ```sql
       DELETE FROM files 
       WHERE root_id = ? 
         AND (last_seen_scan_id != ? OR last_seen_scan_id IS NULL);
       ```
     - NẾU GẶP LỖI (EACCES ở bất kỳ thư mục con nào, tháo ổ giữa chừng, hoặc người dùng hủy quét): **CẤM PURGE TOÀN ROOT**, giữ nguyên trạng thái chỉ mục hiện có để bảo toàn dữ liệu.
  7. Cập nhật `last_scan_at = now()`, chuyển trạng thái Root thành `WATCHING_ACTIVE`.
- **Output (Đầu ra):** Dữ liệu chỉ mục được đồng bộ hoàn hảo với hệ thống tệp thực tế mà không cần xóa trắng database; không mất chỉ mục của ổ đĩa ngoài khi bị tháo rời tạm thời.
- **Customer (Người thụ hưởng):** Người dùng (sự tin cậy tuyệt đối vào kết quả tìm kiếm, không sợ sai lệch dữ liệu).

---

## 3. Sơ đồ Phối hợp Quy trình (Swimlane Diagrams — BPMN 2.0 Format)

### 3.1. Sơ đồ Swimlane 1: Thêm Thư mục & Quét Lập Chỉ mục Ban đầu

```text
+-------------------+----------------------+------------------------+---------------------+-------------------+
| Người dùng (User) | Giao diện (React UI) | Coordinator (Rust IPC) | Indexer & Watcher   | SQLite Database   |
+-------------------+----------------------+------------------------+---------------------+-------------------+
| 1. Bấm [+ Thêm]   |                      |                        |                     |                   |
|    hoặc kéo folder|                      |                        |                     |                   |
| ─────────────────>│                      |                        |                     |                   |
|                   | 2. Mở dialog chọn /  |                        |                     |                   |
|                   |    gửi add_root(path)|                        |                     |                   |
|                   | ────────────────────>│                        |                     |                   |
|                   |                      | 3. Chuẩn hóa path &    |                     |                   |
|                   |                      |    kiểm tra lồng nhau  |                     |                   |
|                   |                      |    (Check overlaps)    |                     |                   |
|                   |                      | ───────────────────────────────────────────>│ Đọc roots hiện có |
|                   |                      | <───────────────────────────────────────────│ Trả về danh sách  |
|                   |                      |                        |                     |                   |
|                   |                      | [Nếu trùng/lồng nhau]  |                     |                   |
|                   |                      | ───> Báo lỗi / Hỏi gộp |                     |                   |
|                   |                      |                        |                     |                   |
|                   |                      | [Nếu hợp lệ]           |                     |                   |
|                   |                      | 4. Tạo Root record     |                     |                   |
|                   |                      |    (SCANNING_INITIAL) ─────────────────────>│ Ghi bảng roots    |
|                   |                      | 5. Spawn background    |                     |                   |
|                   |                      |    worker thread ─────>│ 6. walkdir duyệt cây|                   |
|                   |                      |                        │    thư mục đệ quy   |                   |
|                   |                      |                        │ 7. Gom chunk 5,000  |                   |
|                   |                      |                        │    files metadata ─>│ BEGIN TRANSACTION |
|                   |                      |                        │                     │ INSERT INTO files |
|                   |                      |                        │                     │ COMMIT            |
|                   |                      |                        │ 8. Emit tiến độ     |                   |
|                   | <────────────────────┼────────────────────────┼─── (scan_progress)  |                   |
|                   | 9. Cập nhật progress |                        |                     |                   |
|                   |    bar & file count  |                        |                     |                   |
|                   |                      |                        │ 10. Hoàn tất scan:  |                   |
|                   |                      |                        │     Đăng ký notify  |                   |
|                   |                      |                        │     watcher stream  |                   |
|                   |                      |                        │ 11. Đổi status thành|                   |
|                   |                      |                        │     WATCHING_ACTIVE─>│ UPDATE roots SET  |
|                   | <────────────────────┼────────────────────────┼─────────────────────│ status = 'ACTIVE' |
|                   | 12. Ẩn progress bar, |                        |                     |                   |
|                   |     hiện trạng thái  |                        |                     |                   |
|                   |     Sẵn sàng tìm kiếm|                        |                     |                   |
+-------------------+----------------------+------------------------+---------------------+-------------------+
```

### 3.2. Sơ đồ Swimlane 2: Nhận diện Thay đổi Thời gian thực & Chống Bão Sự kiện

```text
+-------------------+----------------------+------------------------+---------------------+-------------------+
| File System (OS)  | notify Watcher Crate | Debouncer Engine (RAM) | Coordinator (Rust)  | SQLite & React UI |
+-------------------+----------------------+------------------------+---------------------+-------------------+
| 1. Thao tác I/O   |                      |                        |                     |                   |
|    (Tạo/Sửa/Xóa/  |                      |                        |                     |                   |
|    Đổi tên tệp)   |                      |                        |                     |                   |
| ─────────────────>│ 2. FSEvents /        |                        |                     |                   |
|                   |    ReadDirectory     |                        |                     |                   |
|                   |    bắt sự kiện raw   |                        |                     |                   |
|                   | ────────────────────>│ 3. Đẩy vào MPSC buffer |                     |                   |
|                   |                      |    (Sliding window     |                     |                   |
|                   |                      |     debounce 300ms)    |                     |                   |
| [Bão sự kiện:     |                      |                        |                     |                   |
|  10,000 events]──>│ ────────────────────>│ 4. Gom nhóm, lọc bỏ    |                     |                   |
|                   |                      |    các sự kiện triệt   |                     |                   |
|                   |                      |    tiêu (Tạo rồi xóa,  |                     |                   |
|                   |                      |    sửa liên tục)       |                     |                   |
|                   |                      | 5. Hết 300ms tĩnh lặng |                     |                   |
|                   |                      |    hoặc chạm trần 1s   |                     |                   |
|                   |                      | ──────────────────────>│ 6. Nhận mảng        |                   |
|                   |                      |                        │    delta đã rút gọn |                   |
|                   |                      |                        │ 7. Mở một Transaction duy nhất:          |
|                   |                      |                        │ ───────────────────>│ BEGIN TRANSACTION |
|                   |                      |                        │                     │ Bulk INSERT/UPDATE|
|                   |                      |                        │                     │ Bulk DELETE       |
|                   |                      |                        │                     │ COMMIT (WAL)      |
|                   |                      |                        │ 8. Tiết lưu (Throttled max 10Hz):       |
|                   |                      |                        │ ───────────────────>│ Bắn index_changed |
|                   |                      |                        │                     │ UI làm mới bảng   |
+-------------------+----------------------+------------------------+---------------------+-------------------+
```

### 3.3. Sơ đồ Swimlane 3: Tìm kiếm Tức thì & Mở Tệp / Reveal Chuẩn Native

```text
+-------------------+----------------------+------------------------+---------------------+-------------------+
| Người dùng (User) | Giao diện (React UI) | Tauri IPC Bridge (Rust)| SQLite Database     | OS File Manager   |
+-------------------+----------------------+------------------------+---------------------+-------------------+
| 1. Gõ từ khóa     |                      |                        |                     |                   |
|    "report 2026"  |                      |                        |                     |                   |
| ─────────────────>│ 2. Debounce 50ms     |                        |                     |                   |
|                   |    gọi search_files()|                        |                     |                   |
|                   | ────────────────────>│ 3. Parse query:        |                     |                   |
|                   |                      |    Trích xuất từ khóa  |                     |                   |
|                   |                      |    & filter loại tệp   |                     |                   |
|                   |                      | 4. Thực thi truy vấn   |                     |                   |
|                   |                      |    (B-Tree / FTS5) ───>│ SELECT * FROM files |                   |
|                   |                      |                        │ WHERE name MATCH ...|                   |
|                   |                      | <──────────────────────│ Trả về 50 rows (<8ms)                   |
|                   | <────────────────────│ 5. Trả kết quả IPC     |                     |                   |
|                   | 6. Render ảo hóa     |                        |                     |                   |
|                   |    60fps qua Virtual |                        |                     |                   |
|                   |    List Component    |                        |                     |                   |
|                   |                      |                        |                     |                   |
| 7. Chọn dòng tệp  |                      |                        |                     |                   |
|    và nhấn        |                      |                        |                     |                   |
|    Cmd+Enter      |                      |                        |                     |                   |
|    (Reveal File)  |                      |                        |                     |                   |
| ─────────────────>│ 8. Gọi command       |                        |                     |                   |
|                   |    reveal_file(path) |                        |                     |                   |
|                   | ────────────────────>│ 9. Kiểm tra file tồn   |                     |                   |
|                   |                      |    tại: path.exists()  |                     |                   |
|                   |                      | [Nếu còn tồn tại]      |                     |                   |
|                   |                      | 10. Kích hoạt native:  |                     |                   |
|                   |                      |     Mac: open -R       |                     |                   |
|                   |                      |     Win: explorer /sel ────────────────────>│ 11. Mở Finder/    |
|                   |                      |                        |                     |     Explorer &    |
|                   |                      |                        |                     |     highlight file|
|                   |                      | [Nếu file đã mất]      |                     |                   |
|                   |                      | ──> Trả mã lỗi E_STALE |                     |                   |
|                   | <────────────────────│                        |                     |                   |
|                   | 12. Toast báo lỗi nhẹ|                        |                     |                   |
|                   |     & cập nhật row   |                        |                     |                   |
+-------------------+----------------------+------------------------+---------------------+-------------------+
```

---

## 4. Ma trận Quyết định Nghiệp vụ (Decision Matrices)

### 4.1. Ma trận Quyết định 1: Xử lý Thư mục Lồng nhau & Trùng lặp (Folder Nesting Policy)

| Kịch bản Đầu vào | Trạng thái Hiện tại | Hành vi Hệ thống & Quy trình Transaction An Toàn | Thông báo cho Người dùng |
|:---|:---|:---|:---|
| Người dùng thêm thư mục `/A` khi `/A` đã có trong danh sách | `/A` đang ở bất kỳ trạng thái nào | Từ chối thêm mới; không tạo thêm bản ghi hay watcher trùng lặp. | `"Thư mục này đã có trong danh sách theo dõi."` (Toast Thông tin) |
| Người dùng thêm thư mục con `/A/B` khi thư mục cha `/A` đã được theo dõi | `/A` đang `ACTIVE` hoặc `SCANNING` | Từ chối thêm mới; cây thư mục con `/A/B` vốn đã được bao trùm bởi `/A`. | `"Thư mục này đã nằm trong phạm vi theo dõi của [A]."` (Toast Nhẹ) |
| Người dùng thêm thư mục cha `/A` khi thư mục con `/A/B` đã tồn tại từ trước | `/A/B` đang `ACTIVE` trong danh sách | Hiển thị hộp thoại xác nhận hợp nhất (Merge Confirmation Modal), trả về mã `E_PARENT_OF_EXISTING` kèm danh sách ID root con bị bao trùm. | `"Thư mục [A] bao trùm thư mục [A/B] đang có. Bạn có muốn gộp vào thư mục cha không?"` |
| Người dùng bấm "Đồng ý gộp" ở kịch bản trên | `/A/B` đang `ACTIVE` | Gọi IPC chuyên biệt `confirm_merge_roots(parent_path, covered_root_ids)`. Thực thi trong 1 SQLite Transaction duy nhất: (1) Tạm dừng watcher và worker cũ của `/A/B`; (2) Tạo bản ghi Root cha `/A`; (3) Cập nhật chuyển giao `root_id` của các tệp hiện có (`UPDATE files SET root_id = new_root_id WHERE root_id IN (...)`); (4) Xóa bản ghi Root con `/A/B` (`DELETE FROM watched_roots WHERE id IN (...)` mà không kích hoạt cascade xóa nhầm files); (5) Đăng ký watcher cho Root cha; (6) Quét đệ quy bổ sung các nhánh còn lại của `/A`. | Hiển thị tiến độ quét bổ sung của Root cha `/A`. |
| Người dùng bấm "Hủy" ở kịch bản trên | `/A/B` đang `ACTIVE` | Hủy bỏ thao tác gộp; giữ nguyên Root `/A/B` hiện có. | Không thay đổi gì. |
| Người dùng thêm một đường dẫn Symlink chỉ tới một thư mục đã theo dõi | Target của Symlink đã có trong danh sách | Chuẩn hóa giải mã symlink thành đường dẫn thực (Canonical path); phát hiện trùng lặp và từ chối. | `"Đường dẫn liên kết tượng trưng trỏ tới thư mục đã được theo dõi."` |

### 4.2. Ma trận Quyết định 2: Chính sách Ổ đĩa ngoài & Xử lý Ngoại tuyến (External Drive & Offline Policy)

| Hiện tượng Phát hiện | Phân loại Thiết bị | Hành động với Database SQLite & Bảo vệ Chỉ mục | Trạng thái Hiển thị (UI) |
|:---|:---|:---|:---|
| Đường dẫn Root không còn truy cập được (`!path.exists()`) khi khởi động | Ổ đĩa trong (Internal SSD/HDD) | Giữ nguyên bản ghi; kiểm tra quyền đọc; nếu lỗi quyền đánh dấu `ERROR_ACCESS`. TUYỆT ĐỐI KHÔNG XÓA CHỈ MỤC. | Huy hiệu đỏ: `"Không tìm thấy thư mục hoặc bị chặn quyền truy cập"`. |
| Đường dẫn Root không còn truy cập được (`!path.exists()`) khi khởi động hoặc runtime | Ổ đĩa ngoài (USB, External SSD, Network Share) | **TUYỆT ĐỐI KHÔNG XÓA DỮ LIỆU CHỈ MỤC.** Lưu và đối chiếu `volume_uuid` / `mount_point` để nhận diện phân vùng chính xác. Đổi trạng thái Root thành `UNAVAILABLE_OFFLINE`. | Huy hiệu xám: `"Ổ đĩa ngoài tạm ngắt kết nối"`. Kết quả tìm kiếm có icon ổ đĩa mờ. |
| Người dùng thực hiện tìm kiếm khi có Root đang `UNAVAILABLE_OFFLINE` | Bất kỳ | Vẫn trả về các kết quả đã lập chỉ mục của Root đó (kèm chỉ báo `is_offline = true`). | Thẻ kết quả hiển thị nhãn `"Ổ đĩa rời ngắt kết nối"`. Nút Mở/Reveal bị vô hiệu hóa kèm tooltip giải thích. |
| Ổ đĩa ngoài được cắm lại (Phát hiện đường dẫn Root xuất hiện trở lại) | Ổ đĩa ngoài | Kiểm tra `volume_uuid` khớp đúng phân vùng cũ; tự động kích hoạt luồng Quét đối chiếu Delta (Reconciliation Scan). | Huy hiệu vàng chuyển động: `"Đang đồng bộ thay đổi ổ đĩa ngoài..."`. |
| Người dùng chủ động bấm nút "Xóa thư mục" (Remove Root) trên giao diện | Bất kỳ (Kể cả khi đang Online hay Offline) | Hủy watcher stream, hủy background worker; xóa bản ghi trong `watched_roots` và xóa các tệp liên quan trong `files`. | Modal xác nhận: `"Xóa thư mục khỏi danh sách tìm kiếm? (Không ảnh hưởng đến tệp gốc trên máy)"`. |

### 4.3. Ma trận Quyết định 3: Xử lý Ngoại lệ Hệ thống Tệp & Lỗi I/O (Exception Handling Matrix)

| Mã Ngoại lệ / Lỗi | Nguyên nhân Kỹ thuật | Cơ chế Tự phục hồi / Xử lý An toàn | Phản hồi tới Người dùng |
|:---|:---|:---|:---|
| **E_ACCESS_DENIED (EACCES)** | Không có quyền đọc một thư mục con (bảo mật hệ thống). | `walkdir` bỏ qua thư mục con đó (`filter_entry`), tiếp tục quét các nhánh khác; **CẤM PURGE TOÀN ROOT** khi kết thúc quét nếu có nhánh bị lỗi EACCES. | Ghi nhận số lượng `"X tệp bị bỏ qua do không đủ quyền đọc"` trong bảng thống kê Root. |
| **E_SYMLINK_LOOP** | Liên kết tượng trưng tạo vòng lặp vô tận (`A -> B -> A`). | Cấu hình `walkdir.follow_links(false)` (không duyệt đệ quy vào symlink thư mục). Symlink tệp được lập chỉ mục với `is_symlink = true` và metadata của chính symlink. | Bỏ qua symlink đệ quy, không gây tràn ngăn xếp (Stack Overflow). |
| **E_EVENT_BUFFER_OVERFLOW** | Hàng đợi Bounded Queue (50,000 events) bị đầy hoặc kernel bị tràn buffer do bão I/O. | Ghi nhận cờ `has_gap = true` cho Root tương ứng; hủy buffer tạm thời; tự động lên lịch quét đối chiếu delta khi I/O ổn định (deadline tối đa 5 giây). | Không làm gián đoạn người dùng; tự động phục hồi tính toàn vẹn chỉ mục trong nền. |
| **E_STALE_FILE_ON_REVEAL** | Tệp tin vừa bị xóa hoặc di chuyển bởi app khác ngay trước khi người dùng bấm Reveal. | Kiểm tra: CHỈ XÓA BẢN GHI khi Root đang `ONLINE_ACTIVE` VÀ `fs::metadata` trả về đúng `ErrorKind::NotFound`. Nếu Root đang Offline hoặc lỗi quyền: CẤM XÓA BẢN GHI. | Toast thông báo nhẹ: `"Tệp không còn tồn tại trên đĩa cứng. Đã cập nhật kết quả."` |
| **E_DB_LOCKED** | SQLite bị giữ khóa do một transaction trước chưa hoàn tất. | Cấu hình SQLite `busy_timeout = 5000ms`, kích hoạt chế độ WAL (Write-Ahead Logging) và giới hạn 1 write connection duy nhất. | Tiến trình chờ tối đa 5s để lấy khóa an toàn; không gây crash ứng dụng. |
