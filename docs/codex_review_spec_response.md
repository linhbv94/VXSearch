# Báo cáo Tham vấn & Phản biện Bộ Đặc tả Kỹ thuật VXSearch từ Codex CLI

> **Mã phiên chạy (Run ID):** `20261028_033248_codex_f0c838a4`  
> **Nhiệm vụ:** [codex_review_spec_task.md](codex_review_spec_task.md)  
> **Thời gian:** 2026-10-28 10:35:45 (UTC+7)  
> **Trạng thái:** Hoàn tất thành công (Exit code: 0)  
> **Quy tắc:** Chỉ đọc/tham vấn; không tự sửa nguồn; không gọi agent khác; tuân thủ AGENTS.md, tiếng Việt, không LaTeX.

---

## 1. Nội dung Phản biện Gốc từ Codex CLI

**Đánh giá tổng quan: Cần bổ sung trước khi dùng làm đặc tả triển khai.**

Đã đọc toàn bộ 7 file spec, scope gốc và hai tài liệu UI chuẩn. Stack Tauri 2 + Rust + `walkdir` + `notify` + SQLite phù hợp với hướng sản phẩm; chưa có căn cứ bảo đảm các mục tiêu 500.000 tệp, truy vấn dưới 10ms và RAM dưới 80MB. Các vấn đề chính nằm ở tính đúng đắn khi quét và watcher chạy đồng thời, bảo vệ chỉ mục offline và những giao ước chưa đồng bộ.

Đây là review tài liệu; chưa chạy benchmark hoặc kiểm thử runtime. Không sửa file và không gọi agent khác.

---

### [P1 — Nghiêm trọng / Cần xử lý ngay]

**1. Giao thức đối chiếu có thể xóa nhầm chỉ mục hoặc giữ lại bản ghi đã mất.**  
Căn cứ: `00_system_overview.md:94`, `01_business_process.md:85`, `04_api_data.md:71`.
- Tài liệu 00 dùng `last_seen_scan_id < current_session_id`, trong khi session là UUIDv4: thứ tự UUID không biểu diễn thứ tự quét.
- Tài liệu 01 dùng `!=`, nhưng cột cho phép `NULL`; những hàng `NULL` không được điều kiện này chọn.
- Chỉ nhánh “tệp không đổi” được yêu cầu cập nhật marker rõ ràng; nhánh thêm mới/cập nhật cũng phải nhận marker của phiên hiện tại.
- Chưa có điều kiện cấm purge khi gặp EACCES, lỗi đọc nhánh, tháo ổ giữa lần quét hoặc hủy scan. “Duyệt xong” không đồng nghĩa đã quan sát đầy đủ cây.
- **Cần bổ sung:** Mọi hàng quan sát được đều nhận marker; purge phải giới hạn theo `root_id`, xử lý `NULL` và chỉ chạy khi phiên quét đủ điều kiện hoàn tất. Với scan thiếu nhánh, phương án đơn giản là hoãn purge toàn root; phương án chi tiết hơn là purge riêng các vùng đã quét đầy đủ.

**2. Có khoảng trống mất sự kiện giữa scan và đăng ký watcher; thiếu quy tắc xử lý cạnh tranh.**  
Căn cứ: `02_feature_flow.md:148`, `02_feature_flow.md:93`.
- Sequence đăng ký watcher **sau** scan. Tệp được tạo/xóa trong một nhánh đã duyệt có thể bị bỏ sót trước khi watcher hoạt động. Trong reconciliation, watcher cũng có thể thêm một hàng rồi sweep xóa hàng đó vì marker khác phiên quét.
- Điều kiện “chỉ đối chiếu nếu hơn 60 giây kể từ `last_scan_at`” còn bỏ qua thay đổi xảy ra khi Quit rồi mở lại nhanh; thời điểm quét cuối không chứng minh watcher đã liên tục hoạt động.
- **Cần bổ sung:** Đăng ký watcher trước scan, tiếp nhận sự kiện trong lúc quét và quy định thứ tự xử lý scan → replay → sweep. Mỗi root chỉ có một phiên quét có quyền hoàn tất; remove/merge phải vô hiệu hóa worker cũ. Startup và resume cần reconciliation không phụ thuộc ngưỡng 60 giây.

**3. Bảo vệ offline chưa bao phủ toàn bộ đường xóa và chưa nhận diện đúng ổ đĩa.**  
Căn cứ: `02_feature_flow.md:107`, `02_feature_flow.md:187`, `04_api_data.md:45`.
- Hiện chỉ dựa vào `is_removable` và `path.exists()`. Chưa xử lý:
  - Ổ khác được gắn cùng drive letter hoặc mount path.
  - Ổ cũ quay lại dưới đường dẫn khác.
  - Sự kiện Remove đã nằm trong queue trước khi root chuyển offline.
  - Reveal được gọi ngay lúc tháo ổ: sequence hiện xóa bản ghi khi `exists() == false`.
- Rust xác nhận `exists()` cũng trả `false` khi không đọc được metadata do lỗi quyền; không thể dùng kết quả này để kết luận tệp đã bị xóa.
- **Cần bổ sung:** Lưu identity của volume và đường dẫn tương đối của root; phân loại available/offline/access_error/unknown. Mọi đường xóa chỉ mục, kể cả stale cleanup, phải kiểm tra trạng thái root. Nhận diện đúng volume và đối chiếu xong mới phục hồi trạng thái hoạt động.

**4. `INSERT OR REPLACE` có thể làm FTS lệch khỏi bảng `files`.**  
Căn cứ: `02_feature_flow.md:153`, `04_api_data.md:95`.
- `REPLACE` xóa hàng cũ rồi chèn hàng mới. Delete trigger của thao tác này chỉ chạy khi bật `recursive_triggers`; PRAGMA trong spec chưa bật tùy chọn đó. Với khóa `path UNIQUE`, việc replace có thể đổi `id` nhưng để lại posting FTS của hàng cũ.
- **Cần bổ sung:** Thống nhất dùng UPSERT `ON CONFLICT(path) DO UPDATE`, giữ `id` ổn định và kiểm chứng đồng bộ FTS qua insert/update/delete/cascade. Bổ sung quy trình rebuild FTS cho migration hoặc khi phát hiện lệch chỉ mục.

**5. Debounce 300–1000ms chưa đủ tạo thành cơ chế chống bão sự kiện.**  
Căn cứ: `00_system_overview.md:80`, `02_feature_flow.md:320`.
- Spec có bounded queue nhưng chưa định nghĩa dung lượng, hành vi khi đầy, giới hạn map gom sự kiện hoặc số action mỗi transaction. Một batch chứa hàng chục nghìn đường dẫn khác nhau vẫn rất lớn dù đã debounce.
- Contract cũng chưa xác định đầy đủ Remove → Create, rename thiếu một đầu, di chuyển qua root, thêm/xóa cả cây thư mục và atomic save. Quy tắc Create → Remove thành no-op chỉ đúng khi biết trạng thái chỉ mục trước đó cho phép triệt tiêu.
- **Cần bổ sung:** Queue đầy → đánh dấu vùng bị thiếu sự kiện; giới hạn batch theo số lượng/thời gian; xử lý metadata ngoài write transaction; dùng một đầu mối ghi DB. Reconciliation phải có thời hạn bắt đầu tối đa, tránh chờ “2 giây tĩnh lặng” vô hạn. Xem sự kiện là tín hiệu cần đối chiếu trạng thái đĩa.

**6. Hợp đồng tìm kiếm chưa bảo đảm đúng kết quả theo scope.**  
Căn cứ: `02_feature_flow.md:179`, `02_feature_flow.md:337`, `04_api_data.md:85`.
- Sequence dùng `name MATCH` trên bảng `files` thông thường; cần truy vấn `files_fts` và liên kết về `files`.
- Contract chọn prefix khi có một từ: tìm `report` sẽ không thấy `financial_report.pdf` nếu chỉ thực hiện nhánh đó.
- Scope yêu cầu tìm theo đường dẫn, nhưng contract chưa định nghĩa cách tìm trong `parent_dir` hoặc toàn path.
- Chưa định nghĩa query 1–2 ký tự, dấu ngoặc kép, toán tử FTS, `%`, `_`, tên có dấu chấm và cách kết hợp nhiều từ. FTS5 trigram không trả kết quả MATCH cho chuỗi dưới 3 ký tự. Cấu hình trigram chưa bật bỏ dấu trong khi EC-08 yêu cầu tìm tiếng Việt có dấu và không dấu.
- **Cần bổ sung:** Chốt grammar và bảng ví dụ đầu vào → kết quả mong đợi; phân biệt literal search với cú pháp nâng cao; quy định fallback ngắn, normalization và thứ tự phân trang ổn định. Không chuyển thẳng query người dùng thành biểu thức MATCH.

**7. Luồng xác nhận merge chưa có IPC thực hiện; thứ tự thao tác có nguy cơ cascade mất chỉ mục.**  
Căn cứ: `01_business_process.md:239`, `04_api_data.md:198`.
- `add_watched_root({ path })` chỉ trả `E_PARENT_OF_EXISTING`; không có tham số xác nhận hoặc command merge. Gọi lại cùng command sẽ vẫn gặp lỗi. Ma trận lại mô tả xóa root con trước khi chuyển `root_id`, trong khi FK dùng `ON DELETE CASCADE`.
- **Cần bổ sung:** Command merge rõ ràng `confirm_merge_roots`, kiểm tra lại overlap lúc xác nhận; tạm dừng worker liên quan → tạo root cha → chuyển association → xóa root con trong transaction → tiếp tục theo dõi/quét. Hủy hoặc lỗi giữa chừng phải giữ trạng thái hợp lệ.

---

### [P2 — Cải thiện / Hoàn thiện]

**8. DB, Rust, TypeScript và sequence chưa đồng bộ tuyệt đối:**
- `alias` nullable trong DB/Rust, nhưng TypeScript bắt buộc `string` → Đổi thành `string | null`.
- `FileRecord` chứa `is_offline` không có trong bảng; thiếu các trường phục vụ scanner như marker và `is_symlink` → Tách biệt model persistence và DTO kết quả; định nghĩa JOIN tính offline.
- `SearchParams` dùng `raw_query`, enum số nhiều, thiếu `sort_by`; IPC dùng `query`, enum số ít → Thống nhất một interface duy nhất.
- Sequence trả `{ files, total }`, API trả `{ items, total_matched }` → Thống nhất `{ items, total_matched, took_ms }`.
- Windows hotkey là `Alt+Shift+F`, settings mặc định suy ra `Ctrl+Shift+F` → Tách biệt default theo platform.
- `AppError` chưa có schema → Bổ sung schema `{ code, message, details }`.
- Phân biệt tên trường trong DTO Serde với argument command Tauri (camelCase trên JS vs snake_case trên Rust).

**9. Reveal native mới là phương án triển khai, chưa phải hợp đồng đã hoàn thiện:**
- macOS: `Command::new("open").arg("-R").arg(target_path)` truyền literal, không thêm shell escaping.
- Windows: Cân nhắc gọi Win32 Shell API `SHOpenFolderAndSelectItems` thông qua Rust FFI `windows` crate hoặc fallback an toàn `explorer.exe /select,"<path>"`.
- Reveal Stale Check: Chỉ xóa bản ghi khi root đang `ONLINE_ACTIVE` VÀ `fs::metadata` trả về đúng `ErrorKind::NotFound`.

**10. Chuẩn hóa path và chính sách symlink:**
- Không fallback âm thầm khi canonicalize lỗi; phân biệt display path và canonical path.
- `follow_links(false)` nghĩa là không duyệt vào symlink thư mục. Symlink tệp được lập chỉ mục với metadata của chính link và `is_symlink = true`.

**11. Mô hình hiệu năng có chi phí ghi chưa được tính đủ:**
- Sửa Trigger SQLite: Chỉ kích hoạt FTS UPDATE khi `OLD.name != NEW.name OR OLD.parent_dir != NEW.parent_dir`. Không update FTS khi chỉ đổi marker, size hay mtime.
- Bật `PRAGMA recursive_triggers = ON;`.
- Ghi rõ các chỉ số hiệu năng (sub-10ms, 500k files) là mục tiêu thiết kế cần đo kiểm thực tế trên benchmark, không tự cam kết cứng.

**12. Chuẩn hóa UI & QA:**
- Windows Chrome: Sửa lại để đúng chuẩn `desktop_ui_standards.md` (menu bên trái, ẩn icon/tên app, minimize/maximize/close phẳng bên phải).
- Tiến trình quét: Hiển thị `scanned_count` thay vì `%` khi chưa biết tổng số tệp.
- Đưa `start_at_login` về P1 theo đúng scope gốc.
- Auto-hide cửa sổ: Thêm ngoại lệ khi mở native dialog, modal Settings, Folder Manager.
- Bổ sung ma trận truy vết kiểm thử (Traceability Matrix) vào `05_qa_acceptance.md`.

---

## 2. Kế hoạch Tiếp thu & Xử lý Toàn diện

Toàn bộ 7 khuyến nghị P1 và 5 khuyến nghị P2 của Codex CLI sẽ được cập nhật đồng bộ vào cả 7 tài liệu đặc tả kỹ thuật trong `vxsearch/docs/spec/`.
