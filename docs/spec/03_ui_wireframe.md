# 03. Đặc tả Giao diện & Wireframe — VXSearch (`_spec3_ui_wireframe`)

> **Tên sản phẩm:** VXSearch (Lightweight Curated Local Folder File Search Utility)  
> **Thư mục dự án:** `vxsearch`  
> **Phiên bản tài liệu:** 1.0.0  
> **Ngày cập nhật:** 2026-10-28  
> **Quy chuẩn tuân thủ:** [desktop_ui_standards.md](../../../.agents/desktop_ui_standards.md) và [master_theme.md](../../../_summary/master_theme.md)  
> **Tài liệu liên quan:** [00_system_overview.md](00_system_overview.md) | [02_feature_flow.md](02_feature_flow.md)

---

## 1. Triết lý Thiết kế & Định dạng Cửa sổ (Window Geometry & Chrome)

### 1.1. Bố cục Tổng thể & Kích thước Hình học (Window Geometry)
- **Kích thước cửa sổ mặc định (Default Window Size):**
  - **Chiều rộng (Width):** `720px` (Tối ưu cho hiển thị bảng kết quả với đường dẫn tệp dài mà không bị che khuất).
  - **Chiều cao (Height):** `540px` (Khung nhìn hiển thị được 9–11 dòng kết quả tìm kiếm cùng lúc kèm thanh trạng thái).
  - **Kích thước giới hạn (Window Limits):** Chiều rộng tối thiểu `640px`, tối đa `1200px`; Chiều cao tối thiểu `420px`, tối đa `900px`.
  - **Bo góc cửa sổ (Border Radius):** `12px` (`rounded-xl`), viền ngoài siêu mảnh `1px solid rgba(255, 255, 255, 0.08)` (Dark) / `1px solid rgba(0, 0, 0, 0.08)` (Light).
  - **Độ sâu bóng đổ (Elevation Shadow):** `shadow-2xl` (`0 20px 40px -15px rgba(0, 0, 0, 0.60)`).

### 1.2. Quy chuẩn Thanh Trên Cùng (Single-Row TitleBar Chrome — desktop_ui_standards)
Tuân thủ tuyệt đối quy chuẩn [desktop_ui_standards.md](../../../.agents/desktop_ui_standards.md):
- **Chiều cao cố định (Height):** Đúng `32px`, chỉ duy nhất 1 hàng, không để 2 hàng titlebar.
- **Phông chữ tiêu đề (Typography):** System font (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`), cỡ chữ `12px`, độ đậm `font-semibold (weight 600)`, không dùng monospace cho tên app.
- **Biểu tượng ứng dụng (App Icon):** Kích thước chuẩn `16×16px`, khoảng cách với tên app là `6px` (`gap-1.5`).
- **Trên macOS:**
  - Bộ Traffic Lights native của macOS nằm ở góc trái, appearance native chuẩn SDK 27.0.
  - Tâm dọc của các nút Traffic Lights được căn chỉnh chính xác tại `15.5pt` tính từ đỉnh content view để trùng tâm hàng chữ và các action trên thanh công cụ.
  - Tiếp theo là icon app (16px) và nhãn "VXSearch".
  - Bên phải thanh titlebar bố trí: Nút `[📂 Thư mục theo dõi]` (12px, hover nền mờ), nút `[⚙️ Cài đặt]` và vùng kéo cửa sổ `data-tauri-drag-region`.
- **Trên Windows:**
  - Bỏ hoàn toàn titlebar native của hệ điều hành (`decorations: false`, không để runtime effect gây double bar).
  - Góc trái: Menu File, Edit và nút `[📂 Thư mục (3)]`; ẩn hoàn toàn icon và tên app trên Windows theo đúng chuẩn `desktop_ui_standards.md`.
  - Giữa: Vùng kéo thả cửa sổ `data-tauri-drag-region`.
  - Góc phải: Nút `[⚙️ Cài đặt]` và **Bộ ba nút điều khiển Windows chuẩn (Minimize, Maximize, Close)** được vẽ custom phẳng, nút Close có hover đỏ `#e81123`. Tuyệt đối không mang Traffic Lights của Mac sang Windows.

---

## 2. Bản vẽ Giao diện ASCII Chi tiết (ASCII Wireframes)

### 2.1. Màn hình 1: Giao diện Tìm kiếm Chính (Search View — Happy Path)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [● ● ●] (macOS) / [VX] VXSearch     [📂 Thư mục (3)]  [⚙️]      [—] [□] [✕] │ ◄── 32px TitleBar
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🔍  Nhập tên tệp hoặc đuôi mở rộng... (.pdf, .rs)       [Esc xóa / ẩn] │  │ ◄── 42px SearchBar
│  └────────────────────────────────────────────────────────────────────────┘  │
│  [ Tất cả ] [📄 Tài liệu] [🖼️ Ảnh] [🎬 Video] [💻 Code] [📦 Nén]              │ ◄── Filter Chips
├──────────────────────────────────────────────────────────────────────────────┤
│  TÊN TỆP & ĐỊNH DẠNG               ĐƯỜNG DẪN THƯ MỤC CHA       KÍCH THƯỚC    │ ◄── Header cột 24px
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 📄 Financial_Report_Q3_2026.pdf  .../Projects/Corporate/Doc      1.4 MB  │ │ ◄── Row 1 (Hovered)
│ │    [🔗 Mở tệp] [📂 Vị trí tệp] [📋 Chép đường dẫn]                       │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ 💻 engine_coordinator.rs         .../VXUtilities/vxsearch/src-tauri   42.8 KB │ │ ◄── Row 2 (Selected:
│ │    [🔗 Mở tệp] [📂 Vị trí tệp] [📋 Chép đường dẫn]                       │ │      viền sáng Cyan)
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ 🖼️ hero_banner_dark.png          .../Assets/Marketing/Banners    3.2 MB  │ │ ◄── Row 3
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ 📄 Architecture_Spec_v1.0.docx   .../Specifications/Drafts       850 KB  │ │ ◄── Row 4
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ 📦 release_v1.0.0_macos.zip      .../Releases/Artifacts          18.6 MB │ │ ◄── Row 5
│ │                                                                          │ │
│ │                                  (Cuộn ảo hóa 60fps)                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  ● 3 thư mục đang theo dõi • 142,508 tệp • Sẵn sàng      [↑↓] Chọn [↵] Mở   │ ◄── 24px Footer
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Màn hình 2: Trạng thái Đang quét / Kết quả Rỗng (Scanning & Empty States)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  TRẠNG THÁI 1: ĐANG QUÉT LẬP CHỈ MỤC BAN ĐẦU (SCANNING INITIAL)             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🔍  Projects/ClientWork...                                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                         🔄 Đang quét lập chỉ mục...                          │
│                   /Users/vic/Projects/LargeDataset/assets/...                │
│                                                                              │
│               [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] (Shimmer)             │
│                       Đã ghi nhận: 84,210 tệp (walkdir)                      │
│                                                                              │
│         (Bạn vẫn có thể gõ từ khóa để tìm các tệp đã quét xong)              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  TRẠNG THÁI 2: KHÔNG TÌM THẤY KẾT QUẢ PHÙ HỢP (EMPTY RESULTS)               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                  🔍 ✕                                        │
│                 Không tìm thấy tệp nào khớp với "xyz999"                     │
│                                                                              │
│    • Kiểm tra lại lỗi chính tả hoặc khoảng trắng thừa                        │
│    • Thử chuyển sang bộ lọc [ Tất cả ]                                       │
│    • Đảm bảo thư mục chứa tệp đã được thêm vào danh sách theo dõi            │
│                                                                              │
│                    [📂 Mở quản lý thư mục theo dõi]                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.3. Màn hình 3: Hộp thoại Quản lý Thư mục Theo dõi (Watched Folders Modal)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  📂 Quản lý Thư mục Theo dõi (Watched Folders)                        [✕]   │ ◄── Modal Header
├──────────────────────────────────────────────────────────────────────────────┤
│  VXSearch chỉ tìm kiếm trong các thư mục bạn chủ động chọn dưới đây.         │
│  Dữ liệu hoàn toàn cục bộ, chỉ đọc metadata và không sửa/xóa tệp của bạn.    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 📁 /Users/vic/Projects                                                 │  │
│  │    ● Đang theo dõi • 94,120 tệp • 18.4 GB                 [🔄] [🗑️]   │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │ 📁 /Users/vic/Documents/WorkContracts                                  │  │
│  │    ● Đang theo dõi • 12,450 tệp • 4.2 GB                  [🔄] [🗑️]   │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │ 📁 /Volumes/Samsung_T7/Archive_2025                                    │  │
│  │    ○ Ổ ngoài tạm ngắt kết nối • 35,938 tệp (Đã lưu)       [🔄] [🗑️]   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [+ Thêm thư mục mới...]               (Hoặc kéo thả thư mục vào cửa sổ này) │
├──────────────────────────────────────────────────────────────────────────────┤
│  Tổng cộng: 3 thư mục • 142,508 tệp đã lưu trong CSDL                [Đóng]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.4. Màn hình 4: Hộp thoại Cài đặt Chuẩn hóa (Settings Modal — Master Theme VXUtilities)

Tuân thủ cấu trúc Sidebar 2 nhóm ngăn cách bởi đường kẻ mờ theo `desktop_ui_standards.md`:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Cài đặt VXSearch                                                   [✕]   │ ◄── Drag region
├─────────────────────────┬────────────────────────────────────────────────────┤
│ CÀI ĐẶT CHUNG           │ CÀI ĐẶT PHÍM TẮT TOÀN CỤC (GLOBAL SHORTCUTS)       │
│ • Chung (General)       │                                                    │
│ • Phím tắt (Shortcuts)  │ Phím tắt hiện/ẩn cửa sổ tìm kiếm:                  │
│ • Bộ nhớ đệm (Cache/DB) │ [ Cmd + Shift + F          ]  [Ghi lại phím]       │
│                         │ (Tự động fallback sang Ctrl+Alt+F nếu bị chiếm)   │
│ ─────────────────────── │                                                    │
│ THÔNG TIN & HỖ TRỢ      │ HÀNH VI CỬA SỔ & HỆ THỐNG                          │
│ • Cập nhật (Updates)    │ ☑ Chạy ngầm trên Menu Bar / System Tray khi đóng   │
│ • Giới thiệu (About)    │ ☑ Tự động bôi đen ô tìm kiếm khi mở cửa sổ        │
│ • ☕ Ủng hộ tác giả      │ ░ Tự động khởi động cùng HĐH (P1 — Sau v1.0)       │
│   (Support Author)      │                                                    │
│                         │ ĐỘ TRỄ GOM SỰ KIỆN (DEBOUNCE WINDOW)               │
│                         │ [===●================] 300ms                       │
├─────────────────────────┴────────────────────────────────────────────────────┤
│  [Khôi phục mặc định]                                                [Đóng]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Chi tiết Tab Ủng hộ Tác giả (Support Author Tab):
- Nằm ở cuối sidebar với icon `Coffee` màu ấm Semantic Amber (`#f59e0b`).
- Card mã QR VietQR (Vietcombank) nền trắng sắc nét đặt ở vị trí trung tâm nổi bật, tối ưu để người dùng quét trực tiếp từ app ngân hàng trên điện thoại (không cần hiển thị thủ công tên/số tài khoản hay nút copy STK).
- Lời cảm ơn chân thành, ấm áp từ tác giả Bùi Việt Linh.

---

## 3. Cây Phân Cấp Thành Phần React (Component Hierarchy Tree)

```text
App.tsx (Root Layout & Global Listeners)
├── TitleBar.tsx (Single-row 32px chrome, traffic lights / win controls)
│   ├── AppBadge (Icon 16px + "VXSearch" 12px/600)
│   ├── FolderManagerTriggerButton (Badge hiển thị số thư mục)
│   ├── SettingsTriggerButton (Icon bánh răng)
│   └── WindowControls (Windows minimize/maximize/close)
│
├── SearchSection.tsx (Thanh tìm kiếm & Bộ lọc)
│   ├── SearchBar.tsx (Input, Clear icon, Shortcut tag)
│   └── FilterChipsBar.tsx (All, Docs, Images, Videos, Code, Archives)
│
├── ContentArea.tsx (Khu vực nội dung chính)
│   ├── ScanningBanner.tsx (Thanh tiến trình khi có Root đang quét)
│   ├── ResultList.tsx (Bảng ảo hóa @tanstack/react-virtual)
│   │   └── ResultRow.tsx (44px row)
│   │       ├── FileTypeIcon.tsx (Semantic colors)
│   │       ├── FileNameCell.tsx (Highlight text match)
│   │       ├── ParentPathCell.tsx (Truncate middle, tooltip)
│   │       ├── MetadataCell.tsx (Size & Modified time)
│   │       └── ActionButtonsGroup.tsx (Open, Reveal, Copy Path)
│   │
│   └── EmptyState.tsx (Hiển thị khi không có kết quả hoặc chưa có folder)
│
├── StatusFooter.tsx (Thanh trạng thái dưới cùng 24px)
│   ├── StatusIndicatorPill (Dot xanh: Sẵn sàng, Dot vàng: Đang quét)
│   ├── TotalStatsCounter (Tổng số file, dung lượng DB)
│   └── KeyboardShortcutsLegend (Hướng dẫn phím mũi tên, Enter, Esc)
│
├── ModalsContainer.tsx
│   ├── FolderManagerModal.tsx (Danh sách thư mục, nút Thêm/Xóa/Quét lại)
│   │   └── FolderItemRow.tsx (Trạng thái online/offline, dung lượng)
│   └── SettingsModal.tsx (Sidebar chuẩn VXUtilities)
│       ├── GeneralTab.tsx
│       ├── ShortcutsTab.tsx
│       ├── CacheTab.tsx (Hiển thị dung lượng SQLite, nút tối ưu VACUUM)
│       ├── UpdatesTab.tsx (Kiểm tra cập nhật từ GitHub Releases)
│       ├── AboutTab.tsx (Thông tin app, phiên bản, tác giả Bùi Việt Linh)
│       └── SupportAuthorTab.tsx (Mã QR VietQR căn giữa, nổi bật)
│
└── ToastNotification.tsx (Thông báo chép đường dẫn, lỗi nhẹ, stale file)
```

---

## 4. Bảng Design Tokens & Theme Variables

Tuân thủ tuyệt đối [master_theme.md](../../../_summary/master_theme.md):

| Nhóm Token | Tên Token | Giá trị Dark Mode | Giá trị Light Mode | Tailwind Class tương ứng |
|:---|:---|:---|:---|:---|
| **Màu Nền (Surfaces)**| App Canvas | `#0f1117` | `#f8fafc` | `bg-[#0f1117] dark:bg-[#0f1117]` |
| | Glass Panel | `rgba(20, 24, 33, 0.85)` | `rgba(255, 255, 255, 0.92)` | `bg-[#141821]/85 backdrop-blur-md` |
| | Glass Modal / Card | `#141821` | `#ffffff` | `bg-[#141821] dark:bg-[#141821]` |
| | Input Surface | `rgba(15, 20, 28, 0.90)` | `#ffffff` | `bg-slate-900/90 border-slate-700/60` |
| **Màu Điểm Nhấn (Accent)**| Primary Accent | `#06b6d4` / `#22d3ee` | `#0891b2` | `text-cyan-400 bg-cyan-500` |
| | Accent Active Surface| `rgba(6, 182, 212, 0.15)` | `rgba(6, 182, 212, 0.10)` | `bg-cyan-500/15 border-cyan-500/40` |
| | Accent Glow Ring | `rgba(6, 182, 212, 0.35)` | `rgba(6, 182, 212, 0.25)` | `ring-1 ring-cyan-400/40` |
| **Màu Ngữ Nghĩa (Semantic)**| Images | `#34d399` | `#10b981` | `text-emerald-400` |
| | Video | `#38bdf8` | `#0284c7` | `text-sky-400` |
| | Audio | `#fbbf24` | `#d97706` | `text-amber-400` |
| | PDF / Danger | `#fb7185` | `#e11d48` | `text-rose-400` |
| | Code | `#a78bfa` | `#7c3aed` | `text-violet-400` |
| | Archives | `#f97316` | `#ea580c` | `text-orange-400` |
| **Màu Chữ (Typography)**| Primary Text | `#f8fafc` | `#0f172a` | `text-slate-100 dark:text-white` |
| | Secondary Text | `#cbd5e1` | `#334155` | `text-slate-300 dark:text-slate-300`|
| | Muted Text | `#94a3b8` | `#64748b` | `text-slate-400 dark:text-slate-400`|
| **Đường Viền (Borders)**| Subtle Border | `rgba(255, 255, 255, 0.08)`| `rgba(0, 0, 0, 0.08)` | `border-white/10 dark:border-white/10`|

---

## 5. Visual Wireframe Prompts (Dành cho AI UI Generator)

```text
UI Wireframe Prompt:
Desktop search utility interface named "VXSearch", dark-first modern design inspired by Linear and Raycast, running on macOS/Windows desktop.
Dimensions: 720x540px with subtle 1px border and rounded corners (12px radius).
Top Titlebar: 32px height single-row chrome. On the left are macOS native traffic lights aligned at 15.5pt center, followed by a 16px magnifying glass app icon and bold title "VXSearch" in 12px semibold. On the right are two compact ghost buttons: "📂 Watched Folders (3)" and a gear icon for Settings.
Search Section: 44px height search input with dark translucent glass surface, glowing electric cyan border when focused, inside placeholder text "Type filename or extension to search... (.pdf, .rs)". Below the input is a horizontal row of pill-shaped filter chips: [All], [Documents], [Images], [Videos], [Code], [Archives] with [All] actively highlighted in cyan tint.
Results Table: Virtualized table with 44px rows. Each row has a semantic file icon (violet for code, rose for PDF, emerald for images), clear filename with highlighted match text, subtle truncated parent directory path in muted slate, file size (e.g. "1.4 MB"), and action buttons that appear on hover: [Open File], [Reveal in Finder], [Copy Path].
Footer: Compact 24px bottom bar with a small green status dot "3 folders watched • 142,508 files indexed", and keyboard hint badges [↑↓ Navigate] [↵ Open] [⌘↵ Reveal] [Esc Dismiss].
Color palette: Deep navy background #0f1117, cards #141821, electric cyan accents #06b6d4, clean white text #f8fafc.
```
