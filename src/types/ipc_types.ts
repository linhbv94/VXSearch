export type FileFilterType =
  | "all"
  | "document"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "archive"
  | "directory";

export type SortByOption =
  | "relevance"
  | "name_asc"
  | "size_desc"
  | "modified_desc";

export type ThemeMode = "dark" | "light" | "system";

export interface SystemStatus {
  total_roots: number;
  total_files: number;
  total_size_bytes: number;
  db_size_bytes: number;
  is_any_scanning: boolean;
  platform: string;
  app_version: string;
  hotkey_error: string | null;
}

export interface WatchedRoot {
  id: number;
  path: string;
  alias: string | null;
  status: string;
  total_files: number;
  total_size_bytes: number;
  is_removable: boolean;
  last_scan_at: number | null;
  error_message: string | null;
}

export interface SearchParams {
  query: string;
  filter_type: FileFilterType;
  root_id: number | null;
  sort_by: SortByOption;
  limit: number;
  offset: number;
}

export interface SearchResultItem {
  id: number;
  root_id: number;
  path: string;
  parent_dir: string;
  name: string;
  extension: string;
  file_type: string;
  size_bytes: number;
  modified_at: number;
  is_directory: boolean;
  is_offline: boolean;
}

export interface SearchResponse {
  items: SearchResultItem[];
  total_matched: number;
  took_ms: number;
}

export interface AddRootResponse {
  success: boolean;
  root_id: number;
  status: string;
}

export interface ConfirmMergeResponse {
  success: boolean;
  new_root_id: number;
}

export interface RemoveRootResponse {
  success: boolean;
  removed_files_count?: number;
}

export interface SimpleSuccessResponse {
  success: boolean;
}

export interface VacuumResponse {
  success: boolean;
  db_size_before_bytes: number;
  db_size_after_bytes: number;
}

export interface AppSettings {
  global_hotkey: string;
  close_to_tray: boolean;
  auto_select_input: boolean;
  debounce_ms: number;
  theme: ThemeMode;
}

export interface AppErrorDetails {
  covered_root_ids?: number[];
  [key: string]: unknown;
}

export interface AppError {
  code: string;
  message: string;
  details: AppErrorDetails | null;
}

export interface ScanProgressPayload {
  root_id: number;
  current_path: string;
  scanned_count: number;
}

export interface RootStatusChangedPayload {
  root_id: number;
  new_status: string;
  message?: string | null;
}

export interface ScanCompletedPayload {
  root_id: number;
  total_files: number;
  total_size_bytes: number;
  duration_ms: number;
}

export interface IndexChangedPayload {
  affected_roots: number[];
  delta_count: number;
}

export type OpenPanelTarget = "folders" | "settings";

export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}
