# 00. Tổng quan hệ thống VXSearch

> Version: 1.1.0 — Ngày cập nhật: 2026-10-28
> Hợp đồng ưu tiên: [07_implementation_contract.md](07_implementation_contract.md).

VXSearch tìm tên, đường dẫn và phần mở rộng trong những thư mục user chọn, cục bộ trên Windows/macOS. Không tìm trong nội dung, không quản lý/xóa/sửa nguồn. Không tự suy diễn tốc độ, quyền hay chất lượng của app khác để so sánh.

## Kiến trúc

```text
React UI → Tauri IPC → Rust Engine
                         ├─ SQLite reader WAL: search/status/settings
                         └─ coordinator duy nhất: metadata scan + notify + DB writer
Tauri shell: native picker, clipboard, Open/Reveal, tray, shortcut, native chrome
```

Core độc lập tại `crates/search_core`; shell `src_tauri`; frontend `src`. Rust `notify`, `walkdir`, `rusqlite` bundled SQLite/FTS5, Unicode normalization. Không server, telemetry, đặc quyền admin hoặc index nội dung.

## Quyết định và đánh đổi

FTS trigram trên text chuẩn hóa kết hợp literal verification; token ngắn fallback `instr`. Cách này cho substring và tiếng Việt không dấu nhưng query ngắn/empty có thể quét nhiều hàng; cần benchmark thực tế. Không dùng search daemon. Reader/writer riêng giữ UI truy vấn khi scanner ghi; mutation tuần tự để tránh scan/remove/merge ghi đè nhau.

Watch trước scan, queue hữu hạn và reconciliation bù sự kiện bị lỡ. Staging SQLite tránh đưa metadata của root thay identity giữa scan vào index. Scan không hoàn chỉnh giữ index cũ, có thể cập nhật những mục đã quan sát trên cùng identity nhưng không sweep. Đổi root/volume không được coi là xóa tệp.

Native identity: Mac volume UUID + inode root; Windows volume serial + file index. Identity khác yêu cầu user Định vị lại. Không follow symlink; action resolve và chặn link ra ngoài root. Mọi DB/source path phải Unicode hợp lệ, lỗi không fallback im lặng. Data directory của chính app được loại trừ.

## Giới hạn phát hành

Mục tiêu Windows x64 và macOS14+ (SDK27.0), kiến trúc Mac hiện tại được kiểm theo artifact. Không suy Windows runtime/Intel từ Mac Silicon. Không auto-update, launch-at-login, fuzzy, size/date filter hoặc preview nội dung ở P0. Các mục tiêu 500k entries, sub10ms, RAM80MB chưa là cam kết. Chỉ báo v1.0 nghiệm thu khi QA tương ứng cả hai OS có bằng chứng.

## Nguồn chuẩn

- [Scope gốc](../../VXSearch_Scope_v1.0.md).
- [Flow](02_feature_flow.md), [UI](03_ui_wireframe.md), [API](04_api_data.md), [QA](05_qa_acceptance.md).
- [Desktop UI](../../../.agents/desktop_ui_standards.md), [theme](../../../_summary/master_theme.md), [SDK](../../../_summary/macos_build_baseline.md).
