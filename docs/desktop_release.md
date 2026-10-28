# VXSearch — QA và phát hành

Version: 1.0.0 — Ngày cập nhật: 2026-10-28

Repo public `linhbv94/VXSearch`, Tauri2/npm tại root, Rust shell tại `src_tauri`, engine chung tại `crates/search_core`. Phát hành Windowsx64 NSIS, MacSilicon và MacIntel vì đều có engine thật. SDK macOS27.0, minimum macOS14.0; Windows installer currentUser, updater passive. Chỉ dùng standard public runners windows-2022/xcode-27, không cache/workflow artifacts, không dịch vụ trả phí. [GitHub billing](https://docs.github.com/en/actions/concepts/billing-and-usage).

## Khóa và identity

BundleID `com.vxsearch.desktop` giữ nguyên, Mac ad-hoc cho app chỉ đọc metadata; không xin FDA/Accessibility. Updater dùng khóa riêng Search, user cho phép tạo/lưu Secrets ngày2026-10-28. Private key local tại `.release_keys/vxsearch_updater.key` (quyền600, thư mục700, Gitignore); public `.pub` khớp tauri.conf.json. Secrets `TAURI_SIGNING_PRIVATE_KEY` và `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Không đưa private key vào source/log/bộ cài.

User nên sao lưu nguyên private key và file public vào nơi bảo mật ngoài máy (ví dụ vault được mã hóa), giữ mật khẩu nếu có. Khóa hiện được Tauri tạo ở chế độ CI, không có passphrase; bảo vệ bằng quyền file và kho backup mã hóa. Secrets GitHub không cho đọc ngược. Mất mọi bản private key sẽ không thể ký update mà bản đã cài tin cậy; cần migration/cài thủ công, không tự rotate public key. Không tái sử dụng signer của app khác.

## Gate và luồng vận hành

1. Đọc work_log/spec07, git status/diff/remote, không git add toàn bộ workspace. User giao QA/release bao gồm PR/merge/tag/publish trong đúng repo. Version qua `node scripts/set_version.mjs VERSION`, không đổi version dependency search_core.
2. `npm ci --ignore-scripts`, `npm run build`, `cargo test --locked --manifest-path crates/search_core/Cargo.toml`, `cargo test --locked --manifest-path src_tauri/Cargo.toml --lib`. Watcher Mac cần chạy ngoài sandbox hạn chế FSEvents. Fixtures giữ nguyên source bytes/mtime, WAL/restart, offline/identity/incomplete không purge.
3. `node --test scripts/test_updates.mjs scripts/test_release_automation.mjs`. UI/popup: chạy Vite localhost1420, `npm run test:ui` rồi `npm run test:popup`. Browser IPC fixture không thay GUI/OS runtime.
4. Native Mac kiểm picker thêm root fixture, search không dấu, watcher rename/create, remove-index không xóa source, restart giữ roots/config, menu popup/handoff. Tất cả mutation chỉ trong fixture. Không chọn dữ liệu cá nhân để QA.
5. Viết `docs/release_notes/VERSION.md` chỉ end-user. Commit scope chính xác, PR/merge rồi tag immutable. Release workflow serialize3target để merge latest.json, kiểm versions/signatures/layout6assets. Nếu build lỗi đọc logs cụ thể trước retry; không publish khi validation sai.
6. Tải draft, kiểm updater signatures/tamper, SDK27/architecture, icon/ID/version/codesign hai Mac và WindowsPE/NSIS; DMG khớp updater. Lưu checkpoints/evidence trong docs. `publish_release.yml` với tag và local_qa_passed=true chỉ sau các gate đạt; checks exacttagSHA và version mới hơn stable.
7. Sau publish kiểm manifest endpointstable và6assets HTTP200 không token. Không re-publish/tagmove khi chỉ CDN chưa cập nhật. E2E cần baseline có updater thấp hơn1.0.0; lượt đầu dùng QA0.9.9 riêng không publish, cập nhật bằng endpoint thật lên1.0.0. Record PID trước/sau, UIversion, installedbytes khớpCI, SQLiteintegrity và roots/settings/sourcefixture không đổi. Windows/Intel runtime chưa có máy thì ghi rõ.

## Updater UX và recovery

Main production tự check một lần khi mở app; popup/dev/browser không check. Có notice và Settings→Cập nhật. Có bản mới thì user chọn Cập nhật & khởi động lại; không tự cài gây gián đoạn. Check timeout15s, download300s, chống check/install trùng. Startup offline không popup; check thủ công có details/retry. Sai chữ ký không cài/restart. Relaunch lỗi giữ trạng thái installed để chỉ retryrestart, không tải lần nữa. Đóng main về tray không hủy store; lần mở process mới check lại. Không hứa E2E chỉ từ build hay unit tests.

## Baseline public hiện tại

1.0.0 đã public ngày2026-10-28, tag644c744, build40685030065/publish40688519923. UpdaternativeQA0.9.9→public1.0.0 trênMacSilicon đạt, bảo toàn50.053records/2roots/settings/source. Bảnlocal0.1.0 chưa cóupdater cần cài1.0.0 thủcôngmộtlần. Windows/IntelGUI/updater chưa test. Candidate lỗi đượcgiữ tạiqa_failed_1_0_0_79dea98 dạngdraftkhôngpublish; tuyệtđối khôngchọn draftđócho người dùng. Không đổi tagpublic từ đây.
