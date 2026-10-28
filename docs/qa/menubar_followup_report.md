# VXSearch — Dock và tìm nhanh từ menu bar

Ngày: 2026-10-28. Đã triển khai theo yêu cầu bắt đầu ngay; **lịch tự động đã tắt (PAUSED)**. Bản local 0.1.0 dùng SDK 27.0. Không commit, push hoặc release.

## Thay đổi

1. Đóng hoặc ẩn main window trên macOS chuyển app sang Accessory để rời Dock; engine tiếp tục theo dõi nền. Mở main chuyển lại Regular. Quit thoát hoàn toàn. Nếu popup đang hiện, Reopen giữ popup thay vì tự chuyển sang main.
2. Cạnh tên VXSearch trên titlebar dùng glyph Search SVG, kích thước 16px và màu cyan. Quy chuẩn chung và master theme đã ghi cách dùng này cho các app sau. Bố cục Windows vẫn giữ menu trái và ẩn icon/tên.
3. Click trái menu bar mở popup 380×64 chỉ có ô nhập và nút Tìm. Enter hoặc nút mới mở main. Mailbox với ID/ACK giữ nguyên keyword Unicode khi main chưa sẵn sàng; ACK cũ không xóa request mới. Popup đóng khi Escape hoặc mất focus. Blank, IME và submit trùng được chặn.

Trên Mac, chọn màn hình bằng tọa độ logical native và đặt popup bằng LogicalPosition theo scale màn đích. Windows dùng PhysicalPosition. Cửa sổ chính giữ native chrome/Spaces; chỉ popup được hiển thị theo Space hiện tại. Thời gian truy vấn được định dạng hai chữ số thập phân để không lấn ô nhập.

## Bằng chứng

- TypeScript/Vite build đạt. **13 nhóm UI chính và 7 nhóm popup fixture đạt**, không có page errors. Popup fixture dùng hai cửa sổ và broker IPC để kiểm cold main/ACK, tách khỏi dữ liệu app thật.
- **4 test Rust shell đạt:** mailbox/ACK, bảo toàn pending query khi input sai, và geometry với tray trên/dưới/origin âm. Core giữ nguyên source đã qua 18 test ở baseline.
- **Native Mac:** người dùng hỗ trợ click icon menu bar vì CUA không truy cập SystemUIServer. CUA quan sát popup chỉ có input/nút, nhập `bao cao` và Enter. Main nhận đúng keyword, tìm được một kết quả `Báo cáo mẫu 2026.txt`.
- Native picker thêm root fixture thành công. Close chuyển native activation policy sang **1 (Accessory)**; submit chuyển lại **0 (Regular)**. Watcher vẫn cập nhật khi tạo/xóa probe trong lúc chạy nền. Cmd+Enter mở Finder tại `nested` và chọn đúng tệp Unicode. Cmd+Q thoát process; khởi động lại vẫn giữ root/index.
- Gỡ root fixture qua confirmation trong UI đưa chỉ mục về 0 root/0 entry. Tệp nguồn vẫn còn, nguyên nội dung. Byte và mtime được kiểm không đổi qua lượt background watcher probe. Không để dữ liệu QA trong chỉ mục người dùng.
- Bundle arm64, SDK 27.0 và chữ ký ad-hoc được xác minh. [Native evidence](menubar_native_evidence.json), [popup fixture](popup_test_results.json), [UI checks](ui_test_results.json). Các log local nằm cùng thư mục và được Git ignore.

Bản cuối chỉ bổ sung định dạng thời gian hai chữ số thập phân sau lượt native popup. Đã chạy lại 13 nhóm UI, mở native sạch và kiểm Close → Accessory trên artifact cuối; hash từng lượt được tách trong native evidence.

## Điều phối và giới hạn

Agy conversation `4803f4b5-20a5-403a-b79d-d0b8e31c3554`: dùng vòng sửa/review 2/3, còn 1; không gọi CLI tham vấn. Grants tạm đã khôi phục. Codex phụ trách shell/handoff/tích hợp và review độc lập, sửa hai lỗi mixed-scale dựa trên source dependency.

Chưa kiểm Windows native/installer, Mac Intel, USB/sleep/TCC thật hoặc màn hình phụ mixed 1x/2x. Unit geometry và review source không thay runtime trên nhiều màn hình. Escape/IME/double Enter được kiểm bằng browser fixture; không đánh đồng với native proof. Chưa updater, notarization hoặc release. Ba yêu cầu follow-up đã triển khai và qua smoke Mac trong phạm vi trên; nghiệm thu v1.0 đa nền tảng vẫn cần QA tương ứng.
