# VXSearch1.0.0 — Performance QA

Ngày2026-10-28. Engine production không đổi so với candidate644c744. Mac arm64, tối ưu release,3 bộ synthetic local trên APFS, mỗi query5samples; số đo backend tính count và50kết quả đầu, không tính debounce/IPC/render. Không quét dữ liệu user.

| Fixture | Index ban đầu | PeakRSS core | DB+WAL | Queryrộng/1–2ký tự |
|---|---:|---:|---:|---:|
|10.001files+50dirs|0,80s|33,18MB|12,72MB|1,35–3,27ms|
|50.001files+50dirs|4,70s|40,08MB|52,44MB|9,72–34,92ms|
|100.001files+50dirs|10,32s|39,39MB|98,21MB|19,59–64,30ms|

Truy vấn chọn lọc `bao cao`/`.pdf` dưới0,2ms; querypath hoặc prefix ở100k có mẫu10–19ms. Đây là một lượt đo trên máy đang vận hành, cachefilesystem không được xóa để giảcoldread; không coi5samples là thống kê p99 production.

Native app đã index riêng50.000files+50dirs, hiển thị50rows/trang trên50.053entries (cộngfixture3files cũ), Settings mở được sau thao tác rescan; timelineđối chiếu riêng. HostRSS tại lúcindexđãready khoảng103MB, **chưa gồm WebKit XPC** và không phảipeaktoànapp. Do đó chưa đạt/chưa chứng minh mục tiêu toànapp<80MB. Không gộp33–40MBcore thànhRAMtoànứngdụng.

Không thấy regressioncrash/lossindex hoặc freeze kéo dài trong phạmvi smoke. Mục tiêu500k/<10ms/<80MB là mục tiêu tốiưu chưa nghiệmthu, không phải hardacceptance v1.0 đã chốt. Có thể phát hành với số đo/giới hạn rõ ràng; không ghi “mọi query<10ms” hoặc “RAMapp<80MB”. Windows/Intel performance,500k,filesystemmạng/USB chậm, CPUidle/watcherstorm vàframe-time/keyboard-to-paint chưa benchmark.

[Rawmeasurements](release_1_0_0_performance.json), [reproduciblebenchmark](../crates/search_core/examples/benchmark.rs). Lệnh: buildcorebenchmarkrelease rồi `/usr/bin/time -l .../benchmark COUNT`; chỉghi/xóaownedtempfixture. Nativefixture50k sẽ gỡ association khỏi app bằngUI; byte/mtimehash nguồn được kiểm trước/sau.

TimelineSQLite50ms xác nhận root50k vẫn RECONCILING trong lúc Settings mở và render được. Khoảng gọi click→AXthấySettings800ms **gồm cả overhead/CUAwait**, không phải inputlatency hayframe-time. Lượtđođầu scanđãxong trướcSettings; không dùnglượtđó claimđồngthời.
