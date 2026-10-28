# VXSearch1.0.0 — Final QA và release

**Hoàn tất:** [Public1.0.0](https://github.com/linhbv94/VXSearch/releases/tag/v1.0.0), CI3target và updater E2E MacSilicon đạt. Windows/IntelGUI chưa kiểm.

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

Run40683342634:4shell+2coreunit+10integration đạt;2integration fail do tênASCIIquote bị Windowscấm và queryUnixseparator. Sửa fixture theoOS, giữ engine nguyên, giữ đầy đủ assertion literal/count/pathwatcher và không tăngtimeout. Mac18tests rerun đạt. Candidate79dea98 chưa public; MacSilicon kịp upload3partialassets trong lúc cancel. Gate0assets đã chặn thay draft; thay vì xóa, giữ cả draft/assets và source tại refqa_failed_1_0_0_79dea98 để audit, rồi thay candidate v1.0.0 chưapháthành bằng commitfix. Không sửa tag/bản đã public. Coordinatorcũ bịgatecancel dừng trướcpublish.

## Performance QA bổ sung theo user

[Report](release_1_0_0_performance.md): core release10k/50k/100k index0,80/4,70/10,32s, corepeakRSS33–40MB. NativeUI50k:50rows/trang; timeline50ms xác nhận Settings mở được trong RECONCILING. HostRSS103MB chưagồmWebKit; queryrộng ở100k20–64ms, nên khôngđạt/khôngclaim toànapp<80MB hoặc mọiquery<10ms. Không sửa engine trong lượtđo, không làm benchmarkdebug rồi claimrelease;500k/Windows/Intelperformancechưađo. Gatecoordinator yêu cầu hoàn tấtphần này trướcpublish.

## Kết quả phát hành cuối

- PR1 merged. Tag1.0.0 cuối tại644c744479bdcb1ba67965a4903dd0b97a132b5f. Build40685030065 và publish40688519923 success; layout6assets, manifeststable và mọiasset publicHTTP200 khôngtoken.
- Mỗi gói updater và toàn bộalias qua xác minh Minisign thật, mộtbyte sửa bịtừchối. HaiMac đúngarch/SDK27/ID/version/icon/codesignstrict; haiDMG checksumvalid và hostbyteexacttar. WindowsNSISx64 cóversion/icon7payloads vàCommonControls6manifestđúng.
- Native updater **QA0.9.9→public1.0.0** tựcheckstartup thấybảnmới (khôngbấmcheck), useractionCậpnhật→download/install→automaticrelaunch PID52376→52413, UI1.0.0/current vàmanualcheckcurrent. Binary sauupdatebyteexactCI. BaselineQAkhôngphảireleasepubliccũ; khôngclaim1.0.0→bảnpublickếtiếpđãtest.
- 50.053records giữ nguyênID/root/path/name/type/size/mtime/flags/searchtext (hashfullrecords),2root/cấuhình khôngđổi. SQLiteintegrityok; FTS5integritycheck trên bảncopyok. 50.003nguồnsynthetic byte/mtime/hashnguyênvẹn. Không thayApplications/khôngcấpquyềnhệthống.
- [Updaterproof](release_1_0_0_updater_evidence.json), [fullreleaseevidence](release_1_0_0_evidence.json), [performance](release_1_0_0_performance.md). Windows/IntelGUI vàupdater E2E chưa kiểm; CPUidle/storm/500k/USB/sleep/mixedmonitor chưa benchmark. Không bỏqua hoặcđổi thànhPASS.

## Dọn QA và việc còn lại

Đã gỡ cả hai rootfixture bằngUI,0root/0entry, giữsettings vàquitappQA. UIThu gọnchỉ mục hoạtđộng nhưng saugỡ50k vẫn còn12,16MBFTSsegments; ghiP1tốiưuFTSoptimize trướcVACUUM cho đợtsau, chưa sửa production trong lượt này. Cleanup riêng lượtQA đã optimize+VACUUM trênDB trống/appđãthoát, cóbackup vàtrialcopy proof, còn61.440bytes; không thaysettings. Hai thưmụcsynthetic đãxóasau khi byte/mtimeproofđạt vàgỡassociation. Applicationsngười dùng khôngthay. Khóa updater riêng giữ localignored/Secrets; hướngdẫnbackup trongrunbook. LượtQA/publishđóng; taskUI macOShoãn củauser giữ nguyên.
