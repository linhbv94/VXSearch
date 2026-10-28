# 04. Dữ liệu và IPC VXSearch

> Version: 1.1.0 — Ngày cập nhật: 2026-10-28
> Hợp đồng ưu tiên: [07_implementation_contract.md](07_implementation_contract.md).

## Schema triển khai

Nguồn SQL thực: [schema.sql](../../crates/search_core/src/schema.sql). Schema version1; fresh install ban đầu, chưa có migration từ release trước.

- `watched_roots`: `id`, canonical `path UNIQUE`, `identity`, nullable `alias`, `status`, `total_files`, `total_size_bytes`, `is_removable`, nullable `last_scan_at/error_message`, monotonic `scan_generation`.
- `files`: stable `id`, FK `root_id ON DELETE CASCADE`, `path UNIQUE`, `parent_dir`, `name`, normalized `name_fold`, `extension`, `file_type`, `size_bytes`, `modified_at`, `is_directory/is_symlink`, normalized `search_text`, `generation NOT NULL`.
- `files_fts`: external content FTS5 trigram trên `search_text`. Trigger insert/delete; update chỉ khi search text thực sự thay đổi. Metadata/marker updates không rebuild FTS. Dùng UPSERT, không REPLACE.
- `app_settings`: `key`, JSON `value_json`. AppSettings full object; defaults theo platform, validation trước ghi.
- TEMP `scan_entries`: metadata staging cho một scan; không chứa nội dung nguồn.

WAL, synchronous NORMAL, foreign_keys ON, recursive_triggers ON, busy_timeout5000ms, cache8MiB/connection. Không dành64MiB mặc định cho cache khi mục tiêu lightweight chưa đo. Writer coordinator; reader mutex/connection riêng, search COUNT+page trong read transaction nhất quán.

DB đặt trong Tauri app_data_dir `com.vxsearch.desktop`. Exclude subtree data dir khỏi scan/events. Tổng entries gồm file và thư mục con; root bản thân không phải result. `is_offline` tính qua JOIN status root, không lưu trên files. `is_removable` là thông tin phụ, không quyết định purge safety.

## Giao ước

Toàn bộ command/DTO/event hiện hành được định nghĩa trong [hợp đồng 07](07_implementation_contract.md#ipc-chính-thức-js-invoke) và [Rust DTO](../../crates/search_core/src/models.rs). Không nhân bản TypeScript schema trong tài liệu để tránh lệch; frontend đồng bộ tại [ipc_types.ts](../../src/types/ipc_types.ts).

JS argument camelCase đối với Tauri command args (`rootId`, `parentPath`, `coveredRootIds`); field DTO snake_case. `search_files` nhận `{params}`; `update_settings` nhận `{settings}` full object. Return `Result<T, AppError>`; lỗi `{code,message,details}`. Không dùng raw SQL/MATCH từ UI.

## Query grammar

Whitespace tokens kết hợp AND, tìm literal trên normalized name/path. Token `.extension` gồm chữ/số lọc đuôi chính xác. NFD bỏ dấu/combining marks, lowercase và đ→d. Không gộp khoảng trắng. Token ≥3 ký tự dùng FTS phrase escaped, rồi literal `instr` verification; token1–2 dùng `instr`. `%`, `_`, quote, `OR`, ngoặc không thành toán tử.

Giới hạn query2048bytes, tối đa32tokens, offset≤1.000.000, limit1–200. Relevance ưu tiên tên exact/prefix/contains trước path-only; order khác name/size/modified, luôn tie-break path/id. Invalid filter/sort/query trả lỗi. `total_matched` và page từ cùng snapshot.

## Quy tắc lỗi

Overlap (`E_EXACT_DUPLICATE`, `E_CHILD_OF_EXISTING`, `E_PARENT_OF_EXISTING`) không mutate nguồn. Parent error details chứa IDs cho confirmation; stale confirmation `E_MERGE_CHANGED` phải yêu cầu chọn lại. Root/volume mismatch `E_IDENTITY_CHANGED` không tự relink. Action offline `E_ROOT_OFFLINE`, stale `E_STALE_FILE`, link ngoài scope `E_OUTSIDE_SCOPE`; không xóa DB từ action. DB/I/O/hotkey errors hiện message thật, không trả success giả.

## IPC popup/menu bar

`submit_quick_search({query})` chỉ từ window `quick_search`; reject rỗng/NUL/>2048bytes, lưu `{id,query}` rồi hide popup/show main/emit `quick_search_requested`. Main `get_pending_search()` sau khi đăng ký listener, áp dụng state rồi `ack_pending_search({id})`; ACK cũ không xóa query mới. `hide_quick_search()` chỉ ẩn popup, không tác động engine/Dock của main. Capability popup chỉ core:event; không windowcontrols/filesystem. Mailbox trong bộ nhớ process, không thêm queryhistory hoặc DBschema.
