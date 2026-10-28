# 06. Kịch bản demo VXSearch

Version: 1.1.0 — Ngày cập nhật: 2026-10-28

Đọc [hợp đồng triển khai](07_implementation_contract.md) và [QA](05_qa_acceptance.md). Demo chỉ trên fixture/copy do người demo chuẩn bị; mọi create/rename/delete bên dưới là thao tác bên ngoài app trên fixture. Không demo bằng dữ liệu nguồn cần giữ.

1. Mở app, thêm2 thư mục fixture. Chỉ số quét là số entries đã duyệt, không phần trăm giả.
2. Tìm `bao cao .pdf`, thử tên không dấu, đường dẫn và token ngắn. Đổi type/root/sort; mở/Reveal một tệp Unicode và kiểm selection trong OS.
3. Tạo rồi đổi tên thư mục fixture từ Finder/Explorer, quay lại tìm để thấy index cập nhật. Không hứa thời gian tuyệt đối trên mọi bộ dữ liệu.
4. Thêm thư mục cha bao trùm root con, kiểm confirmation; gộp và đối chiếu lại. Gỡ theo dõi rồi kiểm tệp nguồn vẫn còn.
5. Đóng cửa sổ, dùng tray/hotkey mở lại. Quit, sửa fixture, khởi động lại và quan sát reconciliation.
6. Chỉ demo USB nếu có thiết bị: tháo/gắn, kiểm cache offline không mất, identity mismatch phải cần định vị lại xác nhận.
7. Mở Settings, kiểm theme/phím tắt/cache/About/Support. Updates kiểm tra GitHub stable thật; offline hiển thị lỗi và retry, không giả current/latest.

Kết thúc ghi platform/artifact/version, chức năng đã thực hiện, số đo thực tế và giới hạn. Browser mock, benchmark core và build không thay demo native. Phần chưa chạy ghi CHƯA KIỂM CHỨNG.
