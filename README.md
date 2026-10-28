# VXSearch

Tiện ích desktop tìm tệp theo những thư mục do bạn chọn. Tìm theo tên, đường dẫn và đuôi tệp; chỉ đọc metadata, không lập chỉ mục nội dung, không sửa/xóa/di chuyển tệp nguồn. Chạy cục bộ, không tài khoản hoặc telemetry.

## Cấu trúc

- `src/`: React + TypeScript, giao diện tiếng Việt, theme tối/sáng/hệ thống.
- `src_tauri/`: Tauri 2, tray/menu bar, global shortcut, native folder picker, Open/Reveal/Copy Path.
- `crates/search_core/`: Rust, SQLite WAL + FTS5 trigram, watcher `notify`, scanner `walkdir`.
- [Hợp đồng triển khai](docs/spec/07_implementation_contract.md): nguồn chuẩn hiện hành, ưu tiên khi mâu thuẫn bộ thiết kế 00–06.
- [Phạm vi](VXSearch_Scope_v1.0.md), [QA](docs/spec/05_qa_acceptance.md).

## Phát triển và kiểm tra

Yêu cầu Node/npm, Rust, toolchain Tauri của nền tảng. macOS bắt buộc SDK 27.0 theo baseline VXUtilities, deployment target 14.0; Windows mục tiêu x64. Chưa xác nhận runtime/installer Windows hoặc Mac Intel chỉ từ build Mac Silicon.

```sh
npm ci
npm run build
npm run test:core
npm run test:ui
cargo check --manifest-path src_tauri/Cargo.toml
npm run tauri dev
npm run tauri build -- --bundles app
```

Các lệnh từ thư mục `vxsearch`. `test:ui` dùng Chrome đã cài và server Vite local tại1420: chạy `npm run dev -- --host 127.0.0.1` trong terminal riêng, rồi chạy test; đây là fixture IPC rõ ràng, không thay kiểm thử native. Wrapper tự chọn SDKROOT từ toolchain hiện hành và chặn SDK khác 27.0. Mỗi repository tự chứa gate, không phụ thuộc source app anh em. Bộ icon gốc do user cung cấp được giữ nguyên; tray PNG render từ SVG sẵn có.

## Hành vi

Thêm thư mục qua nút quản lý thư mục. Chọn root cha bao trùm root con sẽ hỏi xác nhận gộp. Gỡ theo dõi chỉ xóa chỉ mục riêng VXSearch; không xóa nguồn. Khi đường dẫn mất/quyền bị từ chối/identity thay đổi, giữ chỉ mục cũ và hiển thị cảnh báo. Có thể chọn Định vị lại để xác nhận vị trí mới.

Tìm `bao cao .pdf` để tìm những PDF có tên/đường dẫn chứa cả `bao` và `cao`, bao gồm tiếng Việt có dấu. Các token được hiểu là literal; không có regex/toán tử FTS. Không hứa `baocao` khớp `Báo cáo` khi bỏ cả khoảng trắng. Phím tắt mặc định Cmd+Shift+F trên Mac, Alt+Shift+F trên Windows; nếu bị chiếm thử Ctrl+Alt+F, lỗi tiếp sẽ hiện cảnh báo và có thể mở qua tray. Đóng cửa sổ mặc định vẫn chạy nền trên menu bar và rời Dock trên macOS; dùng Thoát để dừng. Click icon menu bar mở popup nhỏ để nhập keyword; Enter hoặc nút Tìm mới mở cửa sổ kết quả.

Chỉ ghi vào data directory của ứng dụng (`com.vxsearch.desktop`), loại trừ dữ liệu của chính app khỏi theo dõi. Startup và đối chiếu định kỳ bù sự kiện bị lỡ, bao gồm khi ngủ/thức. Không cam kết giám sát khi tiến trình không hoạt động. Chưa cấu hình auto-update hoặc tự khởi động cùng OS trong bản triển khai ban đầu.

Các mục tiêu 500.000 tệp, <10ms và mức RAM trong thiết kế cũ cần benchmark; không phải bảo đảm hiệu năng. Browser preview chỉ hiện trạng thái trống và thông báo cần bản desktop. Kết quả kiểm chứng thực tế được lưu trong [báo cáo triển khai](docs/qa/implementation_report.md).

Tác giả: Bùi Việt Linh. [Repository](https://github.com/linhbv94/VXSearch).

## Phát hành và cập nhật

Bản1.0.0 có updater ký bằng khóa riêng Search. Main production tự kiểm khi mở, thông báo bản mới và cho chọn tải/cài/khởi động lại; Settings → Cập nhật có nút thủ công. Popup/dev/browser không kiểm cập nhật. Luồng release/checks, backupkey và giới hạn QA: [runbook](docs/desktop_release.md), [review1.0.0](docs/release_1_0_0_review.md). Không đọc nội dung nguồn để index; chỉ có kết nối GitHub cho cập nhật khi chạy bảnproduction.
