# 00. Tổng quan Hệ thống — VXSearch (`_spec0_system`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Nền tảng mục tiêu:** Windows 10/11 (x64) và macOS 14.0+ (Apple Silicon & Intel — Tối ưu hóa sâu cho macOS 26 / SDK 27.0)  
> **Tài liệu nguồn phạm vi (Scope Source of Truth):** [VXSearch_Scope_v1.0.md](../../VXSearch_Scope_v1.0.md)  
> **Quy chuẩn tuân thủ:** [desktop_ui_standards.md](../../../.agents/desktop_ui_standards.md) và [master_theme.md](../../../_summary/master_theme.md)

---

## 1. Bối cảnh & Tôn chỉ Sản phẩm (Product Vision)

### 1.1. Nỗi đau thực tế trong việc tìm kiếm tệp cục bộ
Trong quy trình làm việc hằng ngày của lập trình viên, nhà thiết kế và nhân sự văn phòng, nhu cầu tìm kiếm nhanh một tệp tin (mã nguồn, tài liệu hợp đồng, ảnh asset, mô hình 3D, bản ghi âm) là thao tác lặp lại hàng chục lần. Tuy nhiên, các công cụ tìm kiếm hiện có trên máy tính đều bộc lộ các điểm hạn chế cố hữu:

1. **Spotlight / Finder (macOS):**
   - Tự động lập chỉ mục toàn bộ ổ đĩa, tiêu tốn tài nguyên CPU, dung lượng pin và gây nóng máy bất chợt khi có tiến trình compile mã nguồn hoặc tải dữ liệu lớn.
   - Thường xuyên bị trễ (indexing lag), trả về kết quả rác từ email, bookmarks trình duyệt hoặc các tệp hệ thống ẩn mà người dùng không bao giờ cần.
   - Không cho phép người dùng giới hạn chặt chẽ phạm vi chỉ mục vào đúng các thư mục làm việc cốt lõi.
2. **Windows Search Indexer (Windows):**
   - Hoạt động nặng nề, cơ chế cập nhật chỉ mục ngầm thường xuyên gây thắt nút cổ chai I/O đĩa cứng (100% disk usage).
   - Tốc độ trả kết quả chậm chạp, giao diện tìm kiếm trong File Explorer cồng kềnh và thiếu trực quan.
3. **Everything (Voidtools — Windows):**
   - Đạt tốc độ cực nhanh nhờ đọc trực tiếp Master File Table (MFT) của NTFS, nhưng:
     - **Chỉ chạy trên Windows**, không hỗ trợ macOS.
     - Yêu cầu quyền Quản trị viên (Administrator Privilege) hoặc chạy dịch vụ hệ thống đặc quyền (Privileged Background Service).
     - Luôn quét toàn bộ ổ đĩa, không có khái niệm phân định ranh giới cho các thư mục người dùng chủ động chọn (Curated Scope), dễ làm lộ các tệp riêng tư ngoài ý muốn khi tìm kiếm trong lúc chia sẻ màn hình.

### 1.2. Định nghĩa & Sứ mệnh của VXSearch
VXSearch là **tiện ích tìm kiếm tệp cục bộ siêu nhẹ theo các thư mục do người dùng chủ động lựa chọn (Explicit User-Curated Scope)**, hoạt động mượt mà trên cả Windows và macOS.

**Tôn chỉ cốt lõi phân định ranh giới (Non-Goals & Core Boundaries):**
- **Không cạnh tranh quét toàn ổ đĩa với Everything:** VXSearch không tìm kiếm toàn bộ hệ thống; không đọc MFT trần của NTFS hay fs_events thô toàn phân vùng APFS. Ứng dụng chỉ phục vụ chính xác các cây thư mục mà người dùng đã bấm thêm vào danh sách theo dõi.
- **Tuyệt đối Read-Only đối với dữ liệu người dùng:**
  - Ứng dụng chỉ đọc các metadata cơ bản cần thiết: Tên tệp, đường dẫn, loại tệp, dung lượng, và thời điểm sửa đổi (`modified_at`).
  - **Tuyệt đối KHÔNG đọc, mở hoặc trích xuất nội dung tệp:** Loại trừ 100% rủi ro bảo mật dữ liệu, tránh việc tiêu hao CPU vào việc phân tích văn bản (content indexing).
  - **Tuyệt đối KHÔNG sửa đổi, di chuyển hoặc xóa tệp gốc:** VXSearch chỉ là công cụ tra cứu và điều hướng.
- **Zero-Cloud & Quyền riêng tư 100% Cục bộ:** Không máy chủ, không dịch vụ đám mây, không thu thập dữ liệu (telemetry), không gửi bất kỳ đường dẫn hay metadata nào ra ngoài mạng Internet.
- **Tiện ích Thường trực Nhẹ nhàng (Lightweight Daemon):** Chạy nền trên Menu Bar (macOS) hoặc System Tray (Windows), kích hoạt nhanh bằng phím tắt toàn hệ thống (`Cmd+Shift+F` trên Mac, `Alt+Shift+F` trên Windows), đóng cửa sổ không thoát ứng dụng.
- **Định vị & Mở tệp Chuẩn Native (Native OS Reveal):** Cung cấp hành động 1-chạm để mở trực tiếp trong Finder (macOS) hoặc File Explorer (Windows) với đúng tệp tin được highlight chọn sẵn, hoặc mở nhanh tệp bằng ứng dụng mặc định của hệ điều hành.

---

## 2. Ma trận Độ khó Kỹ thuật & Giải pháp Kiến trúc (Difficulty Matrix)

```text
┌────────────────────────────────────────────────────────────────────────┐
│               MA TRẬN ĐỘ KHÓ KỸ THUẬT (DIFFICULTY MATRIX)              │
├────────────────────────┬─────────────┬─────────────────────────────────┤
│ Hạng mục Kỹ thuật      │ Mức độ khó  │ Thách thức cốt lõi & Nguy cơ    │
├────────────────────────┼─────────────┼─────────────────────────────────┤
│ 1. Filesystem Watcher  │ ★★★★☆ (8.5) │ Cơn bão sự kiện (Event storm)   │
│    Coalescing & Storms │             │ khi build code/git checkout;    │
│                        │             │ nguy cơ khóa SQLite DB & lag CPU│
├────────────────────────┼─────────────┼─────────────────────────────────┤
│ 2. Reconciliation &    │ ★★★★☆ (8.5) │ Phát hiện lỗ hổng sự kiện khi   │
│    External Drive Offline            │ máy ngủ/app tắt; phân biệt ổ rời│
│                        │             │ bị rút với tệp bị xóa thật sự   │
├────────────────────────┼─────────────┼─────────────────────────────────┤
│ 3. Nested Folders &    │ ★★★★☆ (8.0) │ Xung đột khi người dùng thêm cả │
│    Overlapping Roots   │             │ thư mục cha và thư mục con;     │
│                        │             │ trùng lặp watcher và dữ liệu DB │
├────────────────────────┼─────────────┼─────────────────────────────────┤
│ 4. Cross-Platform Native│ ★★★☆☆ (7.5) │ Reveal đúng file trong Finder   │
│    Reveal & File Action│             │ và Explorer, xử lý tên Unicode, │
│                        │             │ dấu cách, ký tự đặc biệt, UNC   │
├────────────────────────┼─────────────┼─────────────────────────────────┤
│ 5. High-Performance    │ ★★★☆☆ (7.5) │ Tìm kiếm tức thì <10ms trên     │
│    Instant SQLite Query│             │ 500,000+ tệp; ảo hóa danh sách, │
│                        │             │ bộ nhớ RAM < 80MB khi chạy nền  │
└────────────────────────┴─────────────┴─────────────────────────────────┘
```

### Điểm khó 1: Bộ gom sự kiện Thay đổi Hệ thống tệp & Chống Bão I/O (Event Coalescing & Storm Protection — Độ khó: 8.5/10)
- **Vấn đề kỹ thuật:**
  - Khi người dùng thực hiện các tác vụ phát sinh lượng tệp lớn trong thư mục được theo dõi (ví dụ: chạy `npm install`, `cargo build`, hoặc chuyển nhánh `git checkout` sinh ra hàng chục nghìn tệp trong vài giây), thư viện watcher (`notify`) sẽ bắn dồn dập hàng loạt sự kiện I/O (`Create`, `Modify`, `Remove`, `Rename`).
  - Nếu mỗi sự kiện đều kích hoạt một câu lệnh SQL ghi vào SQLite hoặc bắn một sự kiện IPC lên giao diện React, ứng dụng sẽ bị tê liệt do xung đột ghi (database lock), CPU vọt lên 100% và giao diện bị đóng băng.
- **Giải pháp kiến trúc:**
  - Xây dựng **Coordinator gom sự kiện trong Rust (Event Debounce & Coalescing Engine)**:
    1. Tiếp nhận sự kiện từ kênh `notify::RecommendedWatcher` vào một hàng đợi có chặn trong RAM (In-memory Bounded MPSC Queue: dung lượng tối đa 50,000 events). Nếu hàng đợi bị tràn hoặc kernel báo mất sự kiện (buffer overflow): Đánh dấu Root tương ứng `has_gap = true`, hủy buffer và kích hoạt Reconciliation Scan sau khi I/O ổn định (thời hạn bắt đầu tối đa 5 giây, không chờ tĩnh lặng vô hạn).
    2. Gom nhóm các sự kiện theo cửa sổ thời gian trượt (sliding window debounce: `300ms`, tối đa trì hoãn cứng `1000ms`).
    3. Rút gọn trạng thái logic có đối chiếu CSDL:
       - Nếu một tệp vừa được `Create` rồi ngay lập tức bị `Remove` trong cùng cửa sổ: Chỉ triệt tiêu thành No-op nếu tệp đó chưa từng tồn tại trong CSDL SQLite trước phiên gom; nếu đã có trong DB thì chuyển thành thao tác `DeleteRecord`.
       - Nếu một tệp bị `Modify` liên tiếp nhiều lần (đang ghi file): Chỉ giữ lại 1 sự kiện `UpdateMetadata` tại thời điểm cuối.
       - Chuỗi ghi đè nguyên tử của text editor (tạo `.tmp` rồi rename đè tệp gốc): Tự động nhận diện và chuyển hóa thành `UpdateMetadata` thay vì cặp Delete + Insert gây nhảy `id`.
    4. Gom toàn bộ thay đổi còn lại vào **các Transaction SQLite theo mẻ (Batch WAL Transactions, tối đa 2,000 thao tác/transaction)**, xử lý việc đọc metadata ở ngoài write transaction để giữ thời gian khóa ghi CSDL cực ngắn.
    5. Gửi thông báo nhẹ `index_changed` lên giao diện với tần suất bị tiết lưu (throttled) tối đa 10 lần/giây.

### Điểm khó 2: Động cơ Quét Đối chiếu & Bảo vệ Ổ đĩa ngoài Ngắt kết nối (Reconciliation & Offline Safety — Độ khó: 8.5/10)
- **Vấn đề kỹ thuật:**
  - Ứng dụng không thể duy trì theo dõi 24/7 tuyệt đối: Máy tính có thể rơi vào chế độ ngủ (Sleep/Hibernate), ứng dụng bị người dùng thoát (Quit), hoặc watcher bị tràn hàng đợi sự kiện do hệ điều hành giới hạn. Bất kỳ lúc nào app khởi động lại (dù tắt chỉ vài giây) hay máy thức giấc, các thay đổi ngoài đĩa đều có thể đã xảy ra.
  - Người dùng thường theo dõi các thư mục nằm trên **Ổ cứng di động (External SSD, USB Drive, Thẻ nhớ)** hoặc phân vùng mạng. Khi ổ đĩa ngoài bị tháo (unplug): Hệ điều hành có thể phát ra sự kiện xóa hoặc đường dẫn đột ngột biến mất.
  - Hơn nữa, trên Rust hàm `Path::exists()` trả về `false` cả khi đường dẫn không tồn tại lẫn khi gặp lỗi quyền truy cập (Permission Denied). Nếu ứng dụng xóa mù quáng toàn bộ dữ liệu chỉ mục của thư mục đó khỏi SQLite, khi người dùng cắm lại ổ đĩa hoặc cấp lại quyền sẽ phải quét lại từ đầu hàng trăm nghìn tệp.
- **Giải pháp kiến trúc:**
  - **Nhận diện Danh tính Phân vùng (Volume Identity & Availability Detection):**
    - Lưu trữ định danh phần cứng của phân vùng (`volume_uuid` / `mount_point`) và đường dẫn tương đối của root.
    - Phân loại 4 trạng thái rõ ràng của Root: `ONLINE_ACTIVE`, `UNAVAILABLE_OFFLINE`, `ACCESS_ERROR`, `UNKNOWN`.
    - Tránh triệt để việc nhầm lẫn khi một ổ đĩa khác được cắm vào cùng ký tự ổ đĩa (Drive Letter) trên Windows hoặc cùng thư mục `/Volumes/...` trên macOS.
    - Mọi thao tác xóa chỉ mục (kể cả dọn dẹp tệp stale khi Reveal) BẮT BUỘC phải kiểm tra trạng thái Root: Chỉ thực thi xóa khi Root đang `ONLINE_ACTIVE` VÀ lệnh đọc metadata trả về đúng mã lỗi `ErrorKind::NotFound` (không xóa khi gặp `PermissionDenied` hoặc khi Root đang offline).
  - **Quy trình Quét Đối chiếu Delta & Thứ tự Xử lý Cạnh tranh (Reconciliation Protocol):**
    - Khi khởi động lại ứng dụng hoặc khi một Root chuyển từ offline sang online: Bộ điều phối không xóa trắng để quét lại.
    - **Thứ tự xử lý chuẩn:**
      1. Đăng ký `notify` watcher TRƯỚC KHI bắt đầu quét đệ quy để không bỏ lỡ sự kiện phát sinh trong lúc duyệt. Các sự kiện nhận được trong lúc scan được đưa vào hàng đợi staging (Replay buffer).
      2. Bộ quét duyệt cây thư mục bằng `walkdir`, ghi nhận `(path, size, modified_at)` kèm một mã phiên quét mới (`scan_session_id = UUIDv4`).
      3. So khớp nhanh và cập nhật marker phiên quét:
         - Các tệp có `modified_at` và `size` không đổi: Cập nhật `last_seen_scan_id = current_session_id`.
         - Các tệp có metadata thay đổi: Cập nhật thông tin mới và gán `last_seen_scan_id = current_session_id`.
         - Các tệp mới xuất hiện: Chèn mới vào chỉ mục bằng UPSERT và gán `last_seen_scan_id = current_session_id`.
      4. Xử lý Replay buffer: Áp dụng các sự kiện I/O đã ghi nhận trong thời gian quét.
      5. **Điều kiện Purge an toàn (Purge Guard):** CHỈ KHI toàn bộ cây thư mục được duyệt thành công trọn vẹn không lỗi (`scan_state == COMPLETED_SUCCESS`), hệ thống mới thực hiện quét dọn (Sweep):
         ```sql
         DELETE FROM files 
         WHERE root_id = ? 
           AND (last_seen_scan_id != ? OR last_seen_scan_id IS NULL);
         ```
      6. **CẤM Purge khi có lỗi:** Nếu gặp `EACCES` ở bất kỳ nhánh nào, ổ đĩa bị tháo giữa chừng, hoặc người dùng hủy quét: Hoãn lệnh purge toàn bộ root để bảo vệ dữ liệu chỉ mục hiện có.

### Điểm khó 3: Xử lý Thư mục Lồng nhau & Chồng lấn (Nested Folders Deduplication — Độ khó: 8.0/10)
- **Vấn đề kỹ thuật:**
  - Người dùng có thể thêm thư mục `/Users/vic/Projects` vào danh sách theo dõi. Sau đó, họ lại tiếp tục bấm thêm thư mục con `/Users/vic/Projects/VXUtilities/vxsearch`.
  - Nếu không xử lý, thư mục con sẽ bị lập chỉ mục 2 lần (gây nhân đôi kết quả tìm kiếm), hai watcher riêng biệt cùng lắng nghe một cây thư mục (gây lãng phí tài nguyên hệ thống và phát sinh sự kiện trùng lặp).
- **Giải pháp kiến trúc:**
  - Chuẩn hóa đường dẫn tuyệt đối (Canonicalized Normalized Path) không phân biệt dấu gạch chéo `/` hay `\` và phân giải symlinks.
  - Áp dụng thuật toán kiểm tra bao hàm đường dẫn (Path Prefix Inclusion Check):
    - **Trường hợp 1 (Thêm con khi đã có cha):** Nếu người dùng thêm một đường dẫn là thư mục con của một Root đã tồn tại, ứng dụng từ chối và hiển thị thông báo thân thiện: *"Thư mục này đã nằm trong phạm vi theo dõi của [Tên thư mục cha]. Không cần thêm lại."*
    - **Trường hợp 2 (Thêm cha khi đã có con):** Nếu người dùng thêm một thư mục cha bao trùm một hoặc nhiều thư mục con đã có trong danh sách: Hệ thống đưa ra hộp thoại xác nhận: *"Thư mục mới sẽ bao trùm [X] thư mục con đang theo dõi. Bạn có muốn hợp nhất vào thư mục cha này không?"*. Nếu đồng ý, tự động gỡ bỏ các Root con và chỉ định Root cha mới, chuyển giao các tệp đã index mà không cần quét lại từ đầu phần chung.

### Điểm khó 4: Điều hướng Mở & Highlight Chuẩn Native (Native Reveal in File Manager — Độ khó: 7.5/10)
- **Vấn đề kỹ thuật:**
  - Hành động "Reveal in Finder" (macOS) hoặc "Show in Explorer" (Windows) đòi hỏi mở đúng thư mục cha và **tự động bôi đen chọn đúng tệp tin đó**.
  - Việc gọi lệnh shell đơn giản như `open` hoặc `explorer.exe` rất dễ bị lỗi nếu: Đường dẫn chứa khoảng trắng, dấu ngoặc kép, ký tự Unicode tiếng Việt có dấu, ký tự đặc biệt (`#`, `&`, `$`), hoặc đường dẫn mạng UNC (`\\server\share`).
  - Nếu tệp tin vừa bị xóa trước khi người dùng bấm Reveal, ứng dụng có thể làm treo File Explorer hoặc báo lỗi vô nghĩa.
- **Giải pháp kiến trúc:**
  - Kiểm tra tính tồn tại thực tế của tệp ngay tại thời điểm bấm (`std::path::Path::new(&path).exists()`). Nếu tệp không còn, hiển thị thông báo nhẹ và cập nhật trạng thái chỉ mục.
  - Trên **macOS**: Sử dụng lệnh AppleScript thông qua tiến trình native an toàn hoặc lệnh `open -R "<path>"` đã được escape đối số nghiêm ngặt, hoặc gọi trực tiếp API Cocoa AppKit `[[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[url]]` thông qua Rust FFI `objc2` để đạt độ tin cậy tuyệt đối và không phụ thuộc vào shell.
  - Trên **Windows**: Sử dụng lệnh gọi Windows Shell API chuẩn qua lệnh `explorer.exe /select,"<normalized_path>"` hoặc trực tiếp gọi API Win32 `SHOpenFolderAndSelectItems` để mở cửa sổ Explorer và bôi đen chính xác tệp đích mà không bị lỗi đối số dòng lệnh.

### Điểm khó 5: Động cơ Tìm kiếm Siêu tốc với SQLite Cục bộ (Sub-10ms Target Instant Search — Độ khó: 7.5/10)
- **Vấn đề kỹ thuật:**
  - Danh mục theo dõi có thể lên tới 200,000 – 500,000 tệp tin. Nếu dùng câu truy vấn `LIKE '%query%'` thông thường trên SQLite, mỗi lượt gõ phím sẽ gây Full Table Scan mất hàng trăm mili-giây, làm giật lag giao diện người dùng.
  - Hơn nữa, SQLite FTS5 với tokenizer `trigram` không hỗ trợ truy vấn chuỗi dưới 3 ký tự và không tự động xử lý tiếng Việt không dấu (unaccent).
- **Giải pháp kiến trúc:**
  - Thiết kế cấu trúc bảng SQLite tối ưu hóa cao:
    - Lưu các trường chuẩn hóa: `name_lower` (tên chữ thường) và `name_unaccent` (bỏ dấu tiếng Việt) để hỗ trợ tìm kiếm không phân biệt hoa/thường và có/không dấu.
    - Đánh chỉ mục B-Tree kép trên `(name_lower, extension, root_id)` và `(root_id, parent_dir)`.
    - **Phân luồng truy vấn thông minh:**
      - *Với truy vấn 1–2 ký tự:* Tận dụng triệt để B-Tree index với điều kiện prefix `name_lower >= ? AND name_lower < ?` hoặc `name_lower LIKE ? || '%'`.
      - *Với truy vấn 3 ký tự trở lên:* Kích hoạt bảng ảo **SQLite FTS5 với tokenizer `trigram`**, liên kết JOIN về bảng `files` qua `rowid = files.id`, tìm kiếm bất kỳ chuỗi con nào trên cả tên tệp và đường dẫn thư mục cha (`parent_dir`).
    - *Lưu ý về mục tiêu hiệu năng:* Các chỉ số truy vấn dưới 10ms, RAM nền dưới 80MB và danh mục 500.000 tệp là các mục tiêu thiết kế kiến trúc (Architecture Design Targets); hiệu năng thực tế (p50/p95/p99) sẽ được đo kiểm nghiêm ngặt qua bộ benchmark riêng biệt trước khi nghiệm thu.
  - Giao diện React sử dụng **Ảo hóa Danh sách (Virtual List via `@tanstack/react-virtual`)**: Chỉ render đúng 15–20 dòng DOM tương ứng với khung nhìn hiển thị, duy trì tốc độ 60fps mượt mà khi cuộn nhanh qua hàng chục nghìn kết quả.

---

## 3. Ngăn xếp Công nghệ Toàn diện (Tech Stack Matrix)

| Tầng kiến trúc | Công nghệ tuyển chọn | Phiên bản / Thư viện | Trách nhiệm chính |
|:---|:---|:---|:---|
| **Desktop Shell** | Tauri 2 | v2.0+ (Rust Core) | Quản lý cửa sổ đa nền tảng, Menu bar / System Tray, Global Hotkeys, Native Menus, bảo mật IPC |
| **Backend Core** | Rust | 1.80+ (2021 Edition) | Động cơ quét, điều phối chỉ mục, giám sát hệ thống tệp, logic truy vấn SQLite |
| **Database** | SQLite 3 | `rusqlite` (bundled feature) | Lưu trữ metadata tệp và cấu hình; B-Tree indexes + FTS5 trigram |
| **File Scanner** | `walkdir` | v2.5+ | Duyệt đệ quy cây thư mục siêu tốc, kiểm soát độ sâu và bỏ qua lỗi truy cập |
| **File Watcher** | `notify` | v6.1+ (RecommendedWatcher) | Nhận thông báo I/O thời gian thực: FSEvents trên macOS, ReadDirectoryChangesW trên Windows |
| **Path Utilities** | `dunce` & `normpath` | v1.0+ | Chuẩn hóa đường dẫn tuyệt đối, giải quyết tiền tố UNC `\\?\` trên Windows |
| **Frontend Framework**| React | v18.3+ / v19 (TypeScript) | Giao diện quản lý thư mục, thanh tìm kiếm, bảng kết quả, phản hồi tương tác |
| **Build & Bundler** | Vite | v5.4+ | Trình đóng gói giao diện siêu tốc, HMR, cấu hình base URL chuẩn Tauri |
| **Styling & Theme** | Tailwind CSS | v3.4+ | Triển khai Master Theme VXUtilities (Dark-first `#0f1117`, Electric Cyan, Glassmorphism) |
| **UI Components** | Lucide React | v0.400+ | Hệ thống biểu tượng giao diện chuẩn hóa (Search, Folder, File, ExternalLink, Settings...) |
| **List Virtualization**| `@tanstack/react-virtual` | v3.8+ | Ảo hóa bảng kết quả tìm kiếm, chống giật lag DOM khi có hàng chục nghìn kết quả |
| **Native Reveal** | OS Command / FFI | `std::process::Command` | Mở và bôi đen tệp trong Finder / Explorer an toàn |

---

## 4. Kiến trúc Luồng Dữ liệu Tổng thể (Data Flow Architecture)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               KIẾN TRÚC TỔNG THỂ VXSEARCH                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  [ Người dùng thêm thư mục ] ───► [ walkdir Initial Scanner ]                           │
│                                           │                                            │
│  [ Thay đổi tệp thời gian thực ] ─► [ notify Watcher Engine ]                          │
│                                           │                                            │
│                                           ▼                                            │
│                         ┌───────────────────────────────────┐                          │
│                         │   Rust Indexing Coordinator       │                          │
│                         │   - Chuẩn hóa đường dẫn (dunce)   │                          │
│                         │   - Chống trùng lặp Roots         │                          │
│                         │   - Debounce & Coalescing (300ms) │                          │
│                         │   - Quét đối chiếu Delta          │                          │
│                         └─────────────────┬─────────────────┘                          │
│                                           │ (Batch Transactions)                       │
│                                           ▼                                            │
│                         ┌───────────────────────────────────┐                          │
│                         │       SQLite Cục bộ (WAL Mode)    │                          │
│                         │   - watched_roots                 │                          │
│                         │   - files (B-Tree + FTS5 trigram) │                          │
│                         │   - app_settings                  │                          │
│                         └─────────────────┬─────────────────┘                          │
│                                           │                                            │
│                  Tauri 2 IPC (Query <10ms)│ live events (index_changed)                │
│                                           ▼                                            │
│                         ┌───────────────────────────────────┐                          │
│                         │    Giao diện React (TypeScript)   │                          │
│                         │    - Thanh tìm kiếm tức thì       │                          │
│                         │    - Danh sách ảo hóa 60fps       │                          │
│                         │    - Drawer quản lý thư mục       │                          │
│                         │    - Phím tắt điều hướng nhanh    │                          │
│                         └─────────────────┬─────────────────┘                          │
│                                           │                                            │
│                                           ▼                                            │
│                         ┌───────────────────────────────────┐                          │
│                         │    Native OS Action Bridge        │                          │
│                         │    - Finder: open -R / NSWorkspace│                          │
│                         │    - Explorer: explorer /select,  │                          │
│                         │    - Mở tệp bằng app mặc định     │                          │
│                         └───────────────────────────────────┘                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Cấu trúc Thư mục Dự án Dự kiến (Project Directory Structure)

Cấu trúc dự án tuân thủ nghiêm ngặt quy chuẩn Tauri 2 đa nền tảng và quy chuẩn VXUtilities:

```text
vxsearch/
├── VXSearch_Scope_v1.0.md           # Tài liệu phạm vi gốc (Source of Truth)
├── docs/                             # Thư mục tài liệu đặc tả & kiểm thử
│   ├── codex_review_spec_task.md    # Nhiệm vụ tham vấn Codex CLI
│   ├── codex_review_spec_response.md# Báo cáo phản biện của Codex CLI
│   └── spec/                         # Bộ đặc tả kỹ thuật 7 tài liệu
│       ├── 00_system_overview.md     # Tài liệu này (_spec0_system)
│       ├── 01_business_process.md   # Quy trình nghiệp vụ vĩ mô (_spec1_business_process)
│       ├── 02_feature_flow.md        # Luồng tính năng & FSM (_spec2_feature_flow)
│       ├── 03_ui_wireframe.md        # Wireframe & Design Tokens (_spec3_ui_wireframe)
│       ├── 04_api_data.md            # API contracts & SQLite schema (_spec4_api_data)
│       ├── 05_qa_acceptance.md       # Tiêu chuẩn nghiệm thu Gherkin (_spec5_qa_acceptance)
│       └── 06_demo_presentation.md   # Kịch bản demo & FAQ (_spec6_demo_presentation)
├── icon.icns                         # Icon macOS Retina bundle
├── icon.ico                          # Icon Windows multi-resolution
├── icon.png                          # Icon PNG 512x512
├── package.json                      # Cấu hình npm & dependencies React
├── vite.config.ts                    # Cấu hình Vite bundler
├── tsconfig.json                     # Cấu hình TypeScript strict
├── tailwind.config.js                # Cấu hình Tailwind theme chuẩn VXUtilities
├── src/                              # Mã nguồn Frontend (React + TypeScript)
│   ├── main.tsx                      # Entry point React
│   ├── App.tsx                       # Root component & Window layout
│   ├── components/                   # Các thành phần giao diện
│   │   ├── TitleBar.tsx              # Thanh trên cùng 32px chuẩn desktop_ui_standards
│   │   ├── SearchBar.tsx             # Ô nhập tìm kiếm tức thì & Filter chips
│   │   ├── ResultList.tsx            # Bảng danh sách kết quả ảo hóa (@tanstack/react-virtual)
│   │   ├── ResultItem.tsx            # Dòng kết quả (Icon, tên, đường dẫn, dung lượng, nút)
│   │   ├── FolderManagerModal.tsx    # Hộp thoại quản lý thư mục theo dõi
│   │   ├── SettingsModal.tsx         # Hộp thoại Settings chuẩn hóa (Updates, About, Support)
│   │   └── StatusFooter.tsx          # Thanh trạng thái dưới cùng (Tổng số file, trạng thái quét)
│   ├── hooks/                        # Custom hooks
│   │   ├── useSearch.ts              # Hook tìm kiếm debounce & cache kết quả
│   │   ├── useWatchedRoots.ts        # Hook quản lý danh sách thư mục theo dõi
│   │   └── useKeyboardNavigation.ts  # Hook điều hướng bàn phím (Mũi tên, Enter, Cmd+Enter)
│   ├── services/                     # Bridge gọi Tauri IPC commands
│   │   └── tauri_api.ts              # Giao ước kiểu TypeScript khớp với backend Rust
│   └── types/                        # Định nghĩa TypeScript interfaces
│       └── index.ts
└── src-tauri/                        # Mã nguồn Backend (Rust Core)
    ├── Cargo.toml                    # Khai báo crate dependencies
    ├── tauri.conf.json               # Cấu hình cửa sổ, tray, permissions Tauri 2
    ├── icons/                        # Thư mục icon build
    └── src/
        ├── main.rs                   # Entry point Tauri app & plugin registration
        ├── lib.rs                    # Export library functions
        ├── db/                       # Tầng cơ sở dữ liệu SQLite
        │   ├── mod.rs                # Khởi tạo kết nối & connection pool
        │   ├── migrations.rs         # Tự động khởi tạo schema bảng & FTS5
        │   ├── queries.rs            # Các hàm tìm kiếm & cập nhật batch
        │   └── models.rs             # Structs ánh xạ bảng SQLite
        ├── engine/                   # Động cơ quét & theo dõi
        │   ├── mod.rs                # Coordinator điều phối chính
        │   ├── scanner.rs            # Module duyệt đệ quy (walkdir)
        │   ├── watcher.rs            # Module nhận sự kiện I/O (notify)
        │   ├── debouncer.rs          # Module gom sự kiện & chống bão I/O
        │   └── reconciler.rs         # Module quét đối chiếu delta & bảo vệ ổ ngoài
        ├── commands/                 # Các hàm xử lý Tauri IPC commands
        │   ├── search.rs             # search_files, get_system_status
        │   ├── roots.rs              # add_watched_root, remove_watched_root, refresh_root
        │   ├── actions.rs            # reveal_file, open_file, copy_file_path
        │   └── settings.rs           # get_settings, update_settings
        └── utils/                    # Tiện ích bổ trợ
            ├── paths.rs              # Chuẩn hóa đường dẫn, kiểm tra lồng nhau
            └── platform.rs           # Lệnh reveal/open riêng cho macOS & Windows
```

---

## 6. Lộ trình Triển khai Triệt để (Vertical Slice Roadmap)

Dự án được phân rã thành 4 giai đoạn bàn giao thực chất theo đúng Scope v1.0:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   LỘ TRÌNH 4 GIAI ĐOẠN TRIỂN KHAI                      │
├─────────┬───────────────────────────────┬──────────────────────────────┤
│ Giai đoạn│ Hạng mục Bàn giao Cốt lõi     │ Tiêu chuẩn Nghiệm thu        │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Phase 1 │ Quản lý Thư mục, Quét đệ quy, │ - Mở hộp thoại chọn folder   │
│         │ Lưu SQLite, Tìm kiếm cơ bản   │ - Quét đệ quy walkdir vào DB │
│         │                               │ - Tìm kiếm tên tệp <10ms     │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Phase 2 │ Chạy nền Khay hệ thống,       │ - Đóng cửa sổ không thoát    │
│         │ Phím tắt toàn cục, File Watcher,│ - Nhận diện tạo/xóa/đổi tên  │
│         │ Mở vị trí tệp Native Reveal   │ - Bấm Reveal mở đúng Finder  │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Phase 3 │ Quét đối chiếu Delta,         │ - Ổ ngoài ngắt không mất DB  │
│         │ Bảo vệ Ổ đĩa ngoài Offline,   │ - Khởi động lại app tự sync  │
│         │ Xử lý thư mục lồng nhau,      │ - Thư mục con tự deduplicate │
│         │ Chống bão sự kiện dồn dập     │ - Nuốt 10,000 sự kiện êm ru  │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Phase 4 │ Hoàn thiện giao diện chuẩn mực,│ - 1 hàng chrome 32px chuẩn   │
│         │ Settings, Updates, About,     │ - Đóng gói macOS .app + Win  │
│         │ Đóng gói & Ký số 2 nền tảng   │ - QA 14 kịch bản đạt 100%    │
└─────────┴───────────────────────────────┴──────────────────────────────┘
```

---

## 7. Ranh giới Tuân thủ & Cam kết An toàn

1. **Tuyệt đối không xâm phạm tệp người dùng:** Mọi thao tác I/O trên tệp người dùng chỉ dừng ở mức `fs::metadata` để đọc kích thước và thời gian sửa đổi. Không có bất kỳ dòng code nào gọi `fs::write`, `fs::remove_file`, hoặc `fs::rename` đối với dữ liệu của người dùng.
2. **Không phân mảnh tài liệu:** Toàn bộ thông số kỹ thuật được cập nhật đồng bộ xuyên suốt 7 file đặc tả, không để lại bất kỳ mâu thuẫn logic nào giữa API, Wireframe, Database Schema và Tiêu chuẩn Nghiệm thu.
3. **No-LaTeX Policy:** Tuân thủ 100% quy định không dùng cú pháp LaTeX; sử dụng ký tự Unicode trực quan (`×`, `→`, `≥`, `≤`, `≠`).
