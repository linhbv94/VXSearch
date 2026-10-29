import fcntl, importlib.util, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('existing_runner',pathlib.Path.home()/'.local/lib/agent_runners/runner.py')
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
grants=[f'read_file({root}/src)',f'read_file({root}/public)',f'write_file({root}/src)',f'write_file({root}/public)',f'write_file({root}/docs/tasks/agy_ui_report.md)']
for name in ['docs/spec/07_implementation_contract.md','docs/spec/03_ui_wireframe.md','docs/spec/05_qa_acceptance.md']:
    grants.append(f'read_file({root/name})')
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','index.html']:
    grants.extend([f'write_file({root/name})',f'read_file({root/name})'])
for relative in ['.agents/AGENTS.md','_summary/standard_docs/desktop_ui_standards.md','_summary/standard_docs/master_theme.md','vxmedia/src/components/SettingsModal.tsx','vxmedia/package.json']:
    grants.append(f'read_file({root.parent/relative})')
lock=(pathlib.Path.home()/'.local/state/agent_runs/agy_permissions.lock').open('a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
prompt='''Bạn là Agy thực thi UI VXSearch do user yêu cầu Codex giao. QUAN TRỌNG: chỉ dùng read_file/write_file, không terminal/run_command/list_dir/grep hoặc gọi agent khác. Codex chạy npm/copy assets/checks sau. Tạo file bằng write_file kể cả directory chưa tồn tại. Chỉ đọc các file được chỉ định dưới đây. Repo mới chưa có source, không cần tìm hiện trạng. Không dùng Product Studio. Tiếng Việt UTF-8, snake_case, không LaTeX.\nĐầu tiên đọc /Users/vic/_Work/VXUtilities/.agents/AGENTS.md, /Users/vic/_Work/VXUtilities/_summary/standard_docs/desktop_ui_standards.md, /Users/vic/_Work/VXUtilities/_summary/standard_docs/master_theme.md và /Users/vic/_Work/VXUtilities/vxsearch/docs/spec/07_implementation_contract.md. Tham khảo docs/spec/03_ui_wireframe.md và docs/spec/05_qa_acceptance.md.\nSở hữu duy nhất src/**, public/**, index.html, package.json, tsconfig*.json, vite.config.ts và docs/tasks/agy_ui_report.md tại /Users/vic/_Work/VXUtilities/vxsearch. KHÔNG sửa src_tauri/crates/scripts/spec/README/root docs. Tạo React TypeScript Vite UI hoàn chỉnh IPC theo contract 07. Package scripts dev/build/preview và tauri: node scripts/tauri_sdk.mjs. dependencies @tauri-apps/api ^2, react/react-dom ^19, lucide-react ^1.52; dev @tauri-apps/cli ^2, @types/react/react-dom ^19, @vitejs/plugin-react ^6, typescript ^7, vite ^8. CSS tokens thuần, không cần Tailwind.\nUI compact 720x540, min640x440, chrome32px: Mac native traffic lights shell làm, UI chừa82px + app_icon.png/name; Win menu trái/control phải không icon/name. Native window API cho drag/minimize/maximize/close. Search debounced generation guard, type chips gồm audio, root filter/sort, 50/pagination, Arrow/Enter/Cmd Enter/Cmd C/Escape đúng ngữ cảnh, selected row scroll. Kết quả tên/path/size/date/actions Open/Reveal/Copy. Empty/loading/error/offline. Folder modal picker/add/merge confirmation IDs/remove chỉ index/refresh/relink. Settings General/Shortcuts/Cache/Updates/About/Support, full settings payload, theme dark/light/system persisted; header drag, body scroll. QR public/support_qr.png và icon public/app_icon.png Codex copy sau. About tác giả Bùi Việt Linh, version từ system_status, repo https://github.com/linhbv94/VXSearch bằng open_project_url. Updates nói đúng chưa có release/updater, không fake check. Không auto-hide on blur. Native events invalidate + poll3s. Browser preview empty với notice desktop, không tự fake data.\nBắt đầu bằng write_file docs/tasks/agy_ui_report.md xác nhận nhận task, rồi viết toàn bộ UI. Không dừng ở plan. Lượt đầu chưa có sửa/review (3 còn lại), không gọi tham vấn CLI; cần gì báo Codex. Báo files và phần chưa verify. Không chạy commands vì headless không có quyền terminal; chỉ write_file/read_file.'''
if len(sys.argv)>1:
    prompt=pathlib.Path(sys.argv[1]).read_text()
cli=['agy']
if len(sys.argv)>2:
    cli.extend(['--conversation',sys.argv[2]])
with runner.permissions(pathlib.Path.home()/'.gemini/antigravity-cli/settings.json',grants,root/'docs/tasks'):
    with (root/'docs/tasks/agy_ui_output.log').open('a') as log:
        result=subprocess.run(cli+['--output-format','stream-json','--print-timeout','1800s','--log-file',str(root/'docs/tasks/agy_ui_cli.log'),'--print='+prompt],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,timeout=1860)
sys.exit(result.returncode)
