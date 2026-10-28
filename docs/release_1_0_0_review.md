# VXSearch1.0.0 — Final QA và release

Ngày2026-10-28. User giao finalQA/release1.0.0, nhấn mạnh updater ổn định. Phạm vi engine Rust chung Mac/Win,3target thật. Không dùng dummy, không đọc nội dung tệp nguồn để index, không sửa/xóa nguồn. Private updater key riêng do user cho phép tạo/upload chỉ đúngrepo.

## QA độc lập

- Đọc hợp đồng07, corepaths/identity/query/staging/sweep/worker/shutdown và shell/window/mailbox. Nguồn trước đó chỉ mới pushspec; toàn bộ implementation được review/stage theo scope trước release, không giả đã có public binary.
- Core18tests (2unit+16integration): Unicode/literal/pagination, source byte+mtime, merge/remove/relink, symlinkescape, incomplete/offline/rootreplacement khôngpurge, startupreconcile, watcher create/rename/atomic, queue fairness, cancellation và crashWAL recovery. Chạy filesystem watcher thật ngoài sandbox, fixtures riêng.
- Shell4tests mailbox/ACK và popupgeometry đạt; TS/Vite đạt. UI13nhóm và popup7nhóm IPCfixture đạt, không pageerrors. Browserfixture không thay runtime Windows.
- Updater10tests: startup/StrictMode1check khôngautoinstall, offline/retry, concurrentinstall/progress, signaturefailure khôngrestart, restartfailure khôngredownload, popup/dev/browserdisabled, hooks/recovery, closehandlefailure khônggiữstaleinstall. Release7tests signatures/tamper/layout/version/exactSHA/QA/publish/CLIargs.
- Sửa2nhánherrorcontroller: xóa pendinghandle trước closeawait để handleđãlỗi khôngcòninstallđược; recovercallbacklỗi khôngche downloaderror hoặc bỏtrạngtháilỗi. Chỉ sửaupdater Search, không sửa appkhác.
- FixtureUItestdefaultURL cũ1422 khôngkhớp Vite1420; đổi default1420 rồi rerun13+7đạt. Lượt release-test đầu bị versionghi đồngthời0.1→1.0; rerun sauversionsổnđịnhđạt. Không nới assertion để bỏqua gate. Cargo fmt2wrapformatđãápdụng.

## Native QA và updater

Baseline QA0.9.9 riêng: productionupdater/codeđợtnày, chỉ versionthấp hơn; khôngpublishbaseline, khôngthayApplications. Nativepicker thêm rootfixture3files, searchbao cao→Báo cáo mẫu2026.txt đạt. Watcher/restart/updaterproof cậpnhật saukhi hoàn tất. SourcefixtureSHA/mtimeđược kiểm riêng, không dữliệucánhân. CodeTauri processplugin gọi request_restart và shellExit shutdownworker; SQLiteWAL/reconcilecrashtest riêng.

## Release gate

Repo public,standardwindows-2022/xcode-27, không cache/workflowartifacts. SDK27exact,Macadhoc cho appđọcmetadata; khôngthêmFDA/Accessibility/trust. CIserializeuploads, layout6assets; signatureverified trướcpublish, exacttagSHA và versioncao hơn stable. Notes enduser, backupkey trong desktop_release.md. Public và E2Echưa được claim trước bằngchứng.

Giới hạn: Windows/Intel nativeGUI/updater, USB/sleep/TCC/mixedmonitorvậtlý chưa kiểm. Không cam kết hiệu năng500k hoặc FDAretentiontừ appnhẹadhoc.

## Windows fixture portability — retry trước public

Run40683342634:4shell+2coreunit+10integration đạt;2integration fail do tênASCIIquote bị Windowscấm và queryUnixseparator. Sửa fixture theoOS, giữ engine nguyên, giữ đầy đủ assertion literal/count/pathwatcher và không tăngtimeout. Mac18tests rerun đạt. Candidate79dea98 chưa public và chưa có asset; CI đãcancel, giữ refqa_failed_1_0_0_79dea98 để audit, thay candidate v1.0.0 chưapháthành bằng commitfix. Không sửa tag/bản đã public. Coordinatorcũ bịgatecancel dừng trướcpublish.
