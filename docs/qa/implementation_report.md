# VXSearch — Báo cáo triển khai local

Cập nhật follow-up: [Dock/menu bar report](menubar_followup_report.md) đã triển khai glyph/popup/Dock và kiểm nativeMac; trạng thái Mac khóa bên dưới là baseline trước follow-up.

Ngày: 2026-10-28. Phiên bản app: **0.1.0**. Trạng thái: source và bản local đã triển khai; **chưa nghiệm thu v1.0 đa nền tảng, chưa release**.

## Đã triển khai

- Agy CLI thực thi UI React/TypeScript; Codex triển khai shell, điều phối subagent core Rust, review và sửa tích hợp. Không dùng Product Studio sau khi user yêu cầu tắt.
- Search tên/path/extension, tiếng Việt không dấu, filter type/root/sort, phân trang50, keyboard đúng ngữ cảnh/IME; state scan/error/offline và native invalidation.
- Folder Manager add/merge confirmation/relink/refresh/remove index. Settings đủ General/Shortcuts/Cache/Updates/About/Support, theme lưu thật, hotkey conflict giữ giá trị cũ, QR/icon từ asset user cung cấp.
- Core SQLite WAL/FTS5, single writer, watcher trước scan, bounded queue, stage/import, no-purge khi incomplete/identity mismatch, UUID volume trên Mac, native volume/file identity Windows, fairness nhiều root và watcher retry backoff. Không đọc nội dung để index hoặc sửa/xóa/di chuyển nguồn.
- Shell Tauri2 có tray, shortcut/fallback, single-instance, native picker, native Open/Reveal và clipboard qua indexed membership/path guard. Close-to-tray cache atomic tránh callback UI đợi DB. Native Mac chrome giữ reference geometry SDK27; Windows decorations=false.
- Đồng bộ spec00–07 theo code thực, thay các mã giả nguy hiểm/cam kết hiệu năng chưa đo. [Hợp đồng](../spec/07_implementation_contract.md) là nguồn chuẩn ưu tiên.

## Bằng chứng kỹ thuật

| Lớp | Kết quả |
|---|---|
| TypeScript + Vite | `npm run build` PASS |
| Rust core | **18tests PASS**:2unit +16integration; watcher FSEvents thật ngoài sandbox |
| Crash | Child process SIGKILL signal9 sau stage≥2000entries; mở lại đủ2501entries, baseline byte giữ nguyên, SQLite/FTS integrity PASS |
| Metadata/source safety | Fixture kiểm byte+mtime trước/sau scan/search/refresh/merge/remove, symlink escape, incomplete permission và đổi volume giữa scan |
| Recovery/scheduler | Restart<60s, offline/replacement/relink, watcher persistent-failure backoff,2roots churn không starvation |
| Browser UI fixture | **13nhóm kiểm thử PASS**, không page errors; stale response, filter, event bridge, Settings rollback, focus trap, keyboard/IME, pagination/deleted last page, merge IDs,640px và Windows chrome qua DTO mô phỏng |
| UI visual | Đã xem Dark results, Light/Support QR,640×440 và Windows composition; đã sửa action clipping/footer wrap tại640px |
| Native package | macOS arm64, SDK27.0, local ad-hoc signing; xem [artifact evidence](artifact_evidence.json) |
| Launch | Tiến trình bundle đã chạy và tạo own SQLite DB, integrity `ok`; điều này chỉ chứng minh khởi động backend, không chứng minh GUI |
| Source hygiene | Rust fmt/check và git diff whitespace PASS; Clippy chưa có trong toolchain |
| Assets | SHA256 bản copy PNG/ICNS/ICO và QR khớp nguồn user cung cấp |

[UI results JSON](ui_test_results.json), [core report](../../crates/search_core/core_qa.md), logs local `core_tests.log`, `ui_tests.log`, `frontend_build.log`, `final_bundle.log` tại thư mục này. Logs được Git ignore; báo cáo/fixtures/test source lưu trong repo. [Test UI](../../scripts/test_ui.mjs) dùng backend mock rõ ràng, tách hoàn toàn khỏi dữ liệu ứng dụng thật.

## Benchmark ban đầu

Release core/macOS arm64,10.001files +50dirs: index **824ms**, query mẫu count+page50 **0,023–6,77ms**, DB+WAL12,7MB. Mỗi query5samples; đây là fixture10k, không phải RAM/UI/Windows hoặc500k proof. Chi tiết tại [core report](../../crates/search_core/core_qa.md#benchmark-ban-đầu).

## Điều phối Agy

Conversation `612552b0-ed03-42df-8c76-7f99c090f660`. Lượt đầu + **1/3 vòng sửa/review** đã dùng, còn2; không gọi Codex CLI tham vấn. Đã review source và chạy build/tests độc lập sau báo cáo của Agy. Một lượt đề xuất quyền rộng bị auto-review từ chối; đã thay bằng quyền file cụ thể, không cấp terminal/unsandboxed. Grants tạm được khôi phục, `permission_recovery.json` xác nhận `restored: true`. Không sửa cấu hình thường trực, không commit/push/publish.

## Phần chưa kiểm chứng

- **Native GUI Mac:** follow-up đã kiểm picker, popup query→main, CloseAccessory/submitRegular, FinderReveal đúngselection, Quit/restart vàwatcherchạy nền. Xem report follow-up; defaultOpen/clipboard/resize/Spaces/bezel vàquyềnTCC thật chưa cóbằngchứng tươngứng.
- **Windows:** có engine/identity/shell thật ở source, không dummy; chưa Windows compile/link/NSIS/native runtime. Windows screenshot là browser fixture, không phải Windows runtime.
- **Mac Intel, USB vật lý, mount path khác, sleep-resume vật lý, TCC cấp/thu hồi quyền:** chưa có bằng chứng. Fixture volume/root replacement và timer-gap recovery không thay các kiểm thử này.
- Queue overflow có code bounded/dirty recovery nhưng chưa cưỡng bức deterministic overflow riêng. Single coordinator xử lý scan tuần tự; root khác chờ scan đang chạy kết thúc. Scanner không theo symlink; volume UUID không đọc được fail closed.
- Chưa updater/launch-at-login/fuzzy/preview/content search theo scope P0. Không notarize hoặc phát hành.

`technical_verification`: các lớp ghi PASS ở trên đạt. `human_verification`: pending. Tiếp theo khi mở khóa: chạy [native checklist](../spec/05_qa_acceptance.md#kiểm-thử-native-còn-bắt-buộc-theo-nền-tảng), rồi QA Windows/ổ ngoài tương ứng trước khi tuyên bố v1.0 đa nền tảng.
