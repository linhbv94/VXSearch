# Nhiệm vụ: Tham vấn & Review Bộ Tài liệu Đặc tả Kỹ thuật VXSearch

Vai trò: Chỉ tham vấn/review chỉ đọc; không sửa nguồn; không gọi agent khác.
Tuân thủ AGENTS.md, tiếng Việt chuyên nghiệp, UTF-8, snake_case và tuyệt đối không dùng LaTeX.

## 1. Bối cảnh dự án
Dự án **VXSearch** — Tiện ích tìm kiếm tệp cục bộ siêu nhẹ theo các thư mục do người dùng chủ động chọn (Explicit User-Curated Scope), hoạt động trên cả Windows 10/11 (x64) và macOS 14.0+ (Apple Silicon & Intel — baseline SDK 27.0).
- Tài liệu phạm vi gốc (Single Source of Scope): `vxsearch/VXSearch_Scope_v1.0.md`.
- Quy chuẩn thiết kế giao diện: `_summary/standard_docs/desktop_ui_standards.md` và `_summary/standard_docs/master_theme.md`.

Bộ tài liệu đặc tả (Docs / Spec Suite) gồm 7 tài liệu tại thư mục `vxsearch/docs/spec/`:
- `vxsearch/docs/spec/00_system_overview.md`: Tổng quan kiến trúc, tôn chỉ sản phẩm (không cạnh tranh Everything quét toàn ổ đĩa; tuyệt đối read-only với tệp người dùng, zero-cloud), ma trận độ khó kỹ thuật (5 hạng mục), ngăn xếp công nghệ Tauri 2 + Rust + walkdir + notify + SQLite (B-Tree + FTS5 trigram) + React + Vite + Tailwind, cây thư mục dự án và lộ trình Vertical Slice 4 giai đoạn.
- `vxsearch/docs/spec/01_business_process.md`: 4 chu trình SIPOC (Thêm thư mục, Theo dõi thời gian thực, Tìm kiếm & Reveal, Đối chiếu phục hồi), 3 sơ đồ Swimlane BPMN 2.0, 3 ma trận quyết định nghiệp vụ (Xử lý thư mục lồng nhau, Chính sách ổ ngoài offline, Xử lý lỗi I/O & ngoại lệ).
- `vxsearch/docs/spec/02_feature_flow.md`: 6 luồng người dùng chi tiết, 2 sơ đồ Sequence Diagrams, 3 FSM (Vòng đời thư mục `WatchedRootFSM`, Cửa sổ `WindowFSM`, Bộ điều phối `IndexerFSM`), 4 giao ước thực thi logic máy đọc được (`evaluate_folder_overlap`, `coalesce_events`, `build_search_query`, `reveal_in_file_manager`).
- `vxsearch/docs/spec/03_ui_wireframe.md`: Bố cục hình học 720×540px, thanh trên cùng 1 hàng 32px chuẩn `desktop_ui_standards.md` (Traffic lights macOS 15.5pt native appearance SDK 27.0, Windows controls phẳng), bản vẽ ASCII wireframe cho Search View, Scanning State, Watched Folders Modal, Settings Modal chuẩn VXUtilities (Updates, About, Support Author với VietQR), cây phân cấp React, bảng design tokens Dark-first (`#0f1117`, Electric Cyan), và visual wireframe prompts.
- `vxsearch/docs/spec/04_api_data.md`: Cấu trúc CSDL SQLite cục bộ (bảng `watched_roots`, `files`, bảng ảo `files_fts` trigram, `app_settings`), các chỉ mục B-Tree tối ưu sub-10ms, giao ước Tauri 2 IPC Commands (`search_files`, `add_watched_root`, `remove_watched_root`, `refresh_watched_root`, `reveal_file`, `open_file`, `copy_file_path`, `get_settings`, `update_settings`), Tauri Events (`scan_progress`, `scan_completed`, `index_changed`, `root_status_changed`), Rust models và ma trận mã lỗi hệ thống.
- `vxsearch/docs/spec/05_qa_acceptance.md`: 14 kịch bản nghiệm thu Gherkin bao phủ 100% P0 Scope v1.0, 8 ca kiểm thử biên/tiêu cực (EC-01 đến EC-08), quy tắc validation dữ liệu và QA Handoff Checklist.
- `vxsearch/docs/spec/06_demo_presentation.md`: Kịch bản demo 5 phút, 3 khoảnh khắc Wow, bộ dữ liệu mẫu (Seed Data) thực tế, bộ FAQ và phương án ứng phó sự cố tại buổi demo.

## 2. Yêu cầu Review & Phản biện từ Codex
Codex hãy đọc kỹ toàn bộ 7 file spec trên và đưa ra phản biện, nhận xét chuyên sâu tập trung vào 4 trọng tâm:
1. **Tính khả thi và độ hoàn thiện kiến trúc:**
   - Ngăn xếp Tauri 2 + Rust + `walkdir` + `notify` + SQLite WAL mode (`rusqlite`) có điểm nghẽn (bottleneck) nào khi quản lý 200,000 – 500,000 tệp tin không?
   - Bộ gom sự kiện (Debouncer & Coalescing Engine) với cửa sổ trượt 300ms–1000ms đã đủ bảo vệ CSDL khỏi tình trạng bão I/O (event storms như khi `git checkout` hoặc `npm install`) chưa?
2. **Cơ chế Quét Đối chiếu & Bảo vệ Ổ đĩa ngoài:**
   - Thuật toán đối chiếu delta qua `last_seen_scan_id` và metadata `(size, modified_at)` có bỏ sót trường hợp biên nào không (ví dụ: tệp bị đổi tên trong lúc app tắt)?
   - Cơ chế bảo vệ ổ đĩa ngoài `UNAVAILABLE_OFFLINE` (chống xóa mù quáng chỉ mục khi tháo ổ rời) và phục hồi khi cắm lại đã được ràng buộc chặt chẽ chưa?
3. **Tính nhất quán chéo (Cross-Spec Consistency):**
   - Đối chiếu giữa `02_feature_flow.md`, `03_ui_wireframe.md` và `04_api_data.md`: Các thuộc tính trong SQLite schema, Rust structs và TypeScript interfaces có đồng bộ tuyệt đối về naming (snake_case trong DB/Rust, camelCase/snake_case trong IPC) và các trường bắt buộc không?
   - Giao ước lệnh Reveal Native (`open -R` trên macOS và `explorer.exe /select,` trên Windows) và xử lý lỗi stale file đã hoàn thiện chưa?
4. **Bẫy tiềm ẩn (Gotchas) & Đề xuất hành động trước khi triển khai:**
   - Những lưu ý quan trọng cần bổ sung hoặc làm rõ để đội ngũ phát triển có thể viết mã trực tiếp mà không cần hỏi lại logic.

## 3. Định dạng đầu ra mong muốn
- Đánh giá tổng quan (Đạt / Cần bổ sung).
- Phân loại nhận xét theo mức độ ưu tiên: [P1 - Nghiêm trọng / Cần xử lý ngay], [P2 - Cải thiện / Hoàn thiện], [P3 - Tối ưu hóa lâu dài].
- Nhận xét kỹ thuật gãy gọn, cụ thể, có căn cứ.
