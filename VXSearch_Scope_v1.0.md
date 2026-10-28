# VXSearch — Scope v1.0

## 1. Product definition

VXSearch là tiện ích tìm kiếm tệp theo **các thư mục do người dùng chủ động chọn**, hoạt động cục bộ trên Windows và macOS. Không hướng đến tìm kiếm toàn hệ thống như Everything.

**Nguyên tắc:** đa nền tảng; sử dụng hằng ngày; nhẹ và chạy nền; phạm vi kiểm soát được; không đọc nội dung tệp; không sửa, di chuyển hoặc xóa tệp của người dùng.

## 2. Happy path

1. Mở ứng dụng (hoặc dùng phím tắt toàn hệ thống).
2. Thêm một hoặc nhiều thư mục cần theo dõi.
3. VXSearch quét lần đầu, lập chỉ mục cả thư mục con.
4. Đóng cửa sổ: ứng dụng vẫn chạy nền qua menu bar (macOS) hoặc system tray (Windows).
5. Khi ứng dụng đang chạy, thay đổi tệp/thư mục được theo dõi và cập nhật chỉ mục.
6. Mở giao diện tìm kiếm, nhập tên tệp hoặc phần mở rộng.
7. Chọn kết quả → **Open in Finder / Show in Explorer** (hiển thị và chọn đúng tệp trong thư mục chứa nó); có thể mở tệp bằng ứng dụng mặc định.

**Lưu ý:** “24/7” nghĩa là theo dõi khi tiến trình đang hoạt động và hệ thống cho phép. Khi máy ngủ, ứng dụng thoát hoặc ổ đĩa mất kết nối, cần quét đối chiếu khi hoạt động lại; không cam kết không bỏ lỡ sự kiện.

## 3. Functional scope

### P0 — v1.0

- Thêm nhiều thư mục; xóa thư mục khỏi danh sách theo dõi.
- Quét đệ quy khi thêm thư mục; hiển thị trạng thái quét và lỗi truy cập.
- Theo dõi tạo/xóa/đổi tên/di chuyển tệp và thư mục trong phạm vi đã chọn.
- Chạy nền qua menu bar/system tray; đóng cửa sổ không thoát tiến trình; có lệnh **Quit** rõ ràng.
- Phím tắt toàn hệ thống để hiện/ẩn cửa sổ tìm kiếm (có phương án thay thế khi phím bị chiếm).
- Tìm theo tên tệp, phần mở rộng và đường dẫn trong phạm vi đã lập chỉ mục.
- Hiển thị tên, loại tệp, đường dẫn; mở tệp và hiển thị tệp trong Finder/Explorer.
- Lưu danh sách thư mục và chỉ mục cục bộ; khôi phục sau khi khởi động lại.
- Quét đối chiếu sau khi ứng dụng ngừng hoạt động hoặc phát hiện mất sự kiện.
- Xử lý thư mục lồng nhau để tránh chỉ mục trùng lặp.
- Phân biệt ổ ngoài tạm không khả dụng với tệp đã bị xóa.
- Không chỉnh sửa nội dung hoặc thuộc tính tệp nguồn.

### P1 — Sau v1.0

- Bộ lọc kích thước và ngày sửa đổi.
- Tìm kiếm gần đúng (fuzzy search — tìm theo độ tương đồng).
- Tùy chọn tự khởi động cùng hệ điều hành (mặc định tắt).
- Điều chỉnh loại trừ thư mục con hoặc mẫu tệp.

### P2 / ngoài phạm vi ban đầu

- Xem trước nội dung tệp.
- Tìm kiếm bên trong tài liệu.
- Lập chỉ mục toàn bộ hệ thống.
- Đồng bộ đám mây, tài khoản, máy chủ tìm kiếm.
- Chỉnh sửa, di chuyển, xóa hoặc quản lý tệp hàng loạt.

## 4. Tech stack

| Layer | Technology | Responsibility |
|---|---|---|
| Desktop shell | Tauri 2 | Windows/macOS, cửa sổ, tray, shortcut |
| Backend | Rust | Quét, theo dõi, lập chỉ mục, truy vấn |
| UI | React + TypeScript + Vite | Quản lý thư mục, tìm kiếm, kết quả |
| Initial scan | `walkdir` | Duyệt cây thư mục |
| File watching | `notify` | Nhận thông báo thay đổi đa nền tảng |
| Database | SQLite | Lưu chỉ mục và cấu hình |
| Search | SQLite indexes; cân nhắc FTS5 sau khi đo | Tìm tên/đường dẫn |
| Optional fuzzy matching | `nucleo-matcher` | P1 |
| Tray / hotkey | Tauri plugins tương ứng | Chạy nền và mở nhanh |
| File reveal | Native OS integration | Chọn tệp trong Finder/Explorer |

Không cần Elasticsearch, Meilisearch, dịch vụ mạng hay cơ chế truy cập trực tiếp NTFS/APFS trong v1.0.

## 5. Architecture

```text
Selected folders
  ├── Initial/reconciliation scan (walkdir)
  └── Filesystem events (notify)
                ↓
      Rust indexing coordinator
      - normalize paths
      - coalesce events
      - detect gaps/errors
      - reconcile state
                ↓
              SQLite
                ↓
        Search UI (React)
                ↓
       Open / Reveal in OS
```

### Data model tối thiểu

- `watched_roots`: id, path, availability/status, last_scan_at, scan_state.
- `files`: root association, normalized path, display path, name, extension, type, size, modified_at, last_seen_scan_id.
- Unique identity/constraint cần xử lý đúng khi nhiều thư mục theo dõi chồng lấn; không giả định đường dẫn là định danh ổn định qua mọi thao tác đổi tên.

## 6. Reliability & privacy requirements

- **Read-only đối với dữ liệu người dùng:** chỉ đọc metadata cần thiết; chỉ ghi vào cơ sở dữ liệu/cấu hình riêng của VXSearch.
- Không mở hoặc trích xuất nội dung tệp để lập chỉ mục.
- Gộp sự kiện dồn dập (debounce/coalescing), không quét lại toàn bộ trên mỗi sự kiện.
- Khi sự kiện không đáng tin cậy hoặc bị mất: đánh dấu vùng ảnh hưởng và quét đối chiếu.
- Khi đổi tên thư mục cha: cập nhật hoặc quét đối chiếu toàn bộ cây con liên quan.
- Khi ổ ngoài mất kết nối: đánh dấu **unavailable**, không xóa hàng loạt kết quả như thể tệp đã bị xóa.
- Khi ứng dụng chạy lại: quét đối chiếu để xử lý thay đổi trong thời gian tắt/ngủ.
- Quy định rõ cách xử lý symlink (liên kết tượng trưng), vòng lặp và đường dẫn ra ngoài phạm vi; mặc định không đi theo symlink đến thư mục ngoài phạm vi.
- Kiểm tra quyền truy cập, lỗi I/O, đường dẫn Unicode và khác biệt phân biệt chữ hoa/chữ thường.
- Trước khi mở hoặc hiển thị kết quả, xác minh đường dẫn còn tồn tại; thông báo nếu chỉ mục chưa kịp cập nhật.
- Không tự động gửi metadata, tên tệp hoặc đường dẫn lên mạng.

## 7. Acceptance criteria

1. Thêm tối thiểu hai thư mục độc lập, quét và tìm thấy tệp trong thư mục con.
2. Tạo, đổi tên, di chuyển và xóa tệp trong phạm vi theo dõi; kết quả tìm kiếm cập nhật mà không cần thao tác thủ công khi watcher hoạt động bình thường.
3. Đổi tên thư mục cha chứa nhiều tệp; không còn đường dẫn cũ sai trong chỉ mục sau khi hệ thống ổn định/đối chiếu.
4. Đóng cửa sổ nhưng biểu tượng tray/menu bar vẫn hoạt động; phím tắt mở lại cửa sổ.
5. Quit hoàn toàn rồi mở lại: danh sách thư mục vẫn còn và chỉ mục được đối chiếu với thay đổi đã xảy ra.
6. Ổ ngoài bị tháo rồi gắn lại: không xóa nhầm chỉ mục; trạng thái và kết quả được phục hồi sau đối chiếu.
7. Chọn kết quả và dùng Reveal: Finder/Explorer mở đúng thư mục và chọn đúng tệp.
8. Không có thao tác nào sửa/xóa/di chuyển tệp nguồn; không đọc nội dung tệp để tìm kiếm.
9. Chạy kiểm thử trên cả Windows và macOS, bao gồm tên tệp Unicode, quyền truy cập bị từ chối và thư mục lồng nhau.

## 8. Delivery phases & effort

| Phase | Deliverable | Rough estimate |
|---|---|---|
| 1 | Thêm thư mục, quét, lưu SQLite, tìm kiếm | 1–2 ngày |
| 2 | Tray, hotkey, watcher, mở vị trí tệp | 2–4 ngày |
| 3 | Quét đối chiếu, ổ ngoài, lỗi, kiểm thử | 3–7 ngày |
| 4 | Đóng gói và hoàn thiện Windows/macOS | 2–4 ngày |

**Tổng tham khảo:** 8–17 ngày làm việc với AI hỗ trợ và người kiểm thử; không phải cam kết tiến độ. Độ khó tương đối **4–5/10**, thấp hơn đáng kể so với tìm kiếm toàn hệ thống (**7–8/10**).

## 9. Explicit non-goals

- Không cạnh tranh tốc độ quét toàn ổ đĩa với Everything.
- Không xây công cụ quản lý tệp hoặc trình xem nội dung.
- Không triển khai dịch vụ nền đặc quyền hoặc yêu cầu quyền quản trị nếu không cần.
- Không thêm hạ tầng mạng khi chức năng hoàn toàn cục bộ.

## 10. Implementation principle

**Viết thiết kế và kế hoạch kiểm thử trước khi lập trình.** Tách rõ logic chỉ mục, cơ chế theo dõi hệ thống tệp và giao diện. Chỉ xem sản phẩm đạt v1.0 khi thử nghiệm phục hồi chỉ mục và mở đúng vị trí tệp thành công trên cả hai hệ điều hành.
