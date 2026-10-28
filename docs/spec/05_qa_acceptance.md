# 05. Nghiệm thu và ma trận QA VXSearch

Version: 1.1.0 — Ngày cập nhật: 2026-10-28

Nguồn chuẩn: [hợp đồng triển khai](07_implementation_contract.md), [scope](../../VXSearch_Scope_v1.0.md). Kết quả thực tế tại [báo cáo triển khai](../qa/implementation_report.md), không chuyển checklist dự kiến thành PASS.

## Các yêu cầu kiểm chứng

| Mã | Điều kiện → hành động → kết quả cần đạt | Lớp bằng chứng |
|---|---|---|
| AC01 | Thêm2 roots độc lập → tìm thấy cả file/thư mục con, không đọc nội dung | Core fixture + native app |
| AC02 | Thêm duplicate/con → lỗi; thêm cha → hỏi gộp; xác nhận IDs cũ → reject | Core + UI |
| AC03 | Merge hợp lệ → chuyển associations trước cascade, giữ stable IDs, không mất index | Core |
| AC04 | Create/delete/atomic-save/di chuyển và rename cha → index hội tụ đúng, không stale paths | Live watcher fixture |
| AC05 | Quit/restart dưới60s với thay đổi lúc tắt → roots còn, index đối chiếu | Core + packaged app |
| AC06 | Quét có nhánh EACCES/hủy/crash → không sweep nhầm; phục hồi đối chiếu khi quyền trở lại | Core fixture + native quyền |
| AC07 | Root mất/identity khác giữa scan → giữ cache cũ, chặn action; đúng identity trở lại → recover | Core + USB thật |
| AC08 | Symlink loop/outside root → không traversal; action link ngoài scope reject | Core |
| AC09 | Query tiếng Việt có/không dấu, token1–2, %, _, quote, OR, extension/path → literal và đúng trang | Core |
| AC10 | FTS insert/update/delete/merge/remove/refresh → không ghost posting, IDs ổn định | Core SQL integration |
| AC11 | Source giữ nguyên byte và mtime qua scan/search/refresh/merge/remove | Fixture snapshot + audit source |
| AC12 | Open/Reveal tên Unicode/khoảng trắng/ký tự đặc biệt → OS mở/chọn chính xác file | Native Mac và Windows riêng |
| AC13 | Close → tray còn; hotkey mở/focus; Quit dừng; hotkey conflict không crash | Native app |
| AC14 | Event storm/overflow → giới hạn queue/batch, dirty recovery; root khác không starvation | Core load fixture |
| AC15 | Watcher lỗi kéo dài → báo degraded, retry backoff, không full scan mỗi vài giây | Scheduler + native failure |
| AC16 | Search response chậm trả sau query mới → UI chỉ dùng response mới; modal/input không bị cướp phím | UI automation |
| AC17 | 720×540,640×440; Dark/Light/System; Settings header/footer dùng được, QR không méo | Browser visual + native visual |
| AC18 | Nhiều kết quả → giới hạn DOM/pagination; filter/sort/root changes không trộn trang cũ | UI automation |
| AC19 | Theo dõi thư mục bao phủ app data → không index DB/WAL hoặc tạo vòng event tự kích hoạt | Core |
| AC20 | SDK27 artifact metadata + codesign verify; Windows native engine/installer | Artifact/OS riêng |

## Fixture và cách chạy

[Core tests](../../crates/search_core/tests/engine_safety.rs) tạo dữ liệu tạm riêng, không dùng nguồn thật để mutation. Chạy `cargo test --manifest-path crates/search_core/Cargo.toml` từ root app. Watcher cần quyền runtime thật: sandbox có thể không cho FSEvents hoạt động; phải báo lỗi đó và chạy trong quyền phù hợp, không sửa assertion thành PASS.

[Benchmark](../../crates/search_core/examples/benchmark.rs) tạo fixture riêng, đo index/search count+page trong release. Không suy ra RAM/500k/Windows/UI frame time từ10k fixture trên Mac.

## Kiểm thử native còn bắt buộc theo nền tảng

- Mac: picker add/remove/relink, Finder Reveal đúng selection, Open bằng app mặc định, clipboard, tray/menu/hotkey/quit, restart, native traffic lights actions và focus/resize/Spaces.
- Windows: build MSVC x64/NSIS, Unicode/ACL/junction/drive letter/volume identity, Shell Reveal selection, hotkey/tray, decorations=false một hàng controls, install/restart.
- Ổ ngoài thật: tháo giữa scan, gắn lại cùng/khác volume hoặc mount path khác, root identity mismatch và relink xác nhận.
- Quyền: app package bị từ chối/chấp thuận/thu hồi quyền, không lấy quyền Terminal/agent làm bằng chứng của package.

`technical_verification` và `human_verification` ghi riêng. Không tuyên bố hoàn tất v1.0 đa nền tảng nếu Windows/USB/native package chưa có bằng chứng tương ứng. Không publish từ checklist này.

## Yêu cầu mới chờ thực thi

User đã chốt Dock/menu bar popup/glyph titlebar ngày2026-10-28; chưa sửa code. [Task và acceptance mới](../tasks/menubar_followup.md) ưu tiên khi mâu thuẫn hành vi hiện tại. Chỉ triển khai sau khi cửa sổ quota5h khôi phục.

## Acceptance bổ sung menu bar/Dock

- Main Close→Accessory/Dockẩn, engine vẫn thấy create/remove fixture; Quit dừngprocess. Mở main→Regular; popup chưasubmit không đổi Dock.
- Click menu bar→popup380×64 chỉinput+nút; typingkhôngmởmain, Enter/nút→main đúngUnicodequery; blank/IME/duplicateEnter khôngsubmit sai. Escape/blur đóngpopup.
- Cold main lấy pendingquery;2queryliêntiếp ACKcũ khôngxoáquerymới. Lỗi submit khôngkhóaretry.
- SVGglyphtitlebar, theme/popupsmallviewport; vị trí màn phụ1x/2x, originâm và workarea. Read-onlyfixturebyte/mtime khôngđổi.
