# VXSearch — Công cụ Tìm kiếm Tập tin Cục bộ Siêu Tốc (Desktop Search)

> **Desktop Search Utility** định hướng tốc độ, bảo mật và trải nghiệm tức thì trên Windows & macOS.  
> Được xây dựng trên nền tảng **Tauri 2 (Rust) + React (TypeScript) + SQLite FTS5 (Trigram)**.

---

## 1. Giới thiệu tổng quan

**VXSearch** là tiện ích desktop gọn nhẹ thuộc hệ sinh thái **VXUtilities**, chuyên giải quyết bài toán tìm kiếm tệp tin và thư mục cục bộ với phương châm:
- **Tốc độ phản hồi tức thì (< 30ms):** Nhập ký tự là thấy kết quả ngay lập tức nhờ bộ chỉ mục SQLite FTS5 cấu hình tokenize `trigram`.
- **Hỗ trợ gõ tiếng Việt không dấu siêu tốc:** Chuẩn hóa tự động chuỗi ký tự bỏ dấu (`name_unaccent`) giúp người dùng gõ `baocao` vẫn tìm chính xác `Báo cáo tài chính 2026.xlsx`.
- **Tôn chỉ Read-Only an toàn tuyệt đối:** Ứng dụng **chỉ đọc** siêu dữ liệu hệ thống (tên, đường dẫn, kích thước, thời gian sửa đổi). Tuyệt đối **không mở ghi, không xóa, không sửa, không đổi tên** bất kỳ tệp tin nào trên máy người dùng.

---

## 2. Kiến trúc Kỹ thuật (Technical Architecture)

```
[ Frontend: React + Tailwind CSS + Lucide Icons ]
               │
               ▼  (Tauri IPC Commands / Events)
[ Core Backend: Tauri 2 + Rust Core Engine ]
    ├── System Tray & Global Shortcut Manager (Alt+Space / Option+Space)
    ├── FS Watcher Pipeline (notify-rs) & Replay Buffer
    ├── Background Indexer (Walkdir + Jwalk)
    └── Local Storage: SQLite with FTS5 (trigram) & WAL Mode
```

- **Runtime:** Tauri 2 (Desktop Framework siêu nhẹ, bộ nhớ RAM idle < 45MB).
- **Backend Core:** Rust (an toàn bộ nhớ, đa luồng quét chỉ mục nền, xử lý filesystem I/O song song).
- **Frontend UI:** React 18, TypeScript, Tailwind CSS, Lucide React Icons.
- **Search Engine:** SQLite FTS5 với `trigram tokenizer`, chế độ `WAL (Write-Ahead Logging)` và `PRAGMA synchronous = NORMAL`.
- **Hỗ trợ đa nền tảng:** Windows 10/11 (x64, ARM64) và macOS 12+ (Apple Silicon & Intel).

---

## 3. Bộ Đặc tả Kỹ thuật Hệ thống (System Specifications Suite)

Toàn bộ tài liệu đặc tả kiến trúc, quy trình nghiệp vụ và tiêu chuẩn phát triển của VXSearch được lưu trữ tại thư mục [`docs/spec/`](docs/spec/):

| STT | Tài liệu đặc tả | Mô tả nội dung cốt lõi |
| :---: | :--- | :--- |
| **00** | [System Overview](docs/spec/00_system_overview.md) | Tầm nhìn, kiến trúc tổng quan, tôn chỉ an toàn Read-Only, lộ trình Vertical Slice và ma trận công nghệ. |
| **01** | [Business Process](docs/spec/01_business_process.md) | Sơ đồ Swimlane (Watcher vs Indexer, Quản lý ổ cứng di động), 4 SIPOC và 3 Ma trận quyết định xử lý ngoại lệ I/O. |
| **02** | [Feature Flow](docs/spec/02_feature_flow.md) | 6 User Flows, Sequence Diagrams (bảo vệ watcher race condition qua Replay Buffer), FSM trạng thái quét và Machine-Readable Contracts. |
| **03** | [UI/UX & Wireframe](docs/spec/03_ui_wireframe.md) | Khung cửa sổ 720×540px chuẩn desktop, thanh Chrome 32px tùy biến, thiết kế ASCII trực quan và Modal Cài đặt tích hợp VietQR. |
| **04** | [API & Data Contract](docs/spec/04_api_data.md) | SQLite Schema tối ưu trigger FTS, bảng DTOs, Tauri IPC Commands/Events và bảng mã lỗi chuẩn hóa (`ERR_IO_*`, `ERR_DB_*`). |
| **05** | [QA Acceptance & Test Cases](docs/spec/05_qa_acceptance.md) | 18 kịch bản kiểm thử Gherkin BDD, 8 Edge Cases khắc nghiệt (ổ ngắt đột ngột, tệp 4TB, quyền truy cập) và Checklist nghiệm thu. |
| **06** | [Demo & Presentation](docs/spec/06_demo_presentation.md) | Kịch bản trình diễn Live Demo 5 phút, 3 khoảnh khắc "Wow" và bộ dữ liệu hạt giống (Seed Data) chuẩn bị thuyết trình. |

---

## 4. Cấu trúc Thư mục Dự án

```
vxsearch/
├── docs/                               # Tài liệu dự án
│   ├── spec/                           # Bộ đặc tả kỹ thuật tiêu chuẩn (00 - 06)
│   ├── codex_review_spec_task.md       # Báo cáo nhiệm vụ thẩm định từ Codex CLI
│   └── codex_review_spec_response.md   # Kết quả phản biện và đánh giá chất lượng spec
├── icon.icns                           # Bộ biểu tượng ứng dụng macOS
├── icon.ico                            # Bộ biểu tượng ứng dụng Windows
├── icon.png                            # Biểu tượng chuẩn PNG độ phân giải cao
├── ivxsearch_icon_menubar.svg          # Biểu tượng Menu bar / System Tray
├── VXSearch_Scope_v1.0.md              # Phạm vi tính năng và phân tích yêu cầu sơ bộ v1.0
├── .gitignore                          # Cấu hình bỏ qua tệp tin mã nguồn và build artifacts
└── README.md                           # Tài liệu giới thiệu tổng quan
```

---

## 5. Bản quyền & Giấy phép

Dự án phát triển bởi **linhbv94** thuộc bộ tiện ích **VXUtilities**.  
Mọi quyền được bảo lưu (All Rights Reserved).
