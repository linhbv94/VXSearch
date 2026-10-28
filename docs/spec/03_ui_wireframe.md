# 03. Giao diện VXSearch

Version: 1.1.0 — Ngày cập nhật: 2026-10-28

Nguồn chuẩn [hợp đồng07](07_implementation_contract.md), [desktop UI](../../../.agents/desktop_ui_standards.md), [master theme](../../../_summary/master_theme.md). Layout desktop720×540 mặc định, min640×440; không giả lập mobile.

## Bố cục

```text
chrome32px: native Mac controls + icon/name | folders | settings
search input: literal query + result count
chips: All / Docs / Images / Video / Audio / Code / Archive / Folder
root filter | sort
scan/error/offline banner khi cần
result area: name / parent path / size / modified / actions
pagination50items: previous / current range / next
footer: indexed totals + keyboard hints
```

Một hàng chrome32px, font system12px, tên app600, icon16px/gap6px. Glyph SVG Search cạnh tên app, không dùng app icon ảnh. Mac chừa82px native traffic lights SDK27, spacing tâm20pt; chỉ khôi phục geometry chuẩn AppKit rồi đổi origin. Menu nằm trên OS. Windows decorations=false, menu Tệp/Chỉnh sửa trái, một bộ minimize/maximize/close phải; không app icon/name ở trái.

Dark canvas #0f1117, surface #141821, accent cyan #06b6d4/#22d3ee; text #f8fafc/#cbd5e1/#94a3b8. Light canvas #f8fafc, surface trắng, text #0f172a/#334155/#64748b. Token tại src/styles/theme_tokens.css, dùng system font, monospace cho số liệu/hotkey. Tooltip cho mọi nút icon.

## Search và results

Không có data mặc định hoặc fake index. Browser preview chỉ giải thích cần mở desktop. Desktop empty có nút thêm thư mục. Loading/scan hiển thị số entries đã thấy, không phần trăm khi chưa biết tổng. Lỗi quyền/offline có text rõ và vẫn giữ kết quả cache.

Tên và path có tooltip đầy đủ; icon semantic theo loại, kích thước và ngày sửa metadata. Match literal tiếng Việt có highlight. Selection độc lập với focus input; keyboard chỉ hoạt động đúng ngữ cảnh, không cướp nút/form/IME. Offline disable Open/Reveal, vẫn Copy Path. Không dùng hình thức disabled mờ mà không giải thích lỗi root.

Kết quả giới hạn50items/page, không append vô hạn vào DOM. Query/filter/root/sort reset trang; native invalidation/poll giữ trang và selection khi còn hợp lệ. Generation chặn response cũ trước cả debounce; lỗi kết thúc loading và không hiển thị dữ liệu cũ như mới.

## Folder Manager

Modal có title/header drag, danh sách root path/status/count/last_scan/error, add bằng native picker; refresh/relink/remove index. Root cha yêu cầu confirm covered IDs; remove nói rõ chỉ gỡ chỉ mục. Relink cho user xem path cũ/mới và xác nhận. Native picker/cancel không tự thêm root; busy không cho lặp mutation hay đóng mất trạng thái. Manual absolute path nếu có cũng qua cùng validation backend.

## Settings

Header drag, sidebar192px, body scroll, footer luôn dùng được. Maxheight calc(100dvh - 32px), các vùng flex min-height0. General/Shortcuts/Cache, divider, Updates/About/Support. Theme dark/light/system, close_to_tray, auto_select_input, debounce100–2000ms; không autostart P0. Lưu thành công mới áp dụng state hoặc phải rollback khi lỗi. Phím tắt phân biệt Command/Control và báo conflict thật.

Cache hiển thị số liệu chỉ mục/DB và nút thu gọn; không xóa nguồn. Updates hiển thị version thực và trạng thái check/download/install/restart/error từ updater thật; có nút check thủ công. About dùng version runtime, tác giả Bùi Việt Linh, repo thật và mô tả ngắn. Support cuối sidebar iconCoffee/amber, QR thật từ _summary/qr.png copy vào public/support_qr.png; giữ nền trắng/tỷ lệ và không bịa tài khoản.

Modal có role dialog/aria-modal, focus trap/restore, Escape xử lý lớp confirmation trước modal. Menu Escape không đồng thời clear query/hide window. Không auto-hide on blur. Chứng cứ visual/runtime và phần chưa kiểm nằm trong [QA report](../qa/implementation_report.md).

## Yêu cầu mới chờ thực thi

User đã chốt Dock/menu bar popup/glyph titlebar ngày2026-10-28; chưa sửa code. [Task và acceptance mới](../tasks/menubar_followup.md) ưu tiên khi mâu thuẫn hành vi hiện tại. Chỉ triển khai sau khi cửa sổ quota5h khôi phục.

## Popup tìm nhanh menu bar

Cửa sổ `quick_search`380×64logicalpx, một hàng input+Tìm, không chrome/logo/results/filter. Root CSS không áp dụng min640×440 của main. Focus/select khi mở, theme theo settings, Escape/blur đóng. Không submit blank hoặc Enter khiIME composing; chặn submit trùng, lỗi IPC đọc được và retry. Main nhận nguyên keyword qua mailbox, reset filter/root/page để tìm toàn phạm vi đã chọn.
