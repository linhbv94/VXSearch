# Báo cáo Thực thi UI VXSearch (Agy) — Sau Vòng Sửa/Review 1

- **Trạng thái:** Đã hoàn tất sửa toàn bộ các hạng mục review Vòng 1 của Codex.
- **Vòng sửa/review đã dùng:** 1 / 3 (còn lại: 2)
- **Số lần tham vấn CLI đã dùng:** 0 / 2 (còn lại: 2)

---

## 1. Chi tiết các hạng mục đã sửa trong Vòng 1

1. **Cấu hình TypeScript / Vite & Type-check (`package.json`, `tsconfig.json`, `vite.config.ts`, `src/vite_env.d.ts`, `src/components/title_bar.tsx`):**
   - Bỏ `references` trong `tsconfig.json` (khắc phục lỗi `TS6306` / `TS6310`), gộp `include: ["src", "vite.config.ts"]` và dùng `"build": "tsc --noEmit && vite build"` trong `package.json`.
   - Loại bỏ phụ thuộc `process.env` trong `vite.config.ts` để không cần `@types/node`.
   - Thêm `src/vite_env.d.ts` khai báo `/// <reference types="vite/client" />` và `declare module "*.css";`.
   - Sửa `HTMLHeaderElement` thành `HTMLElement` tại `src/components/title_bar.tsx`.

2. **Lưu Settings an toàn & Slider Debounce Draft (`src/components/settings_modal.tsx`):**
   - Hàm `persistFullSettings` chỉ gọi `onSettingsUpdated(next)` **sau khi** `await ipcUpdateSettings(next)` thành công. Khi lỗi (ví dụ xung đột phím tắt hoặc lỗi DB), giữ nguyên state cũ, hiển thị lỗi trực tiếp và khôi phục `draftDebounceMs` về `settings.debounce_ms`.
   - Khóa (`disabled`) các điều khiển khi `isSaving` đang chạy.
   - Thanh trượt `debounce_ms` dùng state nháp `draftDebounceMs` khi kéo và chỉ gửi `update_settings` khi nhả chuột/phím (`onPointerUp` / `onKeyUp` / `onBlur`), tránh gửi chồng nhiều lệnh lưu liên tiếp.

3. **Bộ ghi Phím tắt (Hotkey Recorder) phân biệt Command/Super và Control (`src/components/settings_modal.tsx`):**
   - Tách riêng `e.metaKey` (`Command` trên macOS / `Super` trên hệ điều hành khác) và `e.ctrlKey` (`Control`), không gộp chung thành `CmdOrCtrl`.
   - Ánh xạ `e.code` qua `mapKeyCodeToHotkeyToken` cho chữ cái (`KeyA`–`KeyZ`), chữ số (`Digit0`–`Digit9`), phím chức năng (`F1`–`F24`), `Space`, `Plus` (`Equal`/`NumpadAdd`), `Minus`, mũi tên (`Up`/`Down`/`Left`/`Right`) và các phím chuẩn của `global-hotkey` parser; chặn tạo chuỗi `'+'` lỗi.
   - Khi đăng ký phím tắt bị chiếm, hiển thị thông báo lỗi trên giao diện và giữ nguyên giá trị `settings.global_hotkey` cũ.

4. **Phân trang rời 50 mục/trang & Bảo vệ Generation Counter (`src/app.tsx`, `src/components/result_list.tsx`):**
   - Thay cơ chế append `loadMore` bằng phân trang rời `50` mục/trang (`pageOffset`, nút `Trang trước` / `Trang sau`, hiển thị rõ `Trang X / Y • Hiển thị A–B trên tổng Z kết quả`).
   - Khi thay đổi `query`, `filterType`, `rootId`, `sortBy` hoặc bấm xóa bộ lọc: tăng `searchGenerationRef.current` **ngay lập tức** (trước khoảng chờ debounce) để vô hiệu hóa mọi phản hồi cũ đang bay, đồng thời đặt lại `pageOffset = 0` và `selectedIndex = 0`.
   - Bảo vệ cả truy vấn chuyển trang và truy vấn làm mới từ poll 3s / sự kiện native bằng `searchGenerationRef.current`.
   - Khi poll 3s hoặc sự kiện cập nhật chỉ mục chạy lại tìm kiếm: giữ nguyên `pageOffset` và `selectedIndex` đang xem; nếu các tệp bị xóa khiến trang cuối hiện tại rỗng (`offset > 0 && items.length === 0 && total_matched > 0`), tự động lùi về trang hợp lệ cuối cùng.

5. **Sự kiện Native từ Shell & Cleanup chống rò rỉ Listener (`src/services/tauri_ipc.ts`, `src/app.tsx`):**
   - Lắng nghe thêm `search_focus` (chỉ focus + select ô tìm kiếm khi `settings.auto_select_input === true` và không mở modal hay hộp thoại chọn thư mục native), `open_panel` (`'folders' | 'settings'` để mở đúng modal) và `settings_changed` (tải lại `get_settings` + `get_system_status` khi shell lưu fallback hotkey dưới nền).
   - Hàm `subscribeNativeEvents` trả về hàm hủy đồng bộ với cờ `disposed`: nếu component unmount hoặc đổi dependencies trong lúc `await listen(...)` chưa kịp resolve, listener vừa resolve sẽ được gọi `unlisten()` ngay lập tức, không gây leak.

6. **Phân cấp phím Escape, Focus Trap + Restore và Chặn phím toàn cục đúng ngữ cảnh (`src/components/title_bar.tsx`, `src/components/folder_manager_modal.tsx`, `src/components/settings_modal.tsx`, `src/app.tsx`):**
   - Bỏ qua mọi sự kiện bàn phím khi đang gõ bộ gõ IME tiếng Việt (`e.isComposing || e.keyCode === 229`).
   - `Escape` khi menu dropdown trên TitleBar đang mở: chặn ở pha capture (`e.preventDefault(); e.stopPropagation()`), chỉ đóng dropdown mà không xóa từ khóa hay ẩn cửa sổ.
   - `Escape` trong `FolderManagerModal` và `SettingsModal`: ưu tiên đóng lớp xác nhận con (`pendingMerge`, `pendingRelink`, `pendingRemoveId`, `showManualInput`, `isRecordingHotkey`) trước khi đóng modal; không đóng modal khi đang mở hộp thoại chọn thư mục hoặc đang xử lý bận (`isBusy`, `isPicking`, `isSaving`, `isVacuuming`).
   - Bổ sung Focus Trap (`Tab` / `Shift+Tab` xoay vòng trong dialog) và khôi phục tiêu điểm (`previousFocusRef`) khi đóng cả 2 modal.
   - Trong `src/app.tsx`: chỉ xử lý `ArrowUp`, `ArrowDown`, `Enter`, `Cmd/Ctrl+Enter` và `Cmd/Ctrl+C` khi tiêu điểm nằm ở ô tìm kiếm, `body` hoặc vùng danh sách kết quả (`.vx-results-scroll`), tuyệt đối không chặn khi focus đang nằm trên `<button>`, `<select>` hoặc các điều khiển khác.

7. **Nhãn trạng thái Không khả dụng, Nhãn Thư mục theo dõi & Rút gọn câu chữ (`src/components/result_list.tsx`, `src/components/folder_manager_modal.tsx`, `src/components/title_bar.tsx`, `src/components/settings_modal.tsx`, `src/services/tauri_ipc.ts`):**
   - Đổi nhãn `'Ổ ngoài ngắt kết nối'` thành `'Thư mục hiện không khả dụng'` kèm hiển thị `error_message` cụ thể của thư mục; vẫn cho phép chép đường dẫn (`Copy`) và khóa `Open`/`Reveal`.
   - Đổi tiêu đề dropdown trên thanh công cụ từ `'Thư mục theo dõi gần đây'` thành `'Thư mục theo dõi'`.
   - Rút gọn thông báo Browser Preview thành `'Mở bản desktop để chọn thư mục và tìm tệp.'` (bỏ chữ `IPC` và `không tạo dữ liệu giả`).
   - Sửa lỗi chính tả Cyrillic trên thanh tiến trình quét thành `'Đang lập chỉ mục'`.
   - Đổi nhãn tab và nội dung Cache thành `'Bộ nhớ chỉ mục'` / `'Thu gọn chỉ mục'`, bỏ giải thích kỹ thuật `VACUUM`/`FTS5`; rút gọn mô tả trong tab `About` không dùng các cụm từ chưa kiểm chứng (`'đảm bảo tốc độ tức thì'`, `'an toàn tuyệt đối'`).
   - Đặt mặc định `debounce_ms: 300` theo backend.

---

## 2. Phần chưa kiểm chứng (Bàn giao Codex kiểm tra)

Do không sử dụng quyền terminal trong phiên của Agy:
- Chưa tự chạy `npm run build` (`tsc --noEmit && vite build`) sau lượt sửa 1.
- Chưa kiểm thử runtime/visual thực tế trên macOS và Windows.

## Codex integration verification sau vòng1

- TypeScript/Vite build PASS;13UI fixture groups PASS. Sửa bổ sung loading-generation khi trang cuối bị xóa, clear stale results khi query lỗi, giới hạn debounce100–2000ms và key tokens theo parser native, cột thao tác/footer640px. Bộ icon/QR đã copy và SHA256 khớp nguồn.
- Bundle final macOSarm64 SDK27.0/codesign ad-hoc PASS; nativeGUI chưa kiểm vì Mac khóa. Windows screenshot chỉ fixturebrowser. Chi tiết tại [báo cáo triển khai](../qa/implementation_report.md).
- VòngCLI sửa/review đã dùng1/3, còn2. Grants tạm đã khôi phục.


---

## 3. Vòng 2/3 — Tiếp nhận & Thực thi UI Follow-up (TitleBar SVG Glyph & QuickSearch Popup)

- **Trạng thái:** Đã nhận task Vòng 2/3, đang triển khai 3 tệp được giao (`src/components/title_bar.tsx`, `src/quick_search.tsx`, `src/main.tsx`).
- **Vòng sửa/review:** Đang thực hiện vòng 2/3 (đã dùng 1 trước đó, sau lượt này còn 1).
- **Tham vấn CLI:** 0 / 2 (không gọi thêm).

### Kết quả thực thi Vòng 2/3 (Agy)

1. **`src/components/title_bar.tsx`:**
   - Đã bỏ state `iconError` và thẻ `<img src="/app_icon.png" />` / fallback.
   - Luôn hiển thị glyph SVG `Search` (Lucide) kích thước `16×16px`, màu accent cyan (`var(--accent-bright)`), khoảng cách `gap: 6px` cạnh tên ứng dụng `VXSearch` trên macOS.
   - Trên Windows giữ nguyên menu `Tệp` / `Chỉnh sửa` / `Thư mục` bên trái, ẩn icon và tên ứng dụng; giữ nguyên toàn bộ chức năng còn lại.

2. **`src/quick_search.tsx` (tạo mới):**
   - Component nhỏ gọn chỉ gồm 1 `<form role="search">` (`380×64`, `padding: 10`, `display: flex`, `gap: 8`, system font `12px`, dùng các CSS tokens hiện có) chứa 1 `<input>` (`flex: 1`, `minWidth: 0`, viền cyan `var(--accent-primary)`) có `<label>` + `aria-label` accessible và 1 nút submit compact nhãn `Tìm`. Không có logo, header, filter, results, settings hay footer.
   - Tự động đọc theme qua `invoke<AppSettings>("get_settings")` khi chạy trong Tauri (`isTauri()`), áp dụng `light` / `dark` / `system` và lắng nghe `matchMedia` (`prefers-color-scheme`) mà không ghi `localStorage` hay tạo side-effect lưu trữ. Trong Browser Preview vẫn render form để kiểm thử nhưng không tạo dữ liệu/kết quả giả.
   - Khi submit: chặn khi chuỗi rỗng/chỉ có khoảng trắng (nút `Tìm` bị `disabled`, không gọi `invoke`); giữ nguyên chuỗi từ khóa gốc có dấu/ký tự và gọi `invoke("submit_quick_search", { query })`. Không tự gọi `invoke` khi đang gõ và không tự gọi window APIs để mở cửa sổ chính.
   - Khóa bất đồng bộ (`submittingRef` + `isSubmitting`) chống double-click / nhấn `Enter` lặp; hiển thị lỗi gọn ngay trong form qua `title` và `<span role="status" aria-live="polite">` mà không mở thêm panel.
   - Chặn `Enter` khi đang gõ IME tiếng Việt (`isComposingRef` với `onCompositionStart`/`onCompositionEnd`, `e.nativeEvent.isComposing`, `keyCode === 229`, `e.key === "Process"`). Nhấn `Escape` gọi `invoke("hide_quick_search")`.
   - Tự động `focus()` khi mount, khi cửa sổ popup mở/focus lại, và lắng nghe sự kiện native `listen("quick_search_focus")` để `focus()` + `select()` ô nhập liệu kèm cơ chế `disposed` dọn dẹp `unlisten()` an toàn kể cả khi unmount trong lúc `await`.

3. **`src/main.tsx`:**
   - Kiểm tra `new URLSearchParams(window.location.search).get("view") === "quick_search"` để chỉ mount `<QuickSearch />`, ngược lại mount `<App />`. Giữ nguyên `React.StrictMode` và import `./styles/theme_tokens.css`, đảm bảo popup không tải `App` (không chạy index status, modals hay polling).

4. **Phần chưa kiểm chứng (Bàn giao Codex):**
   - Agy chỉ dùng `read_file` / `write_file` theo đúng phạm vi ủy quyền, chưa chạy lệnh build/tests. Codex sẽ chạy build và kiểm thử tích hợp.
   - **Bộ đếm vòng sửa/review:** Đã dùng 2 / 3 (còn lại: 1). Tham vấn CLI: 0 / 2.
