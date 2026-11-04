# VXSearch — Ultra-fast Local File Finder

[![Release](https://img.shields.io/github/v/release/linhbv94/VXSearch?style=flat-square&color=06b6d4)](https://github.com/linhbv94/VXSearch/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-0284c7?style=flat-square)](https://github.com/linhbv94/VXSearch/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![Ecosystem](https://img.shields.io/badge/part%20of-VXUtilities-0ea5e9?style=flat-square)](../_summary/master_overview.md)

**VXSearch** là tiện ích desktop tìm kiếm tệp tin cục bộ siêu tốc theo những thư mục do người dùng chủ động chỉ định. Tìm kiếm tức thì theo tên, đường dẫn và phần mở rộng tệp mà không gây hao tốn tài nguyên hệ thống.

> **Tôn chỉ:** *Chỉ đọc siêu dữ liệu (Metadata Only), không lập chỉ mục nội dung file nặng nề, không sửa/xóa/di chuyển tệp nguồn, 100% Offline & Quyền riêng tư.*  
> **Phiên bản hiện tại:** `v1.0.0` — Thành viên trong hệ sinh thái [VXUtilities](../_summary/master_overview.md).

---

## 1. Tính năng nổi bật

* **Tìm kiếm tức thì (Instant Search):** Tận dụng sức mạnh của SQLite WAL kết hợp chỉ mục FTS5 Trigram, trả về kết quả ngay sau từng phím gõ.
* **Chỉ quét thư mục do người dùng chọn (Explicit Scope):** Không tự ý quét toàn bộ ổ cứng như Spotlight hay Windows Search, giúp tiết kiệm tối đa CPU và RAM.
* **Theo dõi thay đổi thời gian thực (Realtime File Watcher):** Tự động phát hiện tệp mới tạo, đổi tên hoặc xóa trong các thư mục theo dõi bằng engine `notify`.
* **Thao tác nhanh trên kết quả:** Mở tệp trực tiếp (`Enter`), định vị trong Finder / Explorer (`Reveal in Folder`), hoặc sao chép đường dẫn (`Copy Path`).
* **Menu Bar Popover & Global Shortcut:** Hỗ trợ phím tắt toàn cục mở nhanh bảng tìm kiếm nhỏ gọn từ thanh trạng thái hệ thống.
* **Tự động cập nhật trực tiếp (Auto-Update):** Tích hợp thông báo cập nhật góc dưới màn hình, tải và cài đặt phiên bản mới chỉ với 1-click.

---

## 2. Tải xuống & Cài đặt

Tải bản phát hành mới nhất dành cho hệ điều hành của bạn tại [GitHub Releases](https://github.com/linhbv94/VXSearch/releases/latest):

* **macOS (Apple Silicon & Intel):** Tải tệp `.dmg` hoặc `.app.tar.gz`. Kéo ứng dụng vào thư mục `/Applications`.
* **Windows (x64):** Tải bộ cài `.msi` hoặc tệp thực thi `.exe` độc lập.

---

## 3. Cấu trúc Dự án & Ngăn xếp Công nghệ

| Thành phần | Công nghệ | Chi tiết |
|---|---|---|
| **Frontend UI** (`src/`) | React 19 + TypeScript + Vite | Giao diện tiếng Việt/Anh song ngữ, theme tối/sáng/hệ thống chuẩn VX |
| **Desktop Host** (`src_tauri/`) | [Tauri v2](https://v2.tauri.app/) (Rust) | Quản lý Tray/Menu Bar, Global Shortcuts, Native Folder Picker, IPC API |
| **Search Engine** (`crates/search_core/`) | Rust Native Core | SQLite WAL + FTS5 trigram index, File Watcher (`notify`), Scanner (`walkdir`) |

---

## 4. Hướng dẫn Phát triển & Biên dịch

### Yêu cầu môi trường
* Node.js ≥ 20.x và npm
* Rust & Cargo ≥ 1.80
* macOS: Xcode Command Line Tools (SDK 27.0 baseline, macOS 14.0+) / Windows: C++ Build Tools

### Các lệnh phát triển
```bash
# Cài đặt thư viện frontend
npm install

# Chạy kiểm thử lõi Rust
npm run test:core

# Chạy kiểm thử giao diện
npm run test:ui

# Kiểm tra mã nguồn Rust
cargo check --manifest-path src_tauri/Cargo.toml

# Khởi chạy chế độ dev
npm run tauri dev

# Biên dịch gói ứng dụng hoàn chỉnh (.app / .msi)
npm run build
npm run tauri build -- --bundles app
```

---

## 5. Tài liệu Đặc tả Kỹ thuật (Specification Suite)

Toàn bộ hệ thống kỹ thuật của VXSearch được đặc tả chi tiết tại:
* [07_implementation_contract.md](docs/spec/07_implementation_contract.md) — Hợp đồng triển khai chuẩn hiện hành.
* [VXSearch_Scope_v1.0.md](VXSearch_Scope_v1.0.md) — Tài liệu phạm vi sản phẩm v1.0.
* [05_qa_acceptance.md](docs/spec/05_qa_acceptance.md) — Tiêu chuẩn kiểm thử & nghiệm thu QA.

---

## 6. Giấy phép & Bản quyền (License)

Dự án được phân phối dưới giấy phép mã nguồn mở **MIT License**.  
Xem toàn văn giấy phép tại tệp [LICENSE](LICENSE).

Bản quyền © 2026 Viet Linh Bui. Đã đăng ký toàn bộ quyền.
