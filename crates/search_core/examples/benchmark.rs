//! Reproducible metadata/search fixture. All writes stay inside an owned temp directory.
use search_core::{Engine, SearchParams};
use serde_json::json;
use std::{
    fs,
    time::{Duration, Instant},
};
fn main() {
    let count: usize = std::env::args()
        .nth(1)
        .map(|n| n.parse().expect("count must be integer"))
        .unwrap_or(10_000)
        .clamp(1, 100_000);
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    fs::create_dir(&source).unwrap();
    let setup = Instant::now();
    for group in 0..50 {
        fs::create_dir(source.join(format!("group_{group:03}"))).unwrap();
    }
    for i in 0..count {
        let directory = source.join(format!("group_{:03}", i % 50));
        fs::write(
            directory.join(format!("file_{i:06}.rs")),
            b"metadata benchmark fixture",
        )
        .unwrap();
    }
    fs::write(source.join("Báo cáo tài chính.pdf"), b"Vietnamese fixture").unwrap();
    let setup_ms = setup.elapsed().as_secs_f64() * 1000.0;
    let engine = Engine::open(temp.path().join("private_data/index.db")).unwrap();
    let scan = Instant::now();
    let root = engine.add_root(source.to_str().unwrap()).unwrap().root_id;
    loop {
        let roots = engine.list_roots().unwrap();
        let r = roots.iter().find(|r| r.id == root).unwrap();
        if r.status == "WATCHING_ACTIVE" {
            break;
        }
        if r.status == "ERROR_ACCESS" || r.status == "UNAVAILABLE_OFFLINE" {
            panic!("indexer not ready: {r:?}");
        }
        assert!(scan.elapsed() < Duration::from_secs(120), "scan timeout");
        std::thread::sleep(Duration::from_millis(20));
    }
    let index_ms = scan.elapsed().as_secs_f64() * 1000.0;
    let mut samples = vec![];
    for query in ["", "a", "rs", "file_005", "bao cao", ".pdf", "group_025"] {
        let mut timings = vec![];
        let mut matched = 0;
        for _ in 0..5 {
            let r = engine
                .search(SearchParams {
                    query: query.into(),
                    ..Default::default()
                })
                .unwrap();
            timings.push(r.took_ms);
            matched = r.total_matched;
        }
        samples.push(json!({"query":query,"total_matched":matched,"samples_ms":timings}));
    }
    let filtered = engine
        .search(SearchParams {
            root_id: Some(root),
            ..Default::default()
        })
        .unwrap();
    let status = engine.system_status().unwrap();
    engine.shutdown();
    println!("{}",serde_json::to_string_pretty(&json!({"fixture_files":count+1,"fixture_directories":50,"indexed_entries":status.total_files,"fixture_setup_ms":setup_ms,"initial_index_ms":index_ms,"db_size_bytes":status.db_size_bytes,"search_samples":samples,"empty_root_filtered_ms":filtered.took_ms,"profile":if cfg!(debug_assertions){"debug"}else{"release"},"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"limitations":"Synthetic local fixture; search timing includes count and first 50 results. No UI/IPC/RAM/500k or other OS claim."})).unwrap());
}
