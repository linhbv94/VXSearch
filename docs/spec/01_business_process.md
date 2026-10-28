# 01. Quy trình và quy tắc nghiệp vụ VXSearch

> Version: 1.1.0 — Ngày cập nhật: 2026-10-28
> Hợp đồng ưu tiên: [07_implementation_contract.md](07_implementation_contract.md).

## Trách nhiệm

User chọn phạm vi và xác nhận gộp/định vị lại/gỡ theo dõi. UI hiển thị trạng thái và gọi IPC. Shell chỉ chọn thư mục hoặc điều hướng native. Engine xác minh path/identity, lập chỉ mục metadata và bảo toàn DB.

| Tình huống | Quyết định |
|---|---|
| Root mới độc lập | Thêm root, watch trước scan |
| Root đã có hoặc con của root có sẵn | Từ chối với lỗi cụ thể |
| Root mới bao trùm các root con | Trả covered IDs, hỏi xác nhận; kiểm lại IDs trước transaction |
| Xác nhận gộp | Tạo cha → chuyển root_id của files → xóa root con → commit → watcher/scan cha |
| Gỡ theo dõi | Xóa association/index qua FK cascade, không đụng nguồn |
| Định vị lại | User chọn root mới; kiểm overlap, cập nhật identity và tái lập index root đó |
| Root không thấy/quyền bị từ chối | Giữ index, hiện lỗi, chặn mở/reveal |
| Identity khác | Giữ index, yêu cầu định vị lại xác nhận |
| Quét có lỗi/hủy/identity khác | Không sweep hàng cũ |
| Đủ điều kiện quét hoàn chỉnh | Sweep chỉ root hiện tại theo generation khác |
| Event queue tràn hoặc rename cây | Dirty root, đối chiếu đầy đủ |
| User muốn Open/Reveal tệp đã mất | Báo stale, không trực tiếp xóa DB từ action |

## Vòng đời thường ngày

Mở app → nạp roots/index/settings → đăng ký watcher → đối chiếu mọi root, kể cả khởi động lại dưới60s. Query luôn dùng chỉ mục đã commit; đang quét sẽ chưa thấy toàn bộ dữ liệu mới. Sau scan, xử lý sự kiện đã xếp hàng theo metadata hiện tại; queue tràn kích hoạt đối chiếu lại.

Khi app chạy, gom sự kiện có giới hạn và định kỳ10phút đối chiếu để bù gap/resume. Không giám sát khi Quit hoặc OS dừng tiến trình. Mất root hủy watcher cũ, giữ index; khi đúng identity xuất hiện lại, đăng ký watcher và đối chiếu trước khi active.

Đóng cửa sổ mặc định ẩn vào tray; setting tắt chạy nền thì đóng sẽ thoát. Quit luôn thoát, dừng worker có kiểm soát. Hotkey không đăng ký được sẽ thử fallback; cả hai lỗi vẫn dùng tray và UI báo lỗi thật.

## Riêng tư

Chỉ đọc metadata cần thiết. Native Open do user chủ động có thể mở nội dung bằng app mặc định; scanner không làm việc này. Không đọc nội dung để index; không copy path/tên tệp ra mạng. Clipboard là hành động user chọn. Gỡ root/VACUUM chỉ tác động DB riêng VXSearch.
