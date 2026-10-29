# Updater — đợt chuẩn hóa2026-10-29

Version: 1.0.0 — Ngày update: 2026-10-29

Đây là **chỉnh sửa sau update/release**, thuộc track riêng của vxsearch; chưa release. [Contract chung](../../_summary/standard_docs/auto_update_standards.md) và [checkpoint điều phối](../../_summary/agents_handoff/suite_engine_20261029_checkpoint.md).

- Native updater pin=2.14.1, giữ public key/endpoint/identity của app; Cargo.lock là nguồn resolved dependency. Không nâng/hạ unrelated packages để hợp thức hóa build.
- Controller contract1.0.0 vendor trong src/services (Clean: desktop/src/services), cùng hash canonical. Startup/Settings/notice cùng store; check15s/download300s; installed chỉ sau native install resolve, restart lỗi giữ installed và không tải lại. Dismiss giữ theo version trong phiên; close stale handle và recovery error không được bỏ qua.
- Trước install kiểm get_system_status.is_any_scanning và vx-before-update; core có shutdown/join worker khi thoát.
- AU-01…AU-08/AU-13…AU-15 cần đối chiếu UI của Anti và runtime; tests controller chỉ chứng minh logic state, không phải geometry/native UI. AU-09…AU-12 cần gói/signature/target/install/restart/readback thật trên từng platform phát hành. Không dùng build Mac hoặc browser để báo Windows đạt.
- Checks mới và trạng thái từng app tại [test report](../../_summary/agents_handoff/suite_tauri_update_tests_20261029.json), [native compile](../../_summary/agents_handoff/suite_updater_native_checks_20261029.json), và work_log root. Runtime/E2E sau sửa chưa nghiệm thu; không thay app trong /Applications hoặc dữ liệu production để test.
