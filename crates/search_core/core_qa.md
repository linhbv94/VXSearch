# VXSearch core — triển khai và bằng chứng QA

Ngày: 2026-10-28. Phạm vi sở hữu: `crates/search_core/`. Không sửa shell/UI/docs tổng. Không commit/push/release.

## Kết quả triển khai

- Rust crate độc lập Tauri, `Engine` clone/Send/Sync. Một coordinator ghi SQLite; reader riêng, WAL, phân trang count/page trong một snapshot đọc.
- `Engine::open`, `open_with_events`, `list_roots`, `add_root`, `confirm_merge`, `relink_root`, `remove_root`, `refresh_root`, `search`, `system_status`, `get_settings`, `update_settings`, `reset_settings`, `vacuum`, `validate_action`, `contains_indexed_path`, `shutdown`. DTO/export tại [models](src/models.rs). Callback `CoreEvent {name,payload}` phải không block/gọi ngược mutation vì chạy trên coordinator.
- Scan metadata-only, `walkdir` không follow symlink. Stage trong TEMP SQLite, ghi500 bản ghi/lượt; kiểm identity trước/sau traversal. Root identity thay đổi không import stage. Lỗi quyền/cancel/incomplete không sweep. Chỉ sweep root tương ứng sau traversal đầy đủ, import và identity hợp lệ.
- macOS identity `getattrlist` volume UUID + inode, không phụ thuộc device number dễ đổi khi remount. Windows dùng handle chỉ có `FILE_READ_ATTRIBUTES`, `GetFileInformationByHandle` volume serial/file index. Unknown UUID fail closed. Linux dùng dev+inode.
- Watcher đăng ký trước scan; queue4096, gom tối đa1000path/lượt, debounce100–2000ms. Event là metadata hint. Rename/cây mới/gap/error/queue overflow → reconcile; watcher error/overflow đăng ký lại. Startup luôn scan; healthy full reconciliation10phút, identity/offline poll2s. Round-robin root IDs chống starvation khi root đầu churn. Đo wallclock+Instant quanh recv_timeout, gap>5s kick reconciliation sau resume (không nhầm scan lâu thành sleep). Watcher registration thất bại retry backoff2–60s; chỉ schedule scan khi root vừa online hoặc watcher đăng ký lại thành công, không quét toàn root mỗi2s khi watcher lỗi dai dẳng.
- Exclude toàn subtree DB parent khỏi scan/event để Home bao phủ appdata không tự tạo vòng watcher. Reject add/relink trực tiếp bên trong data dir. Engine canonicalize DB trước exclusion, xử lý `/var` vs `/private/var`.
- Merge revalidate IDs, chuyển root association trước cascade delete trong transaction; ID file giữ ổn định. Remove chỉ xóa index. Relink explicit confirmation qua picker shell; đổi đường dẫn/identity, tái tạo index.
- FTS5 trigram `search_text` chuẩn hóa Unicode NFD/bỏ combining mark/đ→d; short token dùng `instr` literal. Query AND token, `.pdf` lọc extension, escaped MATCH, stable tie path/id. Relevance ưu tiên normalized filename exact/prefix/contains trước path-only. `baocao` không hứa khớp `Báo cáo`.
- Action validation kiểm index membership, root availability/identity và canonical path không thoát scope. Copy clipboard dùng `contains_indexed_path` để vẫn sao chép path offline. Action stale không tự xóa DB.

## Kiểm chứng

- `cargo fmt --manifest-path Cargo.toml --check`: PASS.
- `cargo test --offline --manifest-path Cargo.toml`: **18 tests PASS** gồm2 unit +16 integration (trong đó1child-helper mặc định return khi không có env). [Log đầy đủ](core_test_output.log).
- Fixture bao phủ cancel không purge; Unicode/literal/short/extension/pagination; live create/modify/atomic-save/rename cha/delete; restart dưới60s; overlap/merge revalidation và cascade giữID; offline/replacement identity/recovery; explicit relink; chmod000 incomplete giữ index; symlink loop/escape; bytes+mtime nguồn giữ nguyên; settings restart/reset; concurrent reads lúc scan; exclusion DB không tự index/self-loop; relevance; volume thay giữa scan không import dữ liệu của volume thay thế. Có FTS integrity-check sau cascade delete. Bổ sung SIGKILL thật: parent lập baseline1file rồi tắt engine, thêm2.500files; child startup scan stage≥2.000entries rồi callback báo signal/block; parent xác minh persistent index vẫn chỉ1baseline, kill/wait xác nhận signal9; mở engine lại đối chiếu đủ2.501entries, baseline bytes giữ nguyên, SQLite integrity_check=`ok` và FTS integrity-check PASS. Child được kill/wait bằng RAII ngay cả khi assertion/timeout thất bại. Thêm fixture2roots với root1 rename/churn liên tục vẫn scan xong root2; unit injected watcher failure chứng minh pending không tăng/scan_generation không đổi qua5lượt recovery, retry deadline tăng backoff và khi watcher phục hồi mới schedule scan.
- FSEvents trong sandbox bị chặn, gây các test chờ WATCHING_ACTIVE timeout. Đã chạy lại quyền hợp lệ ngoài sandbox và xác minh watcher thật; không nới guard hay giả watcher để lấy PASS.
- `cargo clippy`: chưa chạy được vì component cargo-clippy chưa cài; không tự cài toolchain.

## Benchmark ban đầu

`cargo run --offline --release --manifest-path Cargo.toml --example benchmark -- 10000`.

Fixture tạm thuộc test:10.001 files,50dirs,10.051 indexed entries. macOS arm64, optimized release. Setup fixture730.44ms; index824.05ms; SQLite+WAL12.728.080bytes. Mỗi query đo5lần, tính count và trang đầu50results:

| Query | Thời gian min–max |
|---|---|
| empty |1,30–3,76ms|
| `a` (1ký tự) |2,67–2,70ms|
| `rs` (2ký tự) |3,13–3,22ms|
| `file_005` |2,63–2,91ms|
| `bao cao` |0,067–0,102ms|
| `.pdf` |0,023–0,037ms|
| `group_025` (path) |1,22–6,77ms|
| empty +root filter |1,58ms|

Benchmark đọc metadata và chỉ ghi fixture trong temp sở hữu riêng; tự dọn khi xong. Không suy hiệu năng500k/real data, RAM, IPC/render hoặc OS khác từ số đo này.

## Giới hạn cần giữ đúng khi bàn giao

- Windows native identity có code thật nhưng chưa cross-compile/runtime QA trong lượt core; root thực hiện shell/platform verification riêng. Physical USB tháo/gắn cùngUUID, remount path khác, Windows case/path behavior và network filesystem chưa có thiết bị QA. Root missing/identity mismatch được mô phỏng bằng rename/replacement trong fixture.
- Deterministic queue overflow chưa được cưỡng bức bằng test riêng; có burst/concurrent scan tests và code paths bounded overflow/reconcile. SIGKILL/WAL recovery đã được kiểm chứng bằng child process thật trên macOS; không suy recovery Windows từ test này.
- Windows `is_removable` hiện false (advisory DTO); safety áp dụng mọi root, không dựa badge này để cho phép xóa index. macOS badge dựa `/Volumes`.
- Không đi theo symlink; entry symlink chỉ lưu metadata của link, không duyệt target. File action symlink ra ngoài scope bị chặn.
- Root UUID không đọc được bị từ chối/fail closed. Identity Unix ngoài macOS dev+inode cần relink nếu device number đổi. macOS đã dùng volumeUUID nên tránh giới hạn đó.
- Periodic reconciliation10phút là lớp bù mất sự kiện; resume wait-gap detection kick ngay khi wallclock/Instant qua lần chờ có gap>5s. Chưa có sleep-resume hook OS trực tiếp hoặc sleep máy vật lý trong test; nếu sleep xảy ra hoàn toàn trong scan thì periodic/watcher là lớp bù.
