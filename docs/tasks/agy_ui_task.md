# Agy thực thi UI VXSearch

User giao Codex điều phối từ đầu đến cuối, tự giao agy CLI làm UI. Bạn là agent thực thi UI; Codex phụ trách engine và shell. Tuân thủ AGENTS global/user và ../.agents/AGENTS.md. Tiếng Việt, UTF-8, file mới snake_case; không LaTeX. Không dùng Product Studio (user vừa yêu cầu tắt). Không gọi agent/CLI khác; khi cần tham vấn trả câu hỏi về Codex chủ trì, tuân thủ mục 0.C. Lượt đầu: 0/3 vòng sửa đã dùng, 3 còn lại; 0/2 tham vấn đã dùng nhưng subprocess này không gọi CLI tiếp.

Đọc đầy đủ docs/spec/07_implementation_contract.md (ưu tiên cao nhất), docs/spec/03_ui_wireframe.md, docs/spec/05_qa_acceptance.md và ../_summary/standard_docs/desktop_ui_standards.md, ../_summary/standard_docs/master_theme.md. Có thể đọc mẫu ../vxmedia/src/components/SettingsModal.tsx; asset QR ../_summary/qr.png, icon.png có sẵn.

Sở hữu duy nhất: src/**, public/**, index.html, package.json, package-lock.json, tsconfig*.json, vite.config.ts, docs/tasks/agy_ui_report.md. KHÔNG sửa src_tauri, crates, scripts, spec, README hoặc tài liệu root tổng; agent khác đang làm. Không chạy tauri build/cargo. Tạo React + TypeScript + Vite UI thực có IPC, không chỉ mock; dùng lucide-react, CSS tokens hoặc tailwind tùy lựa chọn. package scripts dev,build,preview; tauri script phải `node scripts/tauri_sdk.mjs`. Chạy npm install, npm run build để kiểm chứng. Không chọn versions giả; lấy versions phù hợp từ app anh em/cache hoặc npm.

Giao diện tinh gọn, đẹp và đầy đủ state. 720×540 mặc định, dùng được ở 640×440. Chrome OS theo hợp đồng, Mac icon/name chừa 82px, native controls do shell phụ trách. Window APIs từ @tauri-apps/api/window. Search input/focus, chips (có audio), root filter, sort, phân trang 50, list với size/path/date/type/actions Open/Reveal/Copy; empty/loading/error/offline. Debounce query + generation guard chặn response cũ. Arrow keys/Enter/Cmd Enter/Cmd C/Escape đúng ngữ cảnh; selected row tự scroll. UI dùng tiếng Việt nhất quán.

Folders modal: native picker invoke pick_folder rồi add, confirmation parent overlap IDs từ error, remove rõ chỉ xóa chỉ mục không xóa nguồn, refresh và relink native picker. Settings cấu trúc chuẩn General/Shortcuts/Cache/Updates/About/Support, theme dark/light/system persistent, full settings update payload. QR thật copy vào public/support_qr.png. Updates nói chính xác chưa có release/updater, không fake action. About version từ get_system_status, tác giả Bùi Việt Linh, repo từ git remote (đọc được) hoặc invoke open_project_url. Không bịa liên kết/tài khoản.

Browser preview không tự fake kết quả; có thể hiện thông báo cần mở bản desktop và empty state. Nếu tạo fixture demo chỉ dùng khi explicit URL ?demo=1 và banner rõ, không lẫn runtime.

Bắt đầu bằng đọc contract và viết log nhận task vào docs/tasks/agy_ui_report.md; sau đó triển khai đầy đủ. Báo files/checks/giới hạn, không tự claim Windows runtime/visual hay native app đã qua QA.
