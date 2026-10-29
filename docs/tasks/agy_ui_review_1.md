# VXSearch UI — vòng sửa/review 1

Bạn tiếp tục là Agy thực thi UI, không Product Studio, không gọi agent/CLI khác. Lượt đầu đã viết UI; đây vòng1/3, sau lượt này còn2. Tham vấn CLI đã dùng0; không tự gọi. Chỉ read_file/write_file, KHÔNG terminal/list_dir/run_command; Codex chạy build/tests. Phạm vi src/** và frontend manifests như lượt đầu, docs/tasks/agy_ui_report.md. Core/shell/spec do Codex sở hữu, không sửa. Tiếng Việt UTF8 snake_case.

Codex review trực tiếp đã thấy các lỗi sau, sửa trọn vẹn trong một lượt:

1. Settings persistFullSettings gọi onSettingsUpdated(next) trước backend thành công nhưng catch không restore → khi hotkey bị chiếm hoặc DB lỗi UI nói cấu hình đã đổi dù chưa lưu. Chỉ áp dụng state sau success, hoặc optimistic có rollback chính xác; disable controls khi saving, slider dùng local draft/commit onPointerUp hoặc debounce tránh nhiều full-settings writes chồng nhau.
2. Recorder gộp e.metaKey và e.ctrlKey thành CmdOrCtrl → trên Mac bấm Control lại đăng ký Command. Phân biệt Super/Command với Control; key đặc biệt Space/Plus/Arrow/Fn dùng mapping e.code phù hợp global-hotkey parser, không tạo chuỗi '+' lỗi. Hotkey conflict hiển thị lỗi và giữ giá trị cũ.
3. Kết quả hiện loadMore append+map DOM không giới hạn, không đáp ứng dữ liệu lớn. Dùng phân trang rời50items với nút trước/sau, hoặc virtualization đúng. Ưu tiên phân trang rời để đơn giản, rõ vị trí trang; đổi query/type/root/sort reset offset. Response generation bảo vệ cả page requests và poll invalidation; không để poll3s reset selection/trang đang xem. Nếu xóa đến trang cuối rỗng, quay lại trang hợp lệ.
4. Shell phát `search_focus` khi shortcut/tray/window focus và `open_panel` payload 'folders'|'settings'. UI phải listen cả hai, auto_select_input chỉ khi setting true và không đang modal/native picker; open_panel mở đúng modal. Listen `settings_changed` để reload settings khi shell fallback hotkey được persist nền. Cleanup listeners kể cả component unmount trong lúc await listen.
5. Escape dropdown menu chỉ đóng dropdown, không bubble để đồng thời clear query/hide app. Escape modal ưu tiên đóng confirmation layer trước modal, không đóng modal khi picker hoặc thao tác đang bận. Dialog có focus trap+restore để Tab không chạy ra UI nền.
6. Nhãn offline không được luôn gọi 'Ổ ngoài ngắt kết nối' vì root local missing/identity mismatch cũng offline. Dùng 'Thư mục hiện không khả dụng', hiển thị error_message cụ thể; giữ Copy path offline, disable Open/Reveal.
7. 'Thư mục gần đây' đang watchedRoots.slice(0,5) theo thứ tự IDs cũ; đổi thành nhãn 'Thư mục theo dõi' nếu không có dữ liệu recent thật (không tự thêm tracking ngoài scope).
8. Rút gọn copy cho người dùng: browser preview chỉ 'Mở bản desktop để chọn thư mục và tìm tệp.'; không nói 'IPC' hoặc 'không tạo dữ liệu giả'. Đổi Cyrillic 'метаdata' banner thành 'Đang lập chỉ mục'. Cache nói 'Bộ nhớ chỉ mục'/'Thu gọn chỉ mục', tránh giải thích VACUUM/FTS trong flow; About được ghi công nghệ nhưng không claim 'đảm bảo tốc độ tức thì', 'an toàn tuyệt đối' khi chưa benchmark mọi OS. Default debounce300ms theo backend, không150ms.

Kiểm lại import/type unused và tsconfig: project references với noEmit có thể TS6310; dùng `tsc --noEmit` tách config hợp lệ hoặc build script tsc -p tsconfig.json nếu bỏ references. @types/node nếu vite.config.ts cần process.

Sau sửa ghi báo cáo files/logic đã sửa, còn2rounds và các phần chưa test; đừng tự claim build/native/Windows pass vì không có terminal. Không mở rộng scope updater/release.

Kết quả build thực tế lần đầu: TS6306 referenced tsconfig.node.json thiếu composite, TS6310 referenced project may not disable emit. Sửa bỏ references và include src + vite config trong config phù hợp; Codex sẽ chạy lại rồi gửi lỗi còn lại nếu có.

Thêm lỗi keyboard cụ thể trong app.tsx: global Enter đang chạy cả khi focus BUTTON nên có thể mở file đồng thời nhấn nút Cài đặt; chỉ điều hướng file khi target là search input/body/list, không buttons/select/other controls. Luôn bỏ qua event.isComposing/keyCode229 để Enter kết thúc IME tiếng Việt không vô tình mở file. Generation phải invalidated ngay khi query/filter/root/sort đổi (trước khoảng debounce), không đợi executeSearch tăng counter. Async native subscriptions khi deps đổi/unmount phải hủy listener đã và đang đăng ký, không để leak.

Type-check nguồn độc lập (bỏ config lỗi) còn: title_bar.tsx(52,25) HTMLHeaderElement không tồn tại → HTMLElement; main.tsx(4,8) import CSS thiếu declaration → src/vite_env.d.ts với reference vite/client. Nếu dùng process trong vite.config.ts cần @types/node hoặc dùng loadEnv/vite API thích hợp.
