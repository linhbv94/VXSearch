mod native_chrome;
mod popup_geometry;
mod quick_search;
mod search_mailbox;

use search_core::{
    AddRootResponse, AppError, AppSettings, Engine, MergeResponse, RemoveResponse, SearchParams,
    SearchResponse, Success, VacuumResponse, WatchedRootItem,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

struct DesktopState {
    engine: Engine,
    close_to_tray: AtomicBool,
    hotkey_error: Mutex<Option<String>>,
    active_hotkey: Mutex<Option<String>>,
    settings_lock: tokio::sync::Mutex<()>,
    search_mailbox: Mutex<search_mailbox::SearchMailbox>,
    popup_open_on_press: AtomicBool,
}
fn shell_error(code: &str, message: impl ToString) -> AppError {
    AppError {
        code: code.into(),
        message: message.to_string(),
        details: None,
    }
}
fn success() -> Value {
    json!({"success":true})
}
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| shell_error("E_INTERNAL", e))?
}

#[tauri::command]
async fn get_system_status(state: State<'_, DesktopState>) -> Result<Value, AppError> {
    let engine = state.engine.clone();
    let mut status = serde_json::to_value(blocking(move || engine.system_status()).await?)
        .map_err(|e| shell_error("E_INTERNAL", e))?;
    status["app_version"] = json!(env!("CARGO_PKG_VERSION"));
    status["hotkey_error"] = json!(*state.hotkey_error.lock().unwrap_or_else(|e| e.into_inner()));
    Ok(status)
}
#[tauri::command]
async fn get_watched_roots(
    state: State<'_, DesktopState>,
) -> Result<Vec<WatchedRootItem>, AppError> {
    let e = state.engine.clone();
    blocking(move || e.list_roots()).await
}
#[tauri::command]
async fn search_files(
    state: State<'_, DesktopState>,
    params: SearchParams,
) -> Result<SearchResponse, AppError> {
    let e = state.engine.clone();
    blocking(move || e.search(params)).await
}
#[tauri::command]
async fn pick_folder() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title("Chọn thư mục để VXSearch theo dõi")
        .pick_folder()
        .await
        .map(|f| f.path().to_string_lossy().into_owned())
}
#[tauri::command]
async fn add_watched_root(
    state: State<'_, DesktopState>,
    path: String,
) -> Result<AddRootResponse, AppError> {
    let e = state.engine.clone();
    blocking(move || e.add_root(&path)).await
}
#[tauri::command]
async fn confirm_merge_roots(
    state: State<'_, DesktopState>,
    parent_path: String,
    covered_root_ids: Vec<i64>,
) -> Result<MergeResponse, AppError> {
    let e = state.engine.clone();
    blocking(move || e.confirm_merge(&parent_path, covered_root_ids)).await
}
#[tauri::command]
async fn relink_watched_root(
    state: State<'_, DesktopState>,
    root_id: i64,
    new_path: String,
) -> Result<Success, AppError> {
    let e = state.engine.clone();
    blocking(move || e.relink_root(root_id, &new_path)).await
}
#[tauri::command]
async fn remove_watched_root(
    state: State<'_, DesktopState>,
    root_id: i64,
) -> Result<RemoveResponse, AppError> {
    let e = state.engine.clone();
    blocking(move || e.remove_root(root_id)).await
}
#[tauri::command]
async fn refresh_watched_root(
    state: State<'_, DesktopState>,
    root_id: i64,
) -> Result<Success, AppError> {
    let e = state.engine.clone();
    blocking(move || e.refresh_root(root_id)).await
}
#[tauri::command]
async fn open_file(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<Value, AppError> {
    let e = state.engine.clone();
    blocking(move || {
        let path = e.validate_action(&path)?;
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|e| shell_error("E_OPEN", e))?;
        Ok(success())
    })
    .await
}
#[tauri::command]
async fn reveal_file(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<Value, AppError> {
    let e = state.engine.clone();
    blocking(move || {
        let path = e.validate_action(&path)?;
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(|e| shell_error("E_REVEAL", e))?;
        Ok(success())
    })
    .await
}
#[tauri::command]
async fn copy_file_path(state: State<'_, DesktopState>, path: String) -> Result<Value, AppError> {
    let e = state.engine.clone();
    blocking(move || {
        // Copy is useful even for an offline result; nevertheless require an indexed path.
        let exists = e.contains_indexed_path(&path)?;
        if !exists {
            return Err(shell_error(
                "E_NOT_INDEXED",
                "Đường dẫn không thuộc chỉ mục hiện tại.",
            ));
        }
        arboard::Clipboard::new()
            .and_then(|mut c| c.set_text(path))
            .map_err(|e| shell_error("E_CLIPBOARD", e))?;
        Ok(success())
    })
    .await
}
#[tauri::command]
async fn get_settings(state: State<'_, DesktopState>) -> Result<AppSettings, AppError> {
    let e = state.engine.clone();
    let mut settings = blocking(move || e.get_settings()).await?;
    if let Some(active) = state
        .active_hotkey
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        settings.global_hotkey = active.clone();
    }
    Ok(settings)
}
fn set_dock_mode(app: &tauri::AppHandle, main_visible: bool) {
    #[cfg(target_os = "macos")]
    if let Err(error) = app.set_activation_policy(if main_visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    }) {
        eprintln!("VXSearch activation policy: {error}");
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, main_visible);
}
fn hide_main(app: &tauri::AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| shell_error("E_WINDOW", e))?;
    }
    set_dock_mode(app, false);
    Ok(())
}
fn show_window(app: &tauri::AppHandle) {
    let _ = quick_search::hide(app);
    set_dock_mode(app, true);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("search_focus", ());
    }
}
fn reopen_surface(app: &tauri::AppHandle) {
    if let Some(popup) = app.get_webview_window("quick_search") {
        if popup.is_visible().unwrap_or(false) {
            let _ = popup.set_focus();
            return;
        }
    }
    show_window(app);
}
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) && win.is_focused().unwrap_or(false) {
            let _ = hide_main(app);
        } else {
            show_window(app);
        }
    }
}
fn register_shortcut(app: &tauri::AppHandle, text: &str) -> Result<(), AppError> {
    let shortcut: Shortcut = text
        .parse()
        .map_err(|e| shell_error("E_INVALID_HOTKEY", e))?;
    // A bare letter would steal normal typing globally. Require a modifier.
    if !text.contains('+') {
        return Err(shell_error(
            "E_INVALID_HOTKEY",
            "Phím tắt cần ít nhất một phím bổ trợ.",
        ));
    }
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_window(app);
            }
        })
        .map_err(|e| shell_error("E_HOTKEY_OCCUPIED", e))
}
async fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    settings: AppSettings,
) -> Result<Value, AppError> {
    let _guard = state.settings_lock.lock().await;
    let active = state
        .active_hotkey
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    // Validate before touching native registration; the core also validates persistence.
    if !(100..=2000).contains(&settings.debounce_ms)
        || !["dark", "light", "system"].contains(&settings.theme.as_str())
    {
        return Err(shell_error("E_SETTINGS", "Cấu hình không hợp lệ."));
    }
    let changed = active.as_deref() != Some(settings.global_hotkey.as_str());
    let close_to_tray = settings.close_to_tray;
    if changed {
        register_shortcut(&app, &settings.global_hotkey)?;
    }
    let e = state.engine.clone();
    let next = settings.clone();
    if let Err(err) = blocking(move || e.update_settings(next)).await {
        if changed {
            let _ = app
                .global_shortcut()
                .unregister(settings.global_hotkey.as_str());
        }
        return Err(err);
    }
    if changed {
        if let Some(old) = active {
            let _ = app.global_shortcut().unregister(old.as_str());
        }
        *state
            .active_hotkey
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(settings.global_hotkey.clone());
    }
    state.close_to_tray.store(close_to_tray, Ordering::Relaxed);
    if changed {
        *state.hotkey_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    Ok(success())
}
#[tauri::command]
async fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    settings: AppSettings,
) -> Result<Value, AppError> {
    save_settings(app, state, settings).await
}
#[tauri::command]
async fn reset_settings(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
) -> Result<AppSettings, AppError> {
    let defaults = AppSettings::default();
    save_settings(app, state, defaults.clone()).await?;
    Ok(defaults)
}
#[tauri::command]
async fn vacuum_database(state: State<'_, DesktopState>) -> Result<VacuumResponse, AppError> {
    let e = state.engine.clone();
    blocking(move || e.vacuum()).await
}
#[tauri::command]
fn hide_window(window: tauri::WebviewWindow) -> Result<Value, AppError> {
    if window.label() == "main" {
        hide_main(window.app_handle())?;
    } else {
        window.hide().map_err(|e| shell_error("E_WINDOW", e))?;
    }
    Ok(success())
}
#[tauri::command]
fn submit_quick_search(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    query: String,
) -> Result<Value, AppError> {
    if window.label() != "quick_search" {
        return Err(shell_error("E_WINDOW", "Lệnh chỉ dành cho tìm nhanh."));
    }
    let request = state
        .search_mailbox
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .submit(query)?;
    show_window(window.app_handle());
    // The mailbox survives a missed event while the main frontend is starting.
    let _ = window
        .app_handle()
        .emit_to("main", "quick_search_requested", request);
    Ok(success())
}
#[tauri::command]
fn get_pending_search(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<Option<search_mailbox::PendingSearch>, AppError> {
    if window.label() != "main" {
        return Err(shell_error("E_WINDOW", "Lệnh chỉ dành cho cửa sổ chính."));
    }
    Ok(state
        .search_mailbox
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .pending())
}
#[tauri::command]
fn ack_pending_search(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    id: u64,
) -> Result<Value, AppError> {
    if window.label() != "main" {
        return Err(shell_error("E_WINDOW", "Lệnh chỉ dành cho cửa sổ chính."));
    }
    state
        .search_mailbox
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .acknowledge(id);
    Ok(success())
}
#[tauri::command]
fn hide_quick_search(window: tauri::WebviewWindow) -> Result<Value, AppError> {
    if window.label() != "quick_search" {
        return Err(shell_error("E_WINDOW", "Lệnh chỉ dành cho tìm nhanh."));
    }
    quick_search::hide(window.app_handle())?;
    Ok(success())
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
fn open_project_url(app: tauri::AppHandle) -> Result<Value, AppError> {
    app.opener()
        .open_url("https://github.com/linhbv94/VXSearch", None::<&str>)
        .map_err(|e| shell_error("E_OPEN", e))?;
    Ok(success())
}

fn tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::MenuBuilder;
    let menu = MenuBuilder::new(app)
        .text("show", "Mở VXSearch")
        .text("folders", "Thư mục theo dõi…")
        .text("settings", "Cài đặt…")
        .separator()
        .text("quit", "Thoát VXSearch")
        .build()?;
    let mut builder = tauri::tray::TrayIconBuilder::with_id("vxsearch")
        .tooltip("VXSearch — Tìm tệp trong thư mục đã chọn")
        .menu(&menu)
        .show_menu_on_left_click(false);
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray.png"
            ))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "folders" | "settings" => {
                show_window(app);
                let _ = app.emit("open_panel", event.id.as_ref());
            }
            _ => show_window(app),
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state,
                rect,
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(state) = app.try_state::<DesktopState>() {
                    match button_state {
                        tauri::tray::MouseButtonState::Down => {
                            state.popup_open_on_press.store(
                                app.get_webview_window("quick_search")
                                    .and_then(|w| w.is_visible().ok())
                                    .unwrap_or(false),
                                Ordering::Relaxed,
                            );
                        }
                        tauri::tray::MouseButtonState::Up => {
                            let result = if state.popup_open_on_press.swap(false, Ordering::Relaxed)
                            {
                                quick_search::hide(app)
                            } else {
                                quick_search::toggle(app, rect, position)
                            };
                            if let Err(e) = result {
                                eprintln!("VXSearch quick search: {}", e.message);
                            }
                        }
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            reopen_surface(app)
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let handle = app.handle().clone();
            let engine = Engine::open_with_events(
                dir.join("vxsearch.db"),
                Arc::new(move |event| {
                    let _ = handle.emit(&event.name, event.payload);
                }),
            )
            .map_err(|e| std::io::Error::other(e.message))?;
            let mut settings = engine
                .get_settings()
                .map_err(|e| std::io::Error::other(e.message))?;
            let close_to_tray = settings.close_to_tray;
            let mut active_hotkey = Some(settings.global_hotkey.clone());
            let mut hotkey_error = None;
            if let Err(err) = register_shortcut(app.handle(), &settings.global_hotkey) {
                match register_shortcut(app.handle(), "Ctrl+Alt+F") {
                    Ok(()) => {
                        settings.global_hotkey = "Ctrl+Alt+F".into();
                        active_hotkey = Some(settings.global_hotkey.clone());
                        let background_engine = engine.clone();
                        let handle = app.handle().clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Err(e) = background_engine.update_settings(settings) {
                                if let Some(state) = handle.try_state::<DesktopState>() {
                                    *state.hotkey_error.lock().unwrap_or_else(|e| e.into_inner()) =
                                        Some(format!(
                                            "Đã dùng Ctrl+Alt+F nhưng chưa lưu được: {}",
                                            e.message
                                        ));
                                }
                            }
                            let _ = handle.emit("settings_changed", ());
                        });
                        hotkey_error = Some(format!("{} Đã dùng Ctrl+Alt+F.", err.message));
                    }
                    Err(fallback) => {
                        active_hotkey = None;
                        hotkey_error = Some(format!(
                            "Không đăng ký được phím tắt: {}; {}. Mở bằng tray/menu bar.",
                            err.message, fallback.message
                        ));
                    }
                }
            }
            app.manage(DesktopState {
                engine,
                close_to_tray: AtomicBool::new(close_to_tray),
                hotkey_error: Mutex::new(hotkey_error),
                active_hotkey: Mutex::new(active_hotkey),
                settings_lock: tokio::sync::Mutex::new(()),
                search_mailbox: Mutex::new(search_mailbox::SearchMailbox::default()),
                popup_open_on_press: AtomicBool::new(false),
            });
            tray(app)?;
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                native_chrome::sync_mac_traffic_lights(&win);
            }
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                win.set_decorations(false)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "quick_search" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    tauri::WindowEvent::Focused(false) => {
                        let _ = window.hide();
                    }
                    _ => {}
                }
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .app_handle()
                    .try_state::<DesktopState>()
                    .map(|s| s.close_to_tray.load(Ordering::Relaxed))
                    .unwrap_or(true);
                if close_to_tray {
                    api.prevent_close();
                    let _ = hide_main(window.app_handle());
                } else {
                    window.app_handle().exit(0);
                }
            }
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                let _ = window.emit("search_focus", ());
            }
            #[cfg(target_os = "macos")]
            if matches!(
                event,
                tauri::WindowEvent::Focused(true)
                    | tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                if let Some(win) = window.app_handle().get_webview_window("main") {
                    native_chrome::sync_mac_traffic_lights(&win);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_watched_roots,
            search_files,
            pick_folder,
            add_watched_root,
            confirm_merge_roots,
            relink_watched_root,
            remove_watched_root,
            refresh_watched_root,
            open_file,
            reveal_file,
            copy_file_path,
            get_settings,
            update_settings,
            reset_settings,
            vacuum_database,
            hide_window,
            submit_quick_search,
            get_pending_search,
            ack_pending_search,
            hide_quick_search,
            quit_app,
            open_project_url
        ])
        .build(tauri::generate_context!())
        .expect("Không thể khởi động VXSearch");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = app.try_state::<DesktopState>() {
                state.engine.shutdown();
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            reopen_surface(app);
        }
        let _ = (app, event);
    });
}
