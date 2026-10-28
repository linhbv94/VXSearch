# 06. Kịch bản Trình diễn & Demo Playbook — VXSearch (`_spec6_demo_presentation`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Tài liệu liên quan:** [00_system_overview.md](00_system_overview.md) | [02_feature_flow.md](02_feature_flow.md) | [03_ui_wireframe.md](03_ui_wireframe.md)

---

## 1. Định hình Thông điệp Cốt lõi & Khoảnh khắc "Wow" (Wow Factor)

### 1.1. Thông điệp Định vị Sản phẩm (Core Value Proposition)
> **"VXSearch — Tiện ích tìm kiếm tệp cục bộ siêu tốc trong các thư mục bạn chọn: Bật bằng phím tắt tức thì, tìm kiếm sub-10ms, mở đúng vị trí tệp trong Finder và Explorer, hoàn toàn an toàn và tôn trọng quyền riêng tư."**

### 1.2. Ba Khoảnh khắc "Wow" Đắt giá trong Buổi Demo
1. **Tìm kiếm Tức thì Nhanh như Điện giật (Sub-10ms Instant Query on 100k+ Files):**
   - Người xem chứng kiến: Ngay khi ngón tay vừa gõ xong từ khóa, danh sách kết quả đã hiện ra mượt mà và tức thì. Thời gian thực thi truy vấn SQLite ở mức sub-10ms, không có vòng quay loading, không có độ trễ giật cục.
2. **Định vị Tệp Chuẩn Native 1-Chạm (Precision Reveal in Finder/Explorer):**
   - Nhấn phím `Cmd+Enter` (macOS) hoặc `Ctrl+Enter` (Windows): Cửa sổ Finder/Explorer mở ra ngay lập tức và **bôi đen chọn chính xác tệp tin đó** nằm sâu trong 5 tầng thư mục con, xóa tan nỗi phiền toái phải tự bấm tìm tay.
3. **Phản xạ Thời gian thực Mượt mà (Zero-Lag Real-Time Sync):**
   - Người thuyết trình vừa tạo một file mới hoặc đổi tên một thư mục bên ngoài Desktop/Terminal: Ngay lập tức kết quả trên màn hình VXSearch nhảy số và cập nhật theo mà không cần bấm F5 hay quét lại.

---

## 2. Kịch bản Trình diễn Chi tiết theo Thời gian (Timeline Script — 5 Phút)

### Phút 00:00 – 01:00: Nỗi đau Thực tế & Mở Màn
- **Hành động Người trình bày:** Mở máy tính, mở Finder/Explorer và gõ tìm kiếm một tệp dự án, chỉ ra tốc độ chậm và kết quả rác từ hệ thống.
- **Lời dẫn (Speech):**
  > "Chào mọi người. Trong công việc hằng ngày, chúng ta liên tục phải tìm kiếm các tệp tài liệu, hợp đồng, ảnh thiết kế hay mã nguồn. Nhưng Spotlight trên Mac hay Windows Search thường quét cả ổ cứng, trả về hàng đống kết quả rác và làm nóng máy. Trong khi đó, Everything thì chỉ chạy trên Windows và đòi quyền quản trị. Hôm nay, tôi xin giới thiệu **VXSearch** — tiện ích tìm kiếm tệp siêu nhẹ chạy trên cả Windows và macOS, chỉ tìm kiếm chính xác trong các thư mục bạn chủ động chọn."
- **Thao tác demo:** Nhấn tổ hợp phím tắt `Cmd+Shift+F` (hoặc click icon trên Menu Bar/Tray). Cửa sổ tìm kiếm Dark-mode sang trọng hiện ra ngay lập tức ở giữa màn hình.

### Phút 01:00 – 02:00: Thêm Thư mục Dự án & Quét Lập Chỉ mục Siêu tốc
- **Hành động Người trình bày:**
  1. Bấm vào nút `[📂 Thư mục theo dõi]` trên thanh titlebar 32px.
  2. Bấm `[+ Thêm thư mục mới]` và chọn thư mục mẫu `Projects` chứa khoảng 50,000 tệp tin.
  3. Cho người xem thấy thanh tiến trình `walkdir` chạy mượt mà, ghi nhận hàng chục nghìn tệp chỉ trong vòng 1.5 giây.
- **Lời dẫn (Speech):**
  > "Khác với các công cụ khác, VXSearch cho bạn quyền kiểm soát 100%: bạn muốn tìm ở đâu thì thêm thư mục đó vào. Ứng dụng chỉ đọc các metadata cơ bản như tên, kích thước, ngày sửa đổi mà tuyệt đối KHÔNG đọc nội dung bên trong tệp, đảm bảo tính bảo mật và nhẹ máy tuyệt đối."

### Phút 02:00 – 03:15: Trải nghiệm Tìm kiếm Thời gian thực & Bộ lọc Phân loại
- **Hành động Người trình bày:**
  1. Gõ từ khóa `proposal 2026`. Kết quả hiện ra tức thì sau 3ms.
  2. Nhấp vào filter chip `[📄 Tài liệu]`: Danh sách lập tức thu hẹp chỉ còn các tệp `.pdf`, `.docx`, `.xlsx`.
  3. Dùng các phím mũi tên `↑ / ↓` trên bàn phím để di chuyển thanh chọn sáng màu Electric Cyan.
- **Lời dẫn (Speech):**
  > "Hãy nhìn tốc độ phản hồi: truy vấn trả về tức thì (thời gian thực thi SQLite ở mức sub-10ms) cho hơn 100,000 tệp tin nhờ động cơ SQLite B-Tree và FTS5 trigram tối ưu hóa cao. Bạn hoàn toàn không cần dùng chuột, mọi thao tác đều có thể điều khiển 100% bằng bàn phím."

### Phút 03:15 – 04:15: Thao tác Reveal Native & Phản xạ với Thay đổi Ngoài Đĩa
- **Hành động Người trình bày:**
  1. Chọn tệp `Q3_Financial_Audit.pdf` và nhấn `Cmd + Enter`.
  2. Cửa sổ Finder mở ra, tệp đích được chọn và bôi đen nổi bật giữa hàng trăm tệp khác.
  3. Mở Terminal hoặc cửa sổ phụ, chạy lệnh tạo tệp mới: `touch /Projects/urgent_patch_v1.0.rs`.
  4. Quay lại màn hình VXSearch: Gõ `urgent_patch` → Tệp mới xuất hiện ngay lập tức mà không cần bấm làm mới.
- **Lời dẫn (Speech):**
  > "Một tính năng mà mọi lập trình viên và dân văn phòng đều mê mẩn: Reveal in Finder hoặc Show in Explorer. Một cú nhấn phím sẽ đưa bạn đến đúng vị trí tệp. Đồng thời, bộ lắng nghe notify hoạt động 24/7 trong nền, bắt trọn mọi thao tác tạo, sửa, xóa, đổi tên tệp mà không gây hao pin."

### Phút 04:15 – 05:00: Bảo vệ Ổ đĩa ngoài Offline, Cài đặt VXUtilities & Kết luận
- **Hành động Người trình bày:**
  1. Rút tượng trưng một USB/ổ cứng ngoài: Trạng thái chuyển sang `Ổ ngoài ngắt kết nối`, toàn bộ kết quả vẫn lưu nguyên vẹn trong CSDL.
  2. Mở Hộp thoại Cài đặt (Settings), lướt qua tab Updates, About và tab `Ủng hộ tác giả` với mã QR VietQR căn giữa sắc nét.
  3. Bấm Escape để ẩn cửa sổ, chỉ vào biểu tượng chạy nền trên Menu Bar.
- **Lời dẫn (Speech):**
  > "Đặc biệt, nếu bạn theo dõi các thư mục trên ổ cứng di động, khi rút ổ đĩa ra, VXSearch không bao giờ xóa nhầm dữ liệu chỉ mục của bạn. Cắm lại là tự động đồng bộ. VXSearch là công cụ gọn nhẹ, độc bản, hoàn toàn miễn phí và tôn trọng quyền riêng tư. Cảm ơn mọi người đã theo dõi!"

---

## 3. Bộ Dữ liệu Mẫu (Seed Data Preparation)

Để buổi trình diễn đạt hiệu ứng trực quan tối đa, chuẩn bị sẵn cấu trúc thư mục mẫu tại `~/VXSearch_Demo/`:

```text
VXSearch_Demo/
├── Projects/
│   ├── VXUtilities/
│   │   ├── vxsearch/src-tauri/src/main.rs
│   │   ├── vxsearch/src/App.tsx
│   │   └── vxshot/docs/spec/00_system_overview.md
│   └── MobileApp/
│       ├── ios/AppDelegate.swift
│       └── android/MainActivity.kt
├── Corporate_Documents/
│   ├── Financial_Report_Q3_2026.pdf
│   ├── NDA_Partner_Agreement_Signed.docx
│   ├── Employee_Payroll_Master_2026.xlsx
│   └── Company_Pitch_Deck_Final.pptx
└── Marketing_Assets/
    ├── hero_banner_dark_theme.png
    ├── product_demo_reel_4k.mp4
    ├── brand_identity_guidelines.pdf
    └── app_icon_vector.svg
```

---

## 4. Bộ FAQ Câu hỏi Thường gặp & Phương án Xử lý Sự cố Live Demo

### 4.1. Bộ Câu hỏi Thường Gặp (FAQ)

**Câu 1: VXSearch khác gì so với Spotlight trên macOS?**
> *Trả lời:* Spotlight quét toàn bộ ổ đĩa, tiêu tốn nhiều CPU/pin và trả về cả kết quả từ email, bookmarks web. VXSearch chỉ quét và theo dõi đúng các thư mục bạn chọn, hoạt động nhẹ tênh, bảo vệ quyền riêng tư 100% và không bao giờ đọc trộm nội dung tệp.

**Câu 2: Cơ sở dữ liệu của VXSearch có bị phình to làm tốn dung lượng ổ cứng không?**
> *Trả lời:* Hoàn toàn không. VXSearch chỉ lưu các trường metadata văn bản cơ bản (tên, đường dẫn, dung lượng, mtime). Một danh mục chứa 200,000 tệp tin chỉ chiếm khoảng 30MB – 45MB dung lượng SQLite, vô cùng nhỏ gọn.

**Câu 3: Nếu tôi đổi tên thư mục cha chứa 10,000 tệp thì sao?**
> *Trả lời:* Bộ điều phối trong Rust sẽ tự động nhận diện sự kiện đổi tên của thư mục cha và cập nhật lại đường dẫn cho toàn bộ cây con trong một transaction SQLite duy nhất một cách an toàn và nhanh chóng mà không cần quét lại từ đầu.

---

### 4.2. Phương án Xử lý Sự cố Kỹ thuật tại Buổi Demo (Live Contingency)

| Tình Huống Sự Cố | Nguyên Nhân Có Thể | Phương Án Khắc Phục Tức Thì |
|:---|:---|:---|
| Nhấn `Cmd+Shift+F` nhưng cửa sổ không bật lên | Phím tắt bị ứng dụng khác chiếm giữ hoặc app chưa chạy | Click trực tiếp vào biểu tượng VXSearch trên Menu Bar / Khay hệ thống. |
| Bấm Reveal nhưng Finder không highlight file | Tệp vừa bị di chuyển hoặc đổi tên ngoài đĩa | Giải thích tính năng tự phát hiện `E_STALE_FILE`: show thông báo toast và làm mới kết quả. |
| Quét thư mục có quá nhiều tệp bị từ chối quyền đọc | Thư mục hệ thống hoặc phân vùng bảo mật | Cho người xem thấy huy hiệu cảnh báo quyền đọc `EACCES` hoạt động đúng như thiết kế an toàn. |
