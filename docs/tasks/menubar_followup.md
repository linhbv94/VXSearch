# VXSearch — Các thay đổi chờ hạn mức 5 giờ khôi phục

Ngày ghi nhận: 2026-10-28. Trạng thái: **đã triển khai, build/QA local đạt; schedule đã tắt theo lệnh user**.

User yêu cầu ghi nhận trước, đợi cửa sổ5giờ đầy lại mới triển khai. Không dùng Product Studio. Quyền điều phối task VXSearch từ đầu đến cuối đã có; giữ bộ đếm Agy1/3vòng đã dùng, còn2.

## 1. Close cửa sổ → chạy nền chỉ trên menu bar

- Khi đóng/ẩn cửa sổ chính trên macOS với close-to-tray: cửa sổ biến mất và app được gỡ khỏi Dock; engine/watcher vẫn chạy qua menu bar.
- Popup tìm nhanh không làm app xuất hiện lại trên Dock. Khi main window được mở có thể khôi phục trạng thái Dock phù hợp; phải kiểm native activation/lifecycle thay vì chỉ ẩn DOM.
- Quit/Thoát là thoát hẳn tiến trình, không diễn giải thành tiếp tục chạy nền. Không xóa database hoặc chỉ mục khi Close.
- QA: Close/shortcut/tray/submit search/Quit/reopen, Mission Control/Spaces và native controls; không đánh đồng compile với native lifecycle PASS.

## 2. Icon cạnh tên trên titlebar

Dùng **glyph SVG đại diện chức năng** theo [ảnh user cung cấp](../qa/titlebar_glyph_reference.png): shield cho Clean, code cho DevSync, play cho Media; VXSearch dùng glyph tìm kiếm phù hợp. Giữ size16px/gap6px và màu accent theo theme. Không dùng app icon PNG/ICNS/ICO, squircle/ảnh logo thu nhỏ ở vị trí này. App icon vẫn phục vụ bundle/Dock/installer; quy chuẩn Windows menu trái/ẩn icon+tên không đổi.

Đã yêu cầu ghi ngay vào [quy chuẩn UI chung](../../../_summary/standard_docs/desktop_ui_standards.md) và [master theme](../../../_summary/standard_docs/master_theme.md), áp dụng cả app sau. Chỉ cập nhật quy chuẩn lúc ghi nhận; không tự sửa code toàn suite trong task này.

## 3. Click menu bar → popup search nhỏ

- Click trái icon menu bar mở/đóng popup gọn neo gần icon, **chỉ có ô nhập keyword và nút Search**; không tự mở main window, không thêm results/filter/settings vào popup.
- Focus ô nhập để gõ; chưa submit thì main window không được tự hiện. Enter hoặc nút Search với keyword có nội dung mới đóng popup và mở/focus main window, chuyển nguyên query rồi tìm kiếm.
- Keyword rỗng/whitespace không mở main. IME Enter khi đang composing không submit nhầm. Escape/click ngoài đóng popup, vẫn chạy nền menu bar.
- Cần handoff query có lưu/ack khi frontend main chưa ready hoặc vừa khởi tạo; tránh emit quá sớm mất keyword. Popup giới hạn trong work area với multi-monitor/scale, giữ theme và keyboard accessibility.
- Menu ngữ cảnh/tray vẫn có lối mở Settings/quản lý thư mục và Quit; click trái dành cho popup như trên. Không thay engine/schema tìm kiếm trong phần UX này nếu không cần.

## Lịch và điều kiện thực thi

Usage đọc trực tiếp: primary300phút dùng94%, reset epoch1793176395 = **15:33:15 ngày28/10/2026 (UTC+7)**. Heartbeat chat `tri-n-khai-vxsearch-sau-reset-5h` đặt lần kiểm tra đầu **15:35**. Phải đọc usage lại trước sửa code; nếu chưa có cửa sổ mới đầy thì tiếp tục chờ/hẹn lại, không tự dùng reset credit. Khi task xong tắt heartbeat để không lặp.

Trước sửa đọc spec00–07, UI/chrome/SDK standards, git diff và work log hiện tại. Update spec cùng code sau khi thực thi, chạy kiểm thử phù hợp, build local SDK27, ghi evidence native/platform còn thiếu. Không commit/push/release. Chỉ báo khi có kết quả có ý nghĩa hoặc cần user thao tác thật; không thông báo mỗi lần quota chưa đổi.

## Lệnh tiếp tục của user

User đã xác nhận reset và yêu cầu triển khai ngay/tắt schedule. Heartbeat `tri-n-khai-vxsearch-sau-reset-5h` đã chuyển PAUSED; không còn chờ mốc15:35. Agy UI dùng vòng2/3, còn1; Codex sửa native shell/query handoff và kiểm thử.

## Kết quả

Xem [báo cáo follow-up](../qa/menubar_followup_report.md). NativeMac đã kiểm CloseAccessory/submitRegular,picker,menu-popup handoff,FinderReveal,Quit/restart và gỡrootQA khôngxóanguồn. Agy2/3vòngđãdùng,còn1;grantsrestored;heartbeatPAUSED.
