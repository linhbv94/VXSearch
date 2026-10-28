# 05. Tiêu chuẩn Nghiệm thu & QA Checklist — VXSearch (`_spec5_qa_acceptance`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Tài liệu nguồn phạm vi:** [VXSearch_Scope_v1.0.md](../../VXSearch_Scope_v1.0.md)  
> **Tài liệu liên quan:** [00_system_overview.md](00_system_overview.md) | [02_feature_flow.md](02_feature_flow.md)

---

## 1. Mục đích & Phạm vi

Tài liệu này định nghĩa toàn bộ tiêu chuẩn nghiệm thu (Acceptance Criteria) theo chuẩn Gherkin bao phủ 100% phạm vi P0 Scope v1.0, ma trận các trường hợp biên và kịch bản lỗi (Edge Cases & Negative Scenarios), quy tắc kiểm định tính hợp lệ dữ liệu (Validation Rules) và danh mục kiểm thử bàn giao (QA Handoff Checklist) cho ứng dụng VXSearch trên Windows và macOS.

---

## 2. Tiêu chuẩn Nghiệm thu theo Cú pháp Gherkin (Acceptance Criteria)

### Kịch bản 1: Thêm Thư mục Hợp lệ & Quét Lập Chỉ mục Ban đầu (Happy Path)
```gherkin
Scenario: Thêm thư mục mới và quét đệ quy thành công
  Given Ứng dụng VXSearch đang chạy và cửa sổ tìm kiếm đang mở
  And Người dùng mở Hộp thoại Quản lý Thư mục (Folder Manager)
  When Người dùng bấm [+ Thêm thư mục] và chọn đường dẫn "/Users/vic/Projects"
  Then Hệ thống kiểm tra đường dẫn hợp lệ và không bị trùng lặp
  And Trạng thái thư mục chuyển sang "SCANNING_INITIAL"
  And Thanh tiến trình hiển thị số lượng tệp tăng dần theo thời gian thực (scan_progress)
  And Bộ quét walkdir chỉ thu thập metadata (tên, đường dẫn, dung lượng, mtime)
  And Tuyệt đối không đọc nội dung bên trong bất kỳ tệp tin nào
  And Khi quét hoàn tất: Trạng thái chuyển sang "WATCHING_ACTIVE"
  And Tổng số tệp và dung lượng được cập nhật chính xác trên thanh trạng thái
```

### Kịch bản 2: Xử lý Thư mục Con khi Thư mục Cha đã Tồn tại (Nested Deduplication)
```gherkin
Scenario: Từ chối thêm thư mục con khi thư mục cha đã được theo dõi
  Given Thư mục cha "/Users/vic/Projects" đã có trong danh sách với trạng thái "WATCHING_ACTIVE"
  When Người dùng bấm [+ Thêm thư mục] và chọn thư mục con "/Users/vic/Projects/VXUtilities"
  Then Hệ thống phát hiện "/Users/vic/Projects/VXUtilities" nằm trong phạm vi của "/Users/vic/Projects"
  And Hệ thống từ chối tạo thêm bản ghi Root mới và không tạo thêm watcher trùng lặp
  And Hiển thị Toast thông báo: "Thư mục này đã nằm trong phạm vi theo dõi của [Projects]."
  And Cơ sở dữ liệu SQLite không phát sinh bản ghi trùng lặp
```

### Kịch bản 3: Xử lý Thư mục Cha Bao trùm Thư mục Con Đang có (Merge Confirmation)
```gherkin
Scenario: Hiển thị hộp thoại xác nhận khi thêm thư mục cha bao trùm thư mục con
  Given Thư mục con "/Users/vic/Projects/VXUtilities" đang được theo dõi độc lập
  When Người dùng bấm thêm thư mục cha cấp cao hơn "/Users/vic/Projects"
  Then Hệ thống hiển thị Modal xác nhận: "Thư mục mới bao trùm [VXUtilities]. Bạn có muốn gộp không?"
  When Người dùng chọn "Đồng ý gộp"
  Then Thư mục con "VXUtilities" được gỡ bỏ khỏi bảng watched_roots
  And Thư mục cha "Projects" được thêm vào làm Root chính
  And Các tệp thuộc "VXUtilities" được chuyển giao root_id sang Root cha mà không cần quét lại từ đầu
  And Hệ thống quét bổ sung các nhánh còn lại của thư mục "Projects"
```

### Kịch bản 4: Cập nhật Tức thì khi Tạo Tệp Mới ngoài Hệ điều hành
```gherkin
Scenario: Tự động cập nhật chỉ mục khi tệp mới được tạo trong thư mục theo dõi
  Given Thư mục "/Users/vic/Projects" đang ở trạng thái "WATCHING_ACTIVE"
  When Người dùng tạo một tệp mới ngoài Finder/Explorer: "/Users/vic/Projects/notes_2026.md"
  Then notify watcher bắt được sự kiện Create
  And Sau cửa sổ debounce 300ms, hệ thống ghi bản ghi mới vào bảng files
  And Khi người dùng gõ từ khóa "notes_2026" vào thanh tìm kiếm
  Then Kết quả xuất hiện tức thì trong danh sách mà không cần bấm quét lại thủ công
```

### Kịch bản 5: Đổi tên Thư mục Cha Chứa Nhiều Tệp (Cascade Path Update)
```gherkin
Scenario: Cập nhật đường dẫn toàn bộ cây con khi thư mục cha bị đổi tên
  Given Thư mục "/Users/vic/Projects/OldFolder" chứa 500 tệp tin đã lập chỉ mục
  When Người dùng đổi tên thư mục thành "/Users/vic/Projects/NewFolder" ngoài hệ điều hành
  Then Hệ thống nhận diện sự kiện Rename của thư mục
  And Thực thi cập nhật tiền tố đường dẫn (parent_dir và path) cho toàn bộ 500 tệp con trong SQLite
  And Sau khi hệ thống ổn định, không còn đường dẫn cũ nào chứa "OldFolder" trong kết quả tìm kiếm
  And Toàn bộ 500 tệp tin lập tức tìm thấy được dưới đường dẫn mới "NewFolder"
```

### Kịch bản 6: Cập nhật Tức thì khi Xóa Tệp ngoài Hệ điều hành
```gherkin
Scenario: Tự động xóa chỉ mục khi tệp bị xóa khỏi đĩa cứng
  Given Tệp "/Users/vic/Projects/temp_data.csv" đang tồn tại trong chỉ mục
  When Người dùng xóa tệp này vào Thùng rác (Trash / Recycle Bin)
  Then notify watcher bắt được sự kiện Remove
  And Sau cửa sổ debounce 300ms, bản ghi tệp bị xóa khỏi bảng files và files_fts
  When Người dùng gõ "temp_data.csv" vào ô tìm kiếm
  Then Kết quả trả về rỗng, tệp đã biến mất khỏi danh sách tìm kiếm
```

### Kịch bản 7: Tìm kiếm Tức thì theo Tên và Đuôi Mở rộng (Sub-10ms Instant Search)
```gherkin
Scenario: Tìm kiếm tệp theo từ khóa và phần mở rộng
  Given CSDL SQLite đang lưu trữ hơn 100,000 tệp tin
  When Người dùng nhập chuỗi truy vấn "financial report .pdf" vào ô tìm kiếm
  Then Backend Rust bóc tách: từ khóa "financial report" và phần mở rộng "pdf"
  And Truy vấn SQLite thực thi hoàn tất trong thời gian <10ms
  And Giao diện hiển thị danh sách kết quả qua bảng ảo hóa 60fps
  And Ký tự khớp trong tên tệp được bôi đậm/highlight trực quan
```

### Kịch bản 8: Định vị Tệp Native (Reveal in Finder / Explorer)
```gherkin
Scenario: Mở thư mục cha và bôi đen chọn đúng tệp khi người dùng bấm Reveal
  Given Kết quả tìm kiếm đang hiển thị dòng tệp "/Users/vic/Projects/contract.docx"
  When Người dùng chọn dòng tệp và nhấn tổ hợp phím [Cmd + Enter] (macOS) hoặc [Ctrl + Enter] (Windows)
  Then Hệ thống kiểm tra tệp còn tồn tại trên đĩa cứng
  And Trên macOS: Gọi tiến trình native "open -R" mở Finder và bôi đen tệp "contract.docx"
  And Trên Windows: Gọi "explorer.exe /select" mở File Explorer và bôi đen tệp "contract.docx"
  And Cửa sổ VXSearch không bị crash hay giật lag
```

### Kịch bản 9: Mở Tệp Bằng Ứng dụng Mặc định của Hệ điều hành
```gherkin
Scenario: Mở trực tiếp tệp bằng ứng dụng mặc định khi nhấn Enter
  Given Kết quả tìm kiếm đang trỏ vào tệp hình ảnh "/Users/vic/Projects/design.png"
  When Người dùng nhấn phím [Enter] (hoặc đúp chuột vào dòng kết quả)
  Then Hệ thống gọi lệnh mở tệp native của hệ điều hành
  And Ứng dụng xem ảnh mặc định (Preview trên macOS, Photos trên Windows) mở tệp "design.png"
```

### Kịch bản 10: Ổ đĩa ngoài Bị Ngắt Kết nối (Offline Protection — Không Xóa Chỉ mục)
```gherkin
Scenario: Bảo vệ dữ liệu chỉ mục khi ổ cứng ngoài bị rút đột ngột
  Given Thư mục "/Volumes/Samsung_T7/Archive" nằm trên ổ cứng di động đang được theo dõi
  And Bảng files đang lưu trữ 40,000 tệp thuộc thư mục này
  When Người dùng rút cáp ổ cứng ngoài khỏi máy tính
  Then Hệ thống phát hiện đường dẫn không còn truy cập được
  And Xác định đây là phân vùng di động (is_removable == true)
  And TUYỆT ĐỐI KHÔNG XÓA 40,000 bản ghi tệp khỏi CSDL SQLite
  And Trạng thái thư mục chuyển sang "UNAVAILABLE_OFFLINE"
  When Người dùng tìm kiếm một tệp trong ổ ngoài
  Then Tệp vẫn xuất hiện trong kết quả với nhãn "Ổ ngoài ngắt kết nối" và icon mờ
  And Nút Mở/Reveal bị vô hiệu hóa kèm tooltip giải thích
```

### Kịch bản 11: Ổ đĩa ngoài Kết nối lại & Tự động Quét Đối chiếu (Delta Reconciliation)
```gherkin
Scenario: Tự động đối chiếu delta khi ổ cứng ngoài được cắm lại
  Given Thư mục "/Volumes/Samsung_T7/Archive" đang ở trạng thái "UNAVAILABLE_OFFLINE"
  When Người dùng cắm lại ổ cứng ngoài vào máy tính
  Then Hệ thống phát hiện đường dẫn tồn tại trở lại
  And Tự động kích hoạt luồng Quét đối chiếu Delta (Reconciliation Scan)
  And So sánh metadata (size, mtime) giữa đĩa và SQLite
  And Cập nhật các tệp mới/sửa và xóa các tệp đã mất mà không cần xóa trắng database
  And Chuyển trạng thái thư mục về "WATCHING_ACTIVE"
```

### Kịch bản 12: Khởi động lại Ứng dụng (Persistence & Cold Start Reconciliation)
```gherkin
Scenario: Khôi phục danh sách thư mục và quét đối chiếu sau khi khởi động lại
  Given Người dùng tắt hoàn toàn ứng dụng VXSearch (Quit)
  And Trong lúc app tắt, người dùng tạo thêm 2 tệp mới và xóa 1 tệp cũ ngoài Finder
  When Người dùng mở lại ứng dụng VXSearch
  Then Toàn bộ danh sách watched_roots được nạp lại nguyên vẹn từ SQLite
  And Hệ thống thực hiện quét đối chiếu delta cho các Root
  And 2 tệp mới được bổ sung vào chỉ mục; 1 tệp cũ bị xóa khỏi chỉ mục
  And Ứng dụng sẵn sàng tìm kiếm ngay tức thì
```

### Kịch bản 13: Đóng Cửa sổ Ẩn vào Khay Hệ thống & Bật lại bằng Phím tắt Toàn cục
```gherkin
Scenario: Chạy nền trên khay hệ thống và kích hoạt nhanh bằng phím tắt
  Given Cửa sổ VXSearch đang hiển thị trên màn hình
  When Người dùng bấm nút Close (chữ X) hoặc nhấn phím [Escape] (khi ô tìm kiếm trống)
  Then Cửa sổ ẩn đi nhưng tiến trình Backend Rust vẫn chạy nền trên khay hệ thống
  When Người dùng nhấn tổ hợp phím [Cmd + Shift + F] (macOS) hoặc [Alt + Shift + F] (Windows)
  Then Cửa sổ nổi xuất hiện lại ngay lập tức giữa màn hình
  And Toàn bộ chữ trong ô tìm kiếm được tự động bôi đen để gõ từ khóa mới
```

### Kịch bản 14: Cam kết Tuyệt đối An toàn Dữ liệu (Read-Only Safety Audit)
```gherkin
Scenario: Không bao giờ sửa đổi, ghi đè hoặc xóa tệp gốc của người dùng
  Given VXSearch đang quét, giám sát và tìm kiếm trên 500,000 tệp tin của người dùng
  When Thực hiện toàn bộ các thao tác: Thêm thư mục, Xóa thư mục khỏi app, Quét lại, Tìm kiếm, Reveal
  Then Kiểm tra mã nguồn và I/O logs hệ thống:
  And Không có bất kỳ lệnh ghi fs::write nào vào tệp của người dùng
  And Không có bất kỳ lệnh xóa fs::remove_file nào vào tệp của người dùng
  And Không có lệnh mở đọc nội dung tệp (File::open) để trích xuất văn bản
  And Tệp gốc trên đĩa cứng giữ nguyên vẹn 100% checksum và mtime
```

### Kịch bản 15: Thay đổi Tệp Phát sinh Ngay trong Lúc Quét Đệ quy (Replay Buffer Verification)
```gherkin
Scenario: Bắt trọn và áp dụng sự kiện thay đổi I/O phát sinh giữa chừng khi đang quét
  Given Người dùng vừa thêm thư mục lớn chứa 100,000 tệp tin
  And Hệ thống đăng ký notify watcher TRƯỚC KHI bắt đầu duyệt walkdir
  When Trong lúc bộ quét đang duyệt tới 50% cây thư mục:
  And Người dùng tạo 1 tệp mới "urgent_patch.rs" tại nhánh thư mục đã duyệt qua
  Then Sự kiện Create được đưa an toàn vào Replay Buffer của phiên quét
  When Bộ quét duyệt xong toàn bộ cây thư mục
  Then Hệ thống tự động replay toàn bộ sự kiện trong Replay Buffer vào SQLite
  And Tệp "urgent_patch.rs" được lập chỉ mục đầy đủ mà không bị bỏ sót
```

### Kịch bản 16: Khởi động Lại Nhanh Dưới 60 Giây & Quét Đối chiếu Toàn diện
```gherkin
Scenario: Quét đối chiếu delta ngay cả khi khởi động lại ứng dụng cực nhanh
  Given Người dùng vừa tắt ứng dụng VXSearch (Quit) trong 10 giây
  And Trong 10 giây đó, người dùng sửa đổi 1 tệp và xóa 1 tệp ngoài Finder
  When Người dùng mở lại ứng dụng VXSearch
  Then Hệ thống KHÔNG bỏ qua đối chiếu (không áp dụng ngưỡng chặn 60 giây)
  And Tự động kích hoạt đối chiếu delta, cập nhật tệp sửa đổi và xóa tệp đã mất
```

### Kịch bản 17: Phân vùng Khác Được Gắn Cùng Mount Path / Drive Letter
```gherkin
Scenario: Nhận diện volume_uuid chuẩn xác, tránh nhầm ổ đĩa khác cùng mount path
  Given Ổ cứng ngoài A có volume_uuid "UUID-AAA" đã được theo dõi
  And Ổ cứng A bị rút ra, trạng thái chuyển sang "UNAVAILABLE_OFFLINE"
  When Người dùng cắm một USB B khác vào đúng cổng USB (nhận cùng mount path /Volumes/USB hoặc D:\)
  Then Hệ thống kiểm tra volume_uuid của USB B ("UUID-BBB") không khớp với "UUID-AAA"
  And Hệ thống TUYỆT ĐỐI KHÔNG quét đối chiếu đè lên chỉ mục của ổ cứng A
  And Giữ nguyên trạng thái UNAVAILABLE_OFFLINE của ổ A để bảo vệ dữ liệu
```

### Kịch bản 18: Purge Guard — Cấm Xóa Dọn Chỉ mục Khi Có Lỗi Giữa Chừng
```gherkin
Scenario: Cấm chạy câu lệnh Sweep DELETE khi phiên quét gặp lỗi hoặc bị ngắt
  Given Phiên quét đối chiếu đang chạy trên thư mục 80,000 tệp
  When Quét gặp thư mục con bị lỗi quyền truy cập EACCES hoặc ổ đĩa bị rút giữa chừng
  Then Trạng thái phiên quét được đánh dấu ERROR_INCOMPLETE
  And Hệ thống CẤM THỰC THI câu lệnh DELETE FROM files WHERE last_seen_scan_id != ?
  And Toàn bộ chỉ mục cũ vẫn được giữ nguyên vẹn, không bị xóa nhầm hàng loạt
```

---

## 3. Ma trận Truy vết Yêu cầu & Kịch bản Nghiệm thu (Traceability Matrix)

| Yêu cầu Scope P0 v1.0 | Thành phần Hệ thống | Scenarios Gherkin Phụ trách | Edge Cases Phụ trách |
|:---|:---|:---|:---|
| Thêm/xóa nhiều thư mục theo dõi | Coordinator & DB | Kịch bản 1, 2, 3 | EC-01, EC-04 |
| Quét đệ quy & báo tiến độ | `walkdir` Scanner | Kịch bản 1, 15 | EC-01, EC-02 |
| Theo dõi tạo/xóa/đổi tên thời gian thực | `notify` Watcher & Debouncer | Kịch bản 4, 5, 6, 15 | EC-03, EC-04 |
| Chạy nền Tray & Phím tắt toàn cục | Tauri 2 Shell | Kịch bản 13 | EC-06 |
| Tìm kiếm tức thì tên, đuôi, đường dẫn | SQLite B-Tree & FTS5 | Kịch bản 7 | EC-08 |
| Reveal trong Finder / Explorer | Native OS Integration | Kịch bản 8 | EC-07, EC-08 |
| Mở tệp bằng ứng dụng mặc định | OS Shell | Kịch bản 9 | EC-07 |
| Quét đối chiếu sau khi tắt/ngủ | Reconciler Engine | Kịch bản 11, 12, 16, 18 | EC-05 |
| Xử lý thư mục lồng nhau | Path Evaluator & Merge IPC | Kịch bản 2, 3 | — |
| Phân biệt ổ ngoài offline với tệp bị xóa | Volume Detector & Purge Guard | Kịch bản 10, 11, 17, 18 | — |
| Read-only 100% đối với tệp người dùng | Toàn bộ hệ thống | Kịch bản 14 | — |

---

## 3. Ma trận Kịch bản Biên & Trường hợp Tiêu cực (Edge Cases EC-01 đến EC-08)

| Mã Case | Tên Trường Hợp Biên | Điều Kiện Mô Phỏng | Kết Quả Kỳ Vọng (Expected Behavior) | Trạng Thái QA |
|:---|:---|:---|:---|:---:|
| **EC-01** | Quyền truy cập bị từ chối (EACCES) | Thư mục con bị khóa quyền đọc (chmod 000). | `walkdir` bỏ qua thư mục con bị khóa, tiếp tục quét bình thường các nhánh khác; ghi nhận cảnh báo trên giao diện. | CHƯA KIỂM THỬ |
| **EC-02** | Vòng lặp Symlink (Symlink Loop) | Tạo symlink `A -> B` và `B -> A`. | Bộ quét không đi theo symlink ngoài phạm vi (`follow_links = false`), không gây tràn bộ nhớ stack. | CHƯA KIỂM THỬ |
| **EC-03** | Bão sự kiện dồn dập (Event Storm) | Chạy `npm install` sinh ra 25,000 tệp trong 5 giây. | Debouncer gom sự kiện trong 300ms–1000ms, ghi SQLite qua 1 Transaction duy nhất; UI và CPU không bị đơ. | CHƯA KIỂM THỬ |
| **EC-04** | Đổi tên Root cấp cao nhất ngoài OS | Người dùng đổi tên thư mục gốc đã thêm (vd `Projects` -> `Projects_Old`). | Watcher báo lỗi mất đường dẫn; Root chuyển sang `ERROR_ACCESS` có nút "Định vị lại" hoặc "Xóa". | CHƯA KIỂM THỬ |
| **EC-05** | Khôi phục khi Crash đột ngột | Kill tiến trình `SIGKILL` giữa lúc đang quét đệ quy. | Mở lại app: SQLite WAL tự động rollback transaction dở dang, CSDL không bị hỏng; app tự quét lại. | CHƯA KIỂM THỬ |
| **EC-06** | Xung đột Phím tắt Toàn cục | Ứng dụng khác đã đăng ký phím `Cmd+Shift+F`. | Đăng ký thất bại không làm crash app; tự động fallback sang `Ctrl+Alt+F` và hiển thị thông báo. | CHƯA KIỂM THỬ |
| **EC-07** | Tệp bị xóa ngay trước khi Reveal | Người dùng bấm Reveal vào một tệp vừa bị xóa ngoài Finder. | Backend bắt lỗi NotFound; hiển thị Toast báo tệp đã mất; tự động xóa dòng kết quả khỏi giao diện. | CHƯA KIỂM THỬ |
| **EC-08** | Tên tệp Unicode tiếng Việt phức tạp | Tệp có tên `Bản_Kê_Khai_Tài_Chính_Đợt_3_#2026&Final (Draft).pdf`. | Tìm kiếm chính xác với tiếng Việt có dấu và không dấu; Reveal mở chuẩn xác không bị vỡ đường dẫn. | CHƯA KIỂM THỬ |

---

## 4. Quy tắc Kiểm định Tính Hợp lệ Dữ liệu (Validation Rules)

1. **Chuẩn hóa Đường dẫn (Path Canonicalization):**
   - Mọi đường dẫn thư mục trước khi ghi vào SQLite phải đi qua `dunce::canonicalize`.
   - Trên Windows: Loại bỏ tiền tố UNC dài `\\?\` nếu có thể để tương thích tuyệt đối với `explorer.exe`.
   - Không chấp nhận đường dẫn rỗng hoặc chỉ chứa khoảng trắng.
2. **Quy tắc Phân loại Tệp (File Type Classification):**
   - Dựa trên phần mở rộng chuẩn (chuyển về chữ thường, bỏ dấu chấm):
     - `document`: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `txt`, `md`, `rtf`, `csv`, `odt`.
     - `image`: `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp`, `heic`, `ico`, `tiff`, `psd`, `ai`.
     - `video`: `mp4`, `mkv`, `mov`, `avi`, `wmv`, `webm`, `m4v`, `flv`.
     - `audio`: `mp3`, `wav`, `flac`, `aac`, `ogg`, `m4a`, `wma`.
     - `code`: `rs`, `ts`, `tsx`, `js`, `jsx`, `py`, `go`, `c`, `cpp`, `h`, `html`, `css`, `json`, `yaml`, `toml`, `sql`, `sh`, `swift`.
     - `archive`: `zip`, `tar`, `gz`, `7z`, `rar`, `bz2`, `xz`.
     - `other`: Tất cả các phần mở rộng còn lại.
3. **Giới hạn Kích thước Bộ đệm & Phân trang:**
   - Mỗi câu truy vấn `search_files` trả về tối đa `limit = 50` bản ghi mỗi lần.
   - Khi người dùng cuộn tới cuối danh sách, tải tiếp trang tiếp theo (`offset = offset + 50`).

---

## 5. QA Handoff Checklist (Danh mục Bàn giao Kiểm thử)

| STT | Hạng mục Kiểm tra | Tiêu chuẩn Chấp nhận | Trạng thái Nghiệm thu |
|:---:|:---|:---|:---:|
| 1 | Bố cục 1 hàng Chrome 32px | Chuẩn `desktop_ui_standards.md`, font 12px/600, icon 16px, Mac Traffic Lights 15.5pt, Windows controls phẳng | CHƯA KIỂM THỬ |
| 2 | Thêm/Xóa Thư mục Theo dõi | Thêm thư mục qua picker native, quét đệ quy walkdir, hiển thị tiến độ và xóa sạch khi bỏ chọn | CHƯA KIỂM THỬ |
| 3 | Chống Thư mục Lồng nhau | Ngăn chặn thêm thư mục con khi cha đã có; hỏi xác nhận gộp khi thêm thư mục cha bao trùm | CHƯA KIỂM THỬ |
| 4 | Tìm kiếm Tức thì Sub-10ms | Truy vấn SQLite B-Tree/FTS5 trên 100,000+ tệp trả kết quả <10ms, cuộn 60fps qua Virtual List | CHƯA KIỂM THỬ |
| 5 | Lọc theo Phân loại Tệp | Filter chips (Docs, Images, Videos, Code, Archives) lọc chính xác theo phần mở rộng | CHƯA KIỂM THỬ |
| 6 | Real-time Watcher (notify) | Tự động cập nhật chỉ mục khi Tạo, Xóa, Đổi tên, Di chuyển tệp/folder mà không cần F5 | CHƯA KIỂM THỬ |
| 7 | Chống Bão Sự kiện (Debounce) | Gom sự kiện 300ms, batch transaction SQLite không gây lag giao diện khi git checkout | CHƯA KIỂM THỬ |
| 8 | Reveal in Finder / Explorer | Nhấn Cmd/Ctrl+Enter mở đúng thư mục và bôi đen chọn đúng tệp đích | CHƯA KIỂM THỬ |
| 9 | Mở Tệp Bằng App Mặc định | Nhấn Enter hoặc đúp chuột mở đúng app mặc định của hệ điều hành | CHƯA KIỂM THỬ |
| 10 | Bảo vệ Ổ đĩa ngoài Offline | Rút ổ cứng di động không xóa mất chỉ mục; cắm lại tự động quét đối chiếu delta | CHƯA KIỂM THỬ |
| 11 | Chạy Nền Menu Bar / Tray | Đóng cửa sổ không thoát app; icon khay có menu Quản lý, Cài đặt, Thoát hoàn toàn | CHƯA KIỂM THỬ |
| 12 | Phím tắt Toàn cục Toggle | Nhấn Cmd+Shift+F (Mac) / Alt+Shift+F (Win) hiện/ẩn cửa sổ nhanh chóng | CHƯA KIỂM THỬ |
| 13 | Điều hướng Bàn phím | Mũi tên lên/xuống chọn dòng, Esc xóa chữ hoặc ẩn cửa sổ | CHƯA KIỂM THỬ |
| 14 | Tab Ủng hộ Tác giả (VietQR) | Cấu trúc Settings VXUtilities chuẩn: Tab Support với mã QR VietQR căn giữa, nổi bật | CHƯA KIỂM THỬ |
| 15 | An toàn Dữ liệu Tuyệt đối | Không sửa, không xóa, không ghi vào tệp của người dùng; không đọc trích xuất nội dung | CHƯA KIỂM THỬ |
| 16 | Đóng gói 2 Nền tảng | macOS bundle `.app` (SDK 27.0) và Windows setup `.exe` (NSIS) | CHƯA KIỂM THỬ |
