use crate::{popup_geometry, shell_error};
use search_core::AppError;
use tauri::{Emitter, Manager};

pub fn hide(app: &tauri::AppHandle) -> Result<(), AppError> {
    if let Some(popup) = app.get_webview_window("quick_search") {
        popup.hide().map_err(|e| shell_error("E_WINDOW", e))?;
    }
    Ok(())
}
#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn monitor_query_point() -> Result<(f64, f64), AppError> {
    use cocoa::base::{id, nil, BOOL, YES};
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::{class, msg_send, sel, sel_impl};
    // Tao's macOS monitor_from_point expects CG logical points, whereas tray
    // events contain physical pixels. Read native points without guessing scale.
    unsafe {
        let main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if main_thread != YES {
            return Err(shell_error(
                "E_WINDOW",
                "Tìm nhanh cần chạy trên luồng giao diện.",
            ));
        }
        let screens: id = msg_send![class!(NSScreen), screens];
        if screens == nil {
            return Err(shell_error("E_WINDOW", "Không tìm thấy màn hình."));
        }
        let count: usize = msg_send![screens, count];
        if count == 0 {
            return Err(shell_error("E_WINDOW", "Không tìm thấy màn hình."));
        }
        let primary: id = msg_send![screens,objectAtIndex:0usize];
        let frame: NSRect = msg_send![primary, frame];
        let point: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        Ok((point.x, frame.origin.y + frame.size.height - point.y))
    }
}
pub fn toggle(
    app: &tauri::AppHandle,
    rect: tauri::Rect,
    point: tauri::PhysicalPosition<f64>,
) -> Result<(), AppError> {
    let popup = app
        .get_webview_window("quick_search")
        .ok_or_else(|| shell_error("E_WINDOW", "Không tìm thấy cửa sổ tìm nhanh."))?;
    if popup.is_visible().unwrap_or(false) {
        return hide(app);
    }
    #[cfg(target_os = "macos")]
    let query_point = {
        let _ = point;
        monitor_query_point()?
    };
    #[cfg(not(target_os = "macos"))]
    let query_point = (point.x, point.y);
    let monitor = popup
        .monitor_from_point(query_point.0, query_point.1)
        .map_err(|e| shell_error("E_WINDOW", e))?
        .or_else(|| popup.primary_monitor().ok().flatten())
        .ok_or_else(|| shell_error("E_WINDOW", "Không tìm thấy màn hình."))?;
    let scale = monitor.scale_factor();
    let position = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    // Convert logical window size to the destination monitor's physical pixels.
    // Reusing the old monitor's outer_size would clip a 1x→2x move at the edge.
    let current_scale = popup
        .scale_factor()
        .map_err(|e| shell_error("E_WINDOW", e))?;
    let current_size = popup.inner_size().map_err(|e| shell_error("E_WINDOW", e))?;
    let popup_width = current_size.width as f64 / current_scale * scale;
    let popup_height = current_size.height as f64 / current_scale * scale;
    let work = monitor.work_area();
    let (x, y) = popup_geometry::anchored_position(
        (position.x, position.y, size.width, size.height),
        (popup_width, popup_height),
        (
            work.position.x as f64,
            work.position.y as f64,
            work.size.width as f64,
            work.size.height as f64,
        ),
        6.0 * scale,
    );
    // On macOS Tao divides PhysicalPosition by the window's *current* scale.
    // Use destination logical points so crossing 1x/2x screens keeps the anchor.
    #[cfg(target_os = "macos")]
    popup
        .set_position(tauri::LogicalPosition::new(
            x as f64 / scale,
            y as f64 / scale,
        ))
        .map_err(|e| shell_error("E_WINDOW", e))?;
    #[cfg(not(target_os = "macos"))]
    popup
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| shell_error("E_WINDOW", e))?;
    popup.show().map_err(|e| shell_error("E_WINDOW", e))?;
    popup.set_focus().map_err(|e| shell_error("E_WINDOW", e))?;
    let _ = popup.emit("quick_search_focus", ());
    Ok(())
}
