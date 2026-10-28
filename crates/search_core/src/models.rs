use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<Value>,
}
impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }
    pub(crate) fn details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for AppError {}
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::new("E_DATABASE", e.to_string())
    }
}
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedRootItem {
    pub id: i64,
    pub path: String,
    pub alias: Option<String>,
    pub status: String,
    pub total_files: i64,
    pub total_size_bytes: i64,
    pub is_removable: bool,
    pub last_scan_at: Option<i64>,
    pub error_message: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub id: i64,
    pub root_id: i64,
    pub path: String,
    pub parent_dir: String,
    pub name: String,
    pub extension: String,
    pub file_type: String,
    pub size_bytes: i64,
    pub modified_at: i64,
    pub is_directory: bool,
    pub is_offline: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SearchParams {
    pub query: String,
    pub filter_type: String,
    pub root_id: Option<i64>,
    pub sort_by: String,
    pub limit: usize,
    pub offset: usize,
}
impl Default for SearchParams {
    fn default() -> Self {
        Self {
            query: String::new(),
            filter_type: "all".into(),
            root_id: None,
            sort_by: "relevance".into(),
            limit: 50,
            offset: 0,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub items: Vec<SearchResultItem>,
    pub total_matched: usize,
    pub took_ms: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub total_roots: i64,
    pub total_files: i64,
    pub total_size_bytes: i64,
    pub db_size_bytes: u64,
    pub is_any_scanning: bool,
    pub platform: String,
    pub app_version: String,
    pub hotkey_error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct AppSettings {
    pub global_hotkey: String,
    pub close_to_tray: bool,
    pub auto_select_input: bool,
    pub debounce_ms: u64,
    pub theme: String,
}
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            global_hotkey: if cfg!(target_os = "macos") {
                "CommandOrControl+Shift+F"
            } else {
                "Alt+Shift+F"
            }
            .into(),
            close_to_tray: true,
            auto_select_input: true,
            debounce_ms: 300,
            theme: "dark".into(),
        }
    }
}
impl AppSettings {
    pub fn validate(&self) -> Result<()> {
        if !(100..=2000).contains(&self.debounce_ms)
            || !["dark", "light", "system"].contains(&self.theme.as_str())
            || self.global_hotkey.trim().is_empty()
            || self.global_hotkey.len() > 100
        {
            return Err(AppError::new(
                "E_INVALID_SETTINGS",
                "Cấu hình không hợp lệ.",
            ));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Success {
    pub success: bool,
}
impl Default for Success {
    fn default() -> Self {
        Self { success: true }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddRootResponse {
    pub success: bool,
    pub root_id: i64,
    pub status: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResponse {
    pub success: bool,
    pub new_root_id: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveResponse {
    pub success: bool,
    pub removed_files_count: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VacuumResponse {
    pub success: bool,
    pub db_size_before_bytes: u64,
    pub db_size_after_bytes: u64,
}
#[derive(Debug, Clone)]
pub struct CoreEvent {
    pub name: String,
    pub payload: Value,
}
pub type EventCallback = std::sync::Arc<dyn Fn(CoreEvent) + Send + Sync>;
