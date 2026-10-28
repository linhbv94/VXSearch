# 02. Luồng tính năng và state VXSearch

> Version: 1.1.0 — Ngày cập nhật: 2026-10-28
> Hợp đồng ưu tiên: [07_implementation_contract.md](07_implementation_contract.md).

## Scan và watcher

```text
add/startup/periodic/dirty
 → check canonical root + persisted identity
 → register watcher before scan
 → generation += 1
 → walkdir metadata (no follow links; exclude app data)
 → stage records in TEMP SQLite, batches500
 → verify identity
 → import observed rows with stable UPSERT in batches500
 → if complete + same identity + not cancelled: sweep current root only
 → totals/status/events
 → process buffered paths against current metadata, or reconcile dirty root
```

Bounded4096 watcher queue; đầy hoặc lỗi watcher đặt overflow dirty. Gộp tối đa1000 paths mỗi lượt, debounce settings100–2000ms với giới hạn thời gian xử lý để event storm không chờ im lặng vô hạn. Event Access bỏ qua. Rename cây hoặc đường dẫn mơ hồ → reconciliation. Không chuyển event Remove trực tiếp thành chứng cứ xóa; kiểm root identity, path và quyền trước mọi delete index.

Worker tuần tự hóa mutation và scan; UI dùng async IPC/spawn_blocking. Search dùng connection đọc riêng WAL. Shutdown đặt stop flag, scan kiểm cancellation giữa entries/batches, không sweep nếu dừng; join worker. Crash chưa hoàn chỉnh được startup reconciliation xử lý.

## Root states

| State | Ý nghĩa |
|---|---|
| SCANNING_INITIAL | Root đã nhận, chờ quét ban đầu |
| RECONCILING | Đang đối chiếu metadata |
| WATCHING_ACTIVE | Đối chiếu xong và watcher đã đăng ký |
| UNAVAILABLE_OFFLINE | Path/identity hiện không khớp hoặc mất kết nối; giữ index |
| ERROR_ACCESS | Scan lỗi quyền/I/O hoặc watcher degraded; giữ index và hiện thông tin |

Không coi `scan_completed` là chứng nhận thành công: đọc status cuối từ roots. Badge offline là trạng thái root chưa dùng được; không dựa riêng removable flag. Watcher degraded vẫn đối chiếu định kỳ nhưng không claim realtime.

## Search và điều hướng

Thay query/filter/root/sort → reset page → debounce query → request generation++ → IPC search → chỉ nhận response của generation hiện tại. Native event/poll invalidation cập nhật roots/status và kết quả. Query error phải kết thúc loading và hiển thị lỗi; không giữ request cũ như dữ liệu mới.

Mặc định50 items/page, tối đa200/backend; giữ order ổn định. Arrow đổi selection, Enter mở, Cmd/Ctrl+Enter Reveal, Cmd/Ctrl+C Copy theo ngữ cảnh; không cướp phím nhập/copy trong form/modal. Escape đóng lớp modal/menu trước, nếu không có lớp thì xóa query, rồi mới ẩn cửa sổ khi query rỗng.

Open/Reveal → exact indexed membership → root status/identity → symlink_metadata → resolve path trong root → native action. Stale chỉ báo lỗi và yêu cầu đối chiếu; không xóa index từ action. Copy exact-membership cho phép offline cached path.

## Window

Main Visible (Dock Regular) ↔ Hidden (Accessory, chỉ menu bar) bằng shortcut/Close. Click trái menu bar chỉ toggle popup tìm nhanh; submit keyword mới mở main. Có Folder Manager/Settings/confirmation layer. Không auto-hide on blur P0. Native picker không đóng modal. Mac native traffic lights/menu; Win custom controls và decorations=false. Native events `search_focus` và `open_panel` dùng để focus input/mở panel khi shell yêu cầu.

## Yêu cầu mới chờ thực thi

User đã chốt Dock/menu bar popup/glyph titlebar ngày2026-10-28; chưa sửa code. [Task và acceptance mới](../tasks/menubar_followup.md) ưu tiên khi mâu thuẫn hành vi hiện tại. Chỉ triển khai sau khi cửa sổ quota5h khôi phục.

Menu bar query handoff dùng mailbox có ID + ACK sau khi frontend nhận query; không phụ thuộc việc main đã mount lúc event được phát. Reopen app trong khi popup đang hiển thị giữ popup, không tự chuyển sang main. macOS chọn monitor theo native logical points và set logical position theo scale màn đích; Windows dùng physical pixels.
