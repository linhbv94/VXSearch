# VXSearch — Hợp đồng triển khai v1

Version: 1.3.0 — Ngày cập nhật: 2026-10-28

Tài liệu này ưu tiên khi mâu thuẫn với các bản thiết kế 00–06. User đã giao Codex tự chỉnh spec và triển khai ngày 2026-10-28. Không dùng Product Studio theo chỉ đạo user.

## Quyết định kiến trúc

- Giữ Tauri 2 + Rust + React/TypeScript/Vite; Rust core độc lập tại `crates/search_core`, shell tại `src_tauri`, UI tại `src`.
- Cân nhắc LIKE thuần (đơn giản nhưng quét toàn bảng), FTS trigram chuẩn hóa (chọn, cần trigger/test), và dịch vụ search riêng (không phù hợp local nhẹ). Query literal, chia theo whitespace, AND các token trong tên/đường dẫn; token `.pdf` lọc extension. Unicode NFD + bỏ combining marks + đ/Đ → d; không bỏ khoảng trắng: `bao cao` khớp `Báo cáo`, `baocao` không được hứa khớp.
- Token ≥3 ký tự tận dụng FTS trigram trên search text chuẩn hóa; token ngắn và ký tự đặc biệt phải có fallback literal. Không truyền raw query vào MATCH. Phân trang ổn định có tie-break id. Limit tối đa 200; offset/query có giới hạn.
- Một worker điều phối ghi DB. Watcher đăng ký trước scan; bounded event queue 4096 và dirty flag khi tràn. Event chỉ là tín hiệu đọc lại metadata, không là lệnh xóa chắc chắn. Gộp tối đa 1000 đường dẫn/lượt và thời hạn không quá 2s; queue tràn/rename cây/lỗi watcher → reconciliation. Scan staging TEMP SQLite, import500/batch sau khi xác minh identity, chỉ sweep theo root khi scan đầy đủ và identity gốc không đổi; lỗi/hủy/offline giữ chỉ mục cũ. Không follow symlink; không mở link đi ra ngoài phạm vi bằng hành động file.
- Root overlap theo path components sau canonicalize, không lowercase toàn bộ macOS. Thêm cha yêu cầu confirmation với IDs revalidate. Chuyển association trước cascade delete trong transaction. Remove/merge/relink và scan tuần tự cùng worker.
- Lưu identity volume/root (Mac volume UUID + inode, Windows volume serial + file index); mismatch hoặc không xác định không được sweep. Không suy file đã mất từ `exists()`. Missing root/access error giữ toàn bộ chỉ mục, chặn open/reveal. Relink là người dùng chọn lại và xác nhận, tạo lại chỉ mục root an toàn.
- Startup luôn reconcile. Worker đo gap >5s ngay quanh lượt chờ để kích hoạt đối chiếu sau sleep/resume, không tính thời gian tự scan. Recovery identity poll2s, watcher retry backoff2–60s; pending scan round-robin để không root nào starvation. Watcher đăng ký lại khi root quay lại; periodic reconciliation 600s là lớp bù mất sự kiện/resume, có thể báo degraded nếu watcher không đăng ký được. Không cam kết realtime khi app ngừng hoặc OS ngủ.
- Search/read connection tách writer WAL; cancellation UI theo request generation. Không đọc nội dung nguồn. Chỉ DB/config riêng app được ghi.
- Chỉ số 500k tệp, <10ms, <80MB là mục tiêu benchmark; không phải bảo đảm. `scanned_count` thay phần trăm giả. Không auto-hide khi mất focus ở v1 để tránh native dialog/modal bị đóng.

## IPC chính thức (JS invoke)

DTO snake_case; tên command snake_case; argument Tauri camelCase. Search luôn truyền `{ params: {...} }`; update settings `{ settings: {...} }` (full object).

- `get_system_status()` → `{ total_roots,total_files,total_size_bytes,db_size_bytes,is_any_scanning,platform,app_version,hotkey_error: string|null }`
- `get_watched_roots()` → array `{ id,path,alias:string|null,status,total_files,total_size_bytes,is_removable,last_scan_at:number|null,error_message:string|null }`
- `search_files({params:{ query,filter_type:'all'|'document'|'image'|'video'|'audio'|'code'|'archive'|'directory',root_id:number|null,sort_by:'relevance'|'name_asc'|'size_desc'|'modified_desc',limit,offset }})` → `{ items,total_matched,took_ms }`
- Result item `{ id,root_id,path,parent_dir,name,extension,file_type,size_bytes,modified_at,is_directory,is_offline }`.
- `pick_folder()` → `string|null` native picker, `add_watched_root({path})` → `{success,root_id,status}`. Parent overlap error `{code:'E_PARENT_OF_EXISTING',message,details:{covered_root_ids:number[]}}`.
- `confirm_merge_roots({parentPath,coveredRootIds})` → `{success,new_root_id}`.
- `relink_watched_root({rootId,newPath})`, `remove_watched_root({rootId})`, `refresh_watched_root({rootId})` → `{success:true}` (remove thêm removed_files_count).
- `open_file({path})`, `reveal_file({path})`, `copy_file_path({path})` → `{success:true}`. Open/Reveal chỉ nhận path đã được index và kiểm root identity/metadata trước action; stale không xóa DB từ action. Copy dùng exact indexed membership, cho phép cache offline.
- `get_settings()` / `reset_settings()` → AppSettings; `update_settings({settings})` → `{success:true}`.
- AppSettings `{global_hotkey:string,close_to_tray:boolean,auto_select_input:boolean,debounce_ms:number,theme:'dark'|'light'|'system'}`. Không start_at_login P0. Default Cmd+Shift+F Mac / Alt+Shift+F Windows; fallback Ctrl+Alt+F khi bị chiếm, trả lỗi hiện trong UI nếu cả hai thất bại.
- `vacuum_database()` → `{success,db_size_before_bytes,db_size_after_bytes}`.
- `hide_window()`, `quit_app()`, `open_project_url()` là shell commands không cần argument.
- AppError `{code,message,details:null|object}`; UI bắt cả structured error và chuỗi lỗi.
- Events `index_changed`, `root_status_changed`, `scan_completed`, `scan_progress` là invalidation hints: UI reload roots/status/results. Payload progress `{root_id,current_path,scanned_count}`; status `{root_id,new_status,message}`; completed `{root_id,total_files,total_size_bytes,duration_ms}`; changed `{affected_roots,delta_count}`. Poll nhẹ 3s là fallback khi event trễ.

## UI và nghiệm thu

720×540 mặc định, resize min 640×440. Chrome một hàng 32px đúng quy chuẩn OS; Mac traffic lights native, Win decorations false/menu trái/control phải. Search, type chips, root filter, sort, kết quả phân trang; Arrow/Enter/Cmd-or-Ctrl+Enter/Cmd-or-Ctrl+C/Escape. Không intercept phím từ input/modal ngoài ngữ cảnh. Folder Manager add/confirm merge/remove index/relink/refresh. Settings đủ General/Shortcuts/Cache/Updates/About/Support, QR thật từ workspace; update tab dùng updater thật có manualcheck và error/retry. Không telemetry; chỉ kết nối GitHub cho cập nhật, không gửi tên/path/nội dung tệp.

Đọc [QA](05_qa_acceptance.md). Test tự động phải bao phủ: restart, rename cha, remove/create, merge không mất index, lỗi quyền/incomplete không purge, offline/identity mismatch, symlink, Unicode và literal query/short token, watcher/recovery. QA UI thật và OS-specific tách khỏi build. Không publish/commit/push trong task triển khai này.

## Thay đổi menu bar đã triển khai (2026-10-28)

Các hành vi sau là yêu cầu mới của user, **đã triển khai và kiểm chứng local macOS, chi tiết tại báo cáo follow-up** và ưu tiên hơn mô tả UI cũ:

1. Close cửa sổ chính trên macOS → gỡ app khỏi Dock, chỉ chạy nền qua menu bar; Quit vẫn thoát thật.
2. Titlebar cạnh tên dùng glyph SVG đại diện chức năng; không dùng app icon ảnh như bản hiện tại. Áp dụng quy chuẩn chung cho app sau.
3. Click trái menu bar mở popup nhỏ chỉ input keyword+nút Search. Chỉ Enter/nhấn Search với keyword mới mở main window và chuyển query; không mở main ngay khi click tray.

Chi tiết và acceptance: [task follow-up](../tasks/menubar_followup.md). User đã yêu cầu triển khai ngay và tắt schedule; heartbeat đã PAUSED, điều kiện chờ quota được gỡ bỏ.

Popup label `quick_search`,380×64 logicalpx, ẩn khi startup/blur/Escape. Menu context vẫn mở main/settings/folders/Quit. Command `submit_quick_search({query})` chỉ chấp nhận từ popup; backend lưu `{id,query}` trong mailbox trước show main và emit wake-up. Main đọc `get_pending_search()`, áp dụng query và reset filters/page, sau đó `ack_pending_search({id})`; ACK cũ không xóa request mới. Query được giữ nguyên dấu/khoảng trắng, chỉ reject rỗng/NUL hoặc >2048bytes. Popup chỉ có capability event, không window controls/filesystem. macOS main hide dùng Accessory, show dùng Regular; popup không đổi policy, main giữ behavior Spaces/native chrome hiện tại.

Kết quả: [QA follow-up](../qa/menubar_followup_report.md). Không suy Windows/mixed-monitor runtime từ kiểm tra local.

## Release1.0.0 và updater —2026-10-28

User giao finalQA/release1.0.0 và cho phép tạo/lưu khóa updater riêng vào ActionsSecrets linhbv94/VXSearch. Engine Rust dùng chung Mac/Windows, phát hành cả ba target MacSilicon/MacIntel/Windowsx64 khi CI đạt. macOS giữ ad-hoc cho app đọc metadata nhẹ; không xin FDA/Accessibility rộng. Main production tự check một lần mỗi lần mở, Settings check thủ công, thông báo có bản mới; chỉ tải/cài/relaunch khi user chọn. Browser/dev/popup không check. Offline startup im lặng, lỗi thủ công có details/retry; chống check/install trùng, timeout check15s/download300s, sai chữ ký không cài/restart. SQLite WAL/reconcile giữ index và roots qua restart; engine shutdown khi Exit. Bản public dùng key riêng bất biến, endpointstable GitHub, ký updater sau đóng gói. E2E từ baseline QA thấp hơn tới public1.0.0 trên Mac ghi riêng, không suy Windows/Intel runtime. Nội dung trước đây “chưa updater” là baseline triển khai0.1.0.
