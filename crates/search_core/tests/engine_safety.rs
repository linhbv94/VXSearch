use search_core::{Engine, SearchParams};
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};
use tempfile::TempDir;
fn path(p: &Path) -> &str {
    p.to_str().unwrap()
}
fn search(engine: &Engine, q: &str) -> search_core::SearchResponse {
    engine
        .search(SearchParams {
            query: q.into(),
            limit: 200,
            ..Default::default()
        })
        .unwrap()
}
fn eventually(mut predicate: impl FnMut() -> bool) {
    let start = Instant::now();
    while !predicate() {
        assert!(
            start.elapsed() < Duration::from_secs(15),
            "condition timed out"
        );
        std::thread::sleep(Duration::from_millis(100));
    }
}
fn ready(e: &Engine, id: i64) {
    eventually(|| {
        e.list_roots()
            .unwrap()
            .iter()
            .any(|r| r.id == id && r.status == "WATCHING_ACTIVE")
    });
}
fn setup() -> (TempDir, Engine, std::path::PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    fs::create_dir(&root).unwrap();
    let root = dunce::canonicalize(&root).unwrap();
    let e = Engine::open(temp.path().join("db/index.db")).unwrap();
    (temp, e, root)
}
#[test]
fn unicode_literal_short_tokens_extension_and_pagination() {
    let (_temp, e, root) = setup();
    // ASCII quote is an invalid Windows filename; retain quote-query coverage
    // with a valid fullwidth quote there and the ASCII fixture on Unix.
    let quoted_name = if cfg!(windows) { "a＂b.md" } else { "a\"b.md" };
    for name in [
        "Báo cáo tài chính.pdf",
        "financial_report.pdf",
        "100%_draft.txt",
        quoted_name,
        "øq.txt",
        "đề_án.docx",
    ] {
        fs::write(root.join(name), b"fixture").unwrap();
    }
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    assert_eq!(search(&e, "bao cao .pdf").total_matched, 1);
    assert_eq!(search(&e, "BAO").total_matched, 1);
    assert_eq!(search(&e, "report").total_matched, 1);
    assert_eq!(search(&e, "%_").total_matched, 1);
    assert_eq!(search(&e, quoted_name).total_matched, 1);
    assert_eq!(
        search(&e, "a\"b").total_matched,
        if cfg!(windows) { 0 } else { 1 }
    );
    assert_eq!(search(&e, "øq").total_matched, 1);
    assert_eq!(search(&e, "de_an").total_matched, 1);
    assert_eq!(search(&e, "baocao").total_matched, 0);
    assert!(search(&e, "OR")
        .items
        .iter()
        .any(|r| r.name == "financial_report.pdf"));
    let first = e
        .search(SearchParams {
            limit: 2,
            ..Default::default()
        })
        .unwrap();
    let second = e
        .search(SearchParams {
            limit: 2,
            offset: 2,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(first.total_matched, 6);
    assert!(first
        .items
        .iter()
        .all(|a| second.items.iter().all(|b| a.id != b.id)));
    e.shutdown();
}
#[test]
fn live_watcher_create_modify_rename_parent_delete_and_atomic_save() {
    let (_temp, e, root) = setup();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    fs::write(root.join("fresh.txt"), b"one").unwrap();
    eventually(|| search(&e, "fresh.txt").total_matched == 1);
    fs::create_dir(root.join("old")).unwrap();
    fs::write(root.join("old/nested.md"), b"nested").unwrap();
    let old_query = Path::new("old")
        .join("nested")
        .to_string_lossy()
        .into_owned();
    let new_query = Path::new("new")
        .join("nested")
        .to_string_lossy()
        .into_owned();
    eventually(|| search(&e, &old_query).total_matched == 1);
    fs::rename(root.join("old"), root.join("new")).unwrap();
    eventually(|| {
        search(&e, &new_query).total_matched == 1 && search(&e, &old_query).total_matched == 0
    });
    fs::write(root.join("temporary.txt"), b"replacement content").unwrap();
    fs::rename(root.join("temporary.txt"), root.join("fresh.txt")).unwrap();
    eventually(|| {
        search(&e, "fresh.txt")
            .items
            .first()
            .is_some_and(|r| r.size_bytes == 19)
    });
    fs::remove_file(root.join("fresh.txt")).unwrap();
    eventually(|| search(&e, "fresh.txt").total_matched == 0);
    e.shutdown();
}
#[test]
fn restart_always_reconciles_even_within_sixty_seconds() {
    let (temp, e, root) = setup();
    fs::write(root.join("before.txt"), b"before").unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    e.shutdown();
    drop(e);
    fs::remove_file(root.join("before.txt")).unwrap();
    fs::write(root.join("after.txt"), b"after").unwrap();
    let e = Engine::open(temp.path().join("db/index.db")).unwrap();
    eventually(|| {
        search(&e, "before.txt").total_matched == 0 && search(&e, "after.txt").total_matched == 1
    });
    e.shutdown();
}
#[test]
fn nested_merge_is_explicit_revalidated_transactional_and_removal_only_changes_index() {
    let (_temp, e, root) = setup();
    let child = root.join("child");
    fs::create_dir(&child).unwrap();
    fs::write(child.join("keep.pdf"), b"preserve me").unwrap();
    let id = e.add_root(path(&child)).unwrap().root_id;
    ready(&e, id);
    let original = search(&e, "keep.pdf").items[0].id;
    assert_eq!(
        e.add_root(path(&child)).unwrap_err().code,
        "E_EXACT_DUPLICATE"
    );
    fs::create_dir(child.join("sub")).unwrap();
    assert_eq!(
        e.add_root(path(&child.join("sub"))).unwrap_err().code,
        "E_CHILD_OF_EXISTING"
    );
    let err = e.add_root(path(&root)).unwrap_err();
    assert_eq!(err.code, "E_PARENT_OF_EXISTING");
    assert_eq!(
        e.confirm_merge(path(&root), vec![id + 1]).unwrap_err().code,
        "E_MERGE_CHANGED"
    );
    let merged = e.confirm_merge(path(&root), vec![id]).unwrap();
    ready(&e, merged.new_root_id);
    assert_eq!(e.list_roots().unwrap().len(), 1);
    assert_eq!(search(&e, "keep.pdf").items[0].id, original);
    assert_eq!(search(&e, "keep.pdf").items[0].root_id, merged.new_root_id);
    e.remove_root(merged.new_root_id).unwrap();
    assert!(search(&e, "").items.is_empty());
    assert_eq!(fs::read(child.join("keep.pdf")).unwrap(), b"preserve me");
    e.shutdown();
}
#[test]
fn offline_root_and_replacement_identity_never_purge_cached_index() {
    let (_temp, e, root) = setup();
    fs::write(root.join("cached.txt"), b"cached").unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    let moved = root.with_file_name("unmounted");
    fs::rename(&root, &moved).unwrap();
    e.refresh_root(id).unwrap();
    eventually(|| e.list_roots().unwrap()[0].status == "UNAVAILABLE_OFFLINE");
    assert_eq!(search(&e, "cached").total_matched, 1);
    assert!(search(&e, "cached").items[0].is_offline);
    assert_eq!(
        e.validate_action(path(&root.join("cached.txt")))
            .unwrap_err()
            .code,
        "E_ROOT_OFFLINE"
    );
    fs::create_dir(&root).unwrap();
    fs::write(root.join("unrelated.txt"), b"other volume").unwrap();
    e.refresh_root(id).unwrap();
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(search(&e, "cached").total_matched, 1);
    assert_eq!(search(&e, "unrelated").total_matched, 0);
    fs::remove_dir_all(&root).unwrap();
    fs::rename(&moved, &root).unwrap();
    e.refresh_root(id).unwrap();
    ready(&e, id);
    assert!(!search(&e, "cached").items[0].is_offline);
    e.shutdown();
}
#[test]
fn relink_requires_explicit_selection_and_preserves_sources() {
    let (_temp, e, root) = setup();
    fs::write(root.join("move.txt"), b"move").unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    let moved = root.with_file_name("new_location");
    fs::rename(&root, &moved).unwrap();
    e.relink_root(id, path(&moved)).unwrap();
    ready(&e, id);
    assert_eq!(
        search(&e, "move.txt").items[0].path,
        path(&moved.join("move.txt"))
    );
    assert!(e.validate_action(path(&moved.join("move.txt"))).is_ok());
    e.shutdown();
}
#[cfg(unix)]
#[test]
fn incomplete_scan_never_sweeps_and_recovery_removes_stale_only_after_full_scan() {
    use std::os::unix::fs::PermissionsExt;
    let (_temp, e, root) = setup();
    let locked = root.join("locked");
    fs::create_dir(&locked).unwrap();
    fs::write(locked.join("secret.txt"), b"secret").unwrap();
    fs::write(root.join("stale.txt"), b"stale").unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    e.shutdown();
    drop(e);
    fs::remove_file(root.join("stale.txt")).unwrap();
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
    let e = Engine::open(root.parent().unwrap().join("db/index.db")).unwrap();
    eventually(|| e.list_roots().unwrap()[0].status == "ERROR_ACCESS");
    assert_eq!(search(&e, "secret.txt").total_matched, 1);
    assert_eq!(search(&e, "stale.txt").total_matched, 1);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o700)).unwrap();
    e.refresh_root(id).unwrap();
    ready(&e, id);
    assert_eq!(search(&e, "stale.txt").total_matched, 0);
    assert_eq!(search(&e, "secret.txt").total_matched, 1);
    e.shutdown();
}
#[cfg(unix)]
#[test]
fn symlink_loop_and_outside_scope_actions_are_blocked() {
    use std::os::unix::fs::symlink;
    let (temp, e, root) = setup();
    let outside = temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("private.txt"), b"private").unwrap();
    symlink(&outside, root.join("escape")).unwrap();
    symlink(&root, root.join("loop")).unwrap();
    symlink(outside.join("private.txt"), root.join("link.txt")).unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    assert_eq!(search(&e, "private.txt").total_matched, 0);
    assert_eq!(search(&e, "link.txt").total_matched, 1);
    assert_eq!(
        e.validate_action(path(&root.join("link.txt")))
            .unwrap_err()
            .code,
        "E_OUTSIDE_SCOPE"
    );
    assert_eq!(
        e.validate_action(path(&outside.join("private.txt")))
            .unwrap_err()
            .code,
        "E_NOT_INDEXED"
    );
    e.shutdown();
}
#[test]
fn sources_remain_byte_and_mtime_exact_and_settings_persist() {
    let (temp, e, root) = setup();
    let file = root.join("untouched.bin");
    let bytes: Vec<u8> = (0..=255).cycle().take(4096).collect();
    fs::write(&file, &bytes).unwrap();
    let mtime = fs::metadata(&file).unwrap().modified().unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    assert!(e.validate_action(path(&file)).is_ok());
    e.refresh_root(id).unwrap();
    ready(&e, id);
    let mut settings = e.get_settings().unwrap();
    settings.theme = "light".into();
    settings.debounce_ms = 500;
    e.update_settings(settings.clone()).unwrap();
    assert_eq!(e.get_settings().unwrap(), settings);
    e.vacuum().unwrap();
    e.remove_root(id).unwrap();
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), mtime);
    e.shutdown();
    {
        let database = rusqlite::Connection::open(temp.path().join("db/index.db")).unwrap();
        database
            .execute(
                "INSERT INTO files_fts(files_fts,rank) VALUES('integrity-check',1)",
                [],
            )
            .unwrap();
    }
    let e = Engine::open(temp.path().join("db/index.db")).unwrap();
    assert_eq!(e.get_settings().unwrap(), settings);
    assert_eq!(e.reset_settings().unwrap(), Default::default());
    e.shutdown();
}
#[test]
fn concurrent_queries_during_large_scan_and_replay_converge() {
    let (_temp, e, root) = setup();
    for i in 0..2500 {
        fs::write(root.join(format!("file_{i:05}.txt")), b"x").unwrap();
    }
    let id = e.add_root(path(&root)).unwrap().root_id;
    fs::write(root.join("during_scan.txt"), b"late").unwrap();
    let reader = e.clone();
    let reads = std::thread::spawn(move || {
        for _ in 0..10 {
            reader
                .search(SearchParams {
                    query: "file_".into(),
                    ..Default::default()
                })
                .unwrap();
        }
    });
    reads.join().unwrap();
    ready(&e, id);
    eventually(|| search(&e, "during_scan").total_matched == 1);
    assert_eq!(search(&e, "file_").total_matched, 2500);
    e.shutdown();
}

#[test]
fn database_subtree_is_excluded_and_does_not_create_self_watching_loop() {
    let temp = tempfile::tempdir().unwrap();
    let root = dunce::canonicalize(temp.path()).unwrap();
    let data = root.join("private_data");
    fs::create_dir(&data).unwrap();
    let e = Engine::open(data.join("index.db")).unwrap();
    fs::write(root.join("real.txt"), b"real").unwrap();
    assert_eq!(e.add_root(path(&data)).unwrap_err().code, "E_PRIVATE_DATA");
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    assert_eq!(search(&e, "").total_matched, 1);
    std::thread::sleep(Duration::from_millis(1000));
    assert_eq!(search(&e, "").total_matched, 1);
    assert_eq!(e.list_roots().unwrap()[0].status, "WATCHING_ACTIVE");
    e.shutdown();
}

#[test]
fn relevance_prefers_file_names_over_parent_path_matches() {
    let (_temp, e, root) = setup();
    let parent = root.join("needle");
    fs::create_dir(&parent).unwrap();
    fs::write(parent.join("aaaa.txt"), b"a").unwrap();
    fs::write(root.join("needle".to_string() + ".txt"), b"b").unwrap();
    fs::write(root.join("zneedle.txt"), b"c").unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    let results = search(&e, "needle");
    assert_eq!(results.items[0].name, "needle");
    assert_eq!(results.items[1].name, "needle.txt");
    assert_eq!(results.items[2].name, "zneedle.txt");
    assert_eq!(results.items[3].name, "aaaa.txt");
    e.shutdown();
}

#[test]
fn identity_change_during_scan_does_not_import_replacement_volume_rows() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    fs::create_dir(&root).unwrap();
    let root = dunce::canonicalize(&root).unwrap();
    for i in 0..2200 {
        fs::write(root.join(format!("cached_{i:04}.txt")), b"cached").unwrap();
    }
    let armed = Arc::new(AtomicBool::new(false));
    let gate = armed.clone();
    let scan_root = root.clone();
    let moved = root.with_file_name("old_volume");
    let callback = Arc::new(move |event: search_core::CoreEvent| {
        if event.name == "scan_progress" && gate.swap(false, Ordering::AcqRel) {
            fs::rename(&scan_root, &moved).unwrap();
            fs::create_dir(&scan_root).unwrap();
            fs::write(scan_root.join("foreign_volume.txt"), b"foreign").unwrap();
        }
    });
    let e = Engine::open_with_events(temp.path().join("db/index.db"), callback).unwrap();
    let id = e.add_root(path(&root)).unwrap().root_id;
    ready(&e, id);
    assert_eq!(search(&e, "cached_").total_matched, 2200);
    armed.store(true, Ordering::Release);
    e.refresh_root(id).unwrap();
    eventually(|| !armed.load(Ordering::Acquire));
    eventually(|| {
        e.list_roots().unwrap()[0].status == "ERROR_ACCESS"
            || e.list_roots().unwrap()[0].status == "UNAVAILABLE_OFFLINE"
    });
    assert_eq!(search(&e, "cached_").total_matched, 2200);
    assert_eq!(search(&e, "foreign_volume").total_matched, 0);
    e.shutdown();
}

#[test]
fn first_root_churn_cannot_starve_a_second_root_scan() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let (temp, e, first) = setup();
    for i in 0..2200 {
        fs::write(first.join(format!("initial_{i:04}.txt")), b"fixture").unwrap();
    }
    let second = temp.path().join("second");
    fs::create_dir(&second).unwrap();
    fs::write(second.join("second_ready.txt"), b"second").unwrap();
    let a = first.join("churn_a");
    let b = first.join("churn_b");
    fs::create_dir(&a).unwrap();
    fs::write(a.join("child.txt"), b"child").unwrap();
    let first_id = e.add_root(path(&first)).unwrap().root_id;
    let stop = Arc::new(AtomicBool::new(false));
    let worker_stop = stop.clone();
    let churn = std::thread::spawn(move || {
        while !worker_stop.load(Ordering::Acquire) {
            let _ = fs::rename(&a, &b);
            std::thread::sleep(Duration::from_millis(5));
            let _ = fs::rename(&b, &a);
            std::thread::sleep(Duration::from_millis(5));
        }
    });
    let second_id = e.add_root(path(&second)).unwrap().root_id;
    assert!(second_id > first_id);
    ready(&e, second_id);
    assert_eq!(search(&e, "second_ready").total_matched, 1);
    stop.store(true, Ordering::Release);
    churn.join().unwrap();
    e.shutdown();
}

#[cfg(unix)]
#[test]
fn crash_scan_child_helper() {
    if std::env::var_os("VXSEARCH_CRASH_CHILD").is_none() {
        return;
    }
    let database = std::path::PathBuf::from(std::env::var_os("VXSEARCH_CRASH_DB").unwrap());
    let signal = std::path::PathBuf::from(std::env::var_os("VXSEARCH_CRASH_SIGNAL").unwrap());
    let _engine = Engine::open_with_events(
        database,
        std::sync::Arc::new(move |event| {
            if event.name == "scan_progress" {
                fs::write(&signal, b"paused during staged scan").unwrap();
                // Deliberately pause before staging import/sweep. Parent kills this process.
                std::thread::sleep(Duration::from_secs(30));
            }
        }),
    )
    .unwrap();
    std::thread::sleep(Duration::from_secs(30));
    panic!("parent did not kill the crash fixture child within its bounded deadline");
}

#[cfg(unix)]
#[test]
fn sigkill_during_staged_scan_recovers_wal_and_reconciles_without_losing_baseline() {
    use std::process::{Child, Command, Stdio};
    struct KillOnDrop(Option<Child>);
    impl Drop for KillOnDrop {
        fn drop(&mut self) {
            if let Some(mut child) = self.0.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    let (temp, engine, root) = setup();
    let baseline = root.join("baseline.txt");
    fs::write(&baseline, b"baseline preserved").unwrap();
    let id = engine.add_root(path(&root)).unwrap().root_id;
    ready(&engine, id);
    engine.shutdown();
    drop(engine);
    for i in 0..2500 {
        fs::write(
            root.join(format!("after_restart_{i:04}.txt")),
            b"after restart",
        )
        .unwrap();
    }
    let database = temp.path().join("db/index.db");
    let signal = temp.path().join("child_staged_scan_ready");
    let child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "crash_scan_child_helper",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("VXSEARCH_CRASH_CHILD", "1")
        .env("VXSEARCH_CRASH_DB", &database)
        .env("VXSEARCH_CRASH_SIGNAL", &signal)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut cleanup = KillOnDrop(Some(child));
    let started = Instant::now();
    while !signal.is_file() {
        if let Some(status) = cleanup.0.as_mut().unwrap().try_wait().unwrap() {
            panic!("crash fixture child exited before staged scan: {status}");
        }
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "child did not reach staged scan before deadline"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    // Stage has at least 2,000 observations, but persistent source rows still preserve baseline.
    {
        let db = rusqlite::Connection::open(&database).unwrap();
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
    cleanup.0.as_mut().unwrap().kill().unwrap();
    let status = cleanup.0.as_mut().unwrap().wait().unwrap();
    assert!(!status.success());
    use std::os::unix::process::ExitStatusExt;
    assert_eq!(
        status.signal(),
        Some(9),
        "fixture must actually die from SIGKILL"
    );
    cleanup.0.take();
    let recovered = Engine::open(&database).unwrap();
    ready(&recovered, id);
    assert_eq!(search(&recovered, "baseline.txt").total_matched, 1);
    assert_eq!(search(&recovered, "after_restart_").total_matched, 2500);
    assert_eq!(search(&recovered, "").total_matched, 2501);
    assert_eq!(fs::read(&baseline).unwrap(), b"baseline preserved");
    recovered.shutdown();
    let db = rusqlite::Connection::open(&database).unwrap();
    let integrity: String = db
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    db.execute(
        "INSERT INTO files_fts(files_fts,rank) VALUES('integrity-check',1)",
        [],
    )
    .unwrap();
}
