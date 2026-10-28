import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AddRootResponse,
  AppSettings,
  ConfirmMergeResponse,
  IndexChangedPayload,
  OpenPanelTarget,
  RemoveRootResponse,
  RootStatusChangedPayload,
  ScanCompletedPayload,
  ScanProgressPayload,
  SearchParams,
  SearchResponse,
  SimpleSuccessResponse,
  SystemStatus,
  VacuumResponse,
  WatchedRoot,
} from "../types/ipc_types";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as Record<string, unknown>;
  return Boolean(win.__TAURI_INTERNALS__ || win.__TAURI__);
}

export function detectInitialPlatform(): "macos" | "windows" | "linux" {
  if (typeof navigator === "undefined") return "macos";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

export function getDefaultSettings(platform?: string): AppSettings {
  const isWin = (platform || detectInitialPlatform()).toLowerCase().includes("win");
  return {
    global_hotkey: isWin ? "Alt+Shift+F" : "Cmd+Shift+F",
    close_to_tray: true,
    auto_select_input: true,
    debounce_ms: 300,
    theme: "dark",
  };
}

export async function ipcGetSystemStatus(): Promise<SystemStatus> {
  if (!isTauriRuntime()) {
    return {
      total_roots: 0,
      total_files: 0,
      total_size_bytes: 0,
      db_size_bytes: 0,
      is_any_scanning: false,
      platform: detectInitialPlatform(),
      app_version: "0.1.0",
      hotkey_error: null,
    };
  }
  return invoke<SystemStatus>("get_system_status");
}

export async function ipcGetWatchedRoots(): Promise<WatchedRoot[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<WatchedRoot[]>("get_watched_roots");
}

export async function ipcSearchFiles(params: SearchParams): Promise<SearchResponse> {
  if (!isTauriRuntime()) {
    return {
      items: [],
      total_matched: 0,
      took_ms: 0,
    };
  }
  return invoke<SearchResponse>("search_files", { params });
}

export async function ipcPickFolder(): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<string | null>("pick_folder");
}

export async function ipcAddWatchedRoot(path: string): Promise<AddRootResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<AddRootResponse>("add_watched_root", { path });
}

export async function ipcConfirmMergeRoots(
  parentPath: string,
  coveredRootIds: number[]
): Promise<ConfirmMergeResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<ConfirmMergeResponse>("confirm_merge_roots", {
    parentPath,
    coveredRootIds,
  });
}

export async function ipcRelinkWatchedRoot(
  rootId: number,
  newPath: string
): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<SimpleSuccessResponse>("relink_watched_root", {
    rootId,
    newPath,
  });
}

export async function ipcRemoveWatchedRoot(rootId: number): Promise<RemoveRootResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<RemoveRootResponse>("remove_watched_root", { rootId });
}

export async function ipcRefreshWatchedRoot(rootId: number): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<SimpleSuccessResponse>("refresh_watched_root", { rootId });
}

export async function ipcOpenFile(path: string): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<SimpleSuccessResponse>("open_file", { path });
}

export async function ipcRevealFile(path: string): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<SimpleSuccessResponse>("reveal_file", { path });
}

export async function ipcCopyFilePath(path: string): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(path);
    }
    return { success: true };
  }
  return invoke<SimpleSuccessResponse>("copy_file_path", { path });
}

export async function ipcGetSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const saved = localStorage.getItem("vxsearch_preview_settings");
    if (saved) {
      try {
        return { ...getDefaultSettings(), ...JSON.parse(saved) };
      } catch {
        // Fallback default
      }
    }
    return getDefaultSettings();
  }
  return invoke<AppSettings>("get_settings");
}

export async function ipcResetSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const defaults = getDefaultSettings();
    localStorage.setItem("vxsearch_preview_settings", JSON.stringify(defaults));
    return defaults;
  }
  return invoke<AppSettings>("reset_settings");
}

export async function ipcUpdateSettings(settings: AppSettings): Promise<SimpleSuccessResponse> {
  if (!isTauriRuntime()) {
    localStorage.setItem("vxsearch_preview_settings", JSON.stringify(settings));
    return { success: true };
  }
  return invoke<SimpleSuccessResponse>("update_settings", { settings });
}

export async function ipcVacuumDatabase(): Promise<VacuumResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mở bản desktop để chọn thư mục và tìm tệp.");
  }
  return invoke<VacuumResponse>("vacuum_database");
}

export async function ipcHideWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("hide_window");
  } catch {
    try {
      await getCurrentWindow().hide();
    } catch {
      // Ignore
    }
  }
}

export async function ipcQuitApp(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("quit_app");
  } catch {
    try {
      await getCurrentWindow().close();
    } catch {
      // Ignore
    }
  }
}

export async function ipcOpenProjectUrl(): Promise<void> {
  const repoUrl = "https://github.com/linhbv94/VXSearch";
  if (!isTauriRuntime()) {
    window.open(repoUrl, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    await invoke("open_project_url");
  } catch {
    window.open(repoUrl, "_blank", "noopener,noreferrer");
  }
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // Ignore drag errors
  }
}

export async function minimizeAppWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Ignore
  }
}

export async function toggleMaximizeAppWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await getCurrentWindow().toggleMaximize();
  } catch {
    // Ignore
  }
}

export async function closeOrHideAppWindow(closeToTray: boolean): Promise<void> {
  if (closeToTray) {
    await ipcHideWindow();
  } else {
    await ipcQuitApp();
  }
}

export interface NativeEventHandlers {
  onIndexChanged?: (payload: IndexChangedPayload) => void;
  onRootStatusChanged?: (payload: RootStatusChangedPayload) => void;
  onScanCompleted?: (payload: ScanCompletedPayload) => void;
  onScanProgress?: (payload: ScanProgressPayload) => void;
  onSearchFocus?: () => void;
  onOpenPanel?: (panel: OpenPanelTarget) => void;
  onSettingsChanged?: () => void;
}

export function subscribeNativeEvents(handlers: NativeEventHandlers): () => void {
  if (!isTauriRuntime()) {
    return () => {};
  }

  let disposed = false;
  const activeUnlisteners: UnlistenFn[] = [];

  const registerListener = <T>(
    eventName: string,
    callback: (payload: T) => void
  ) => {
    void listen<T>(eventName, (event) => {
      if (!disposed) {
        callback(event.payload);
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        activeUnlisteners.push(unlisten);
      }
    });
  };

  if (handlers.onIndexChanged) {
    registerListener<IndexChangedPayload>("index_changed", (payload) => {
      handlers.onIndexChanged?.(payload);
    });
  }

  if (handlers.onRootStatusChanged) {
    registerListener<RootStatusChangedPayload>("root_status_changed", (payload) => {
      handlers.onRootStatusChanged?.(payload);
    });
  }

  if (handlers.onScanCompleted) {
    registerListener<ScanCompletedPayload>("scan_completed", (payload) => {
      handlers.onScanCompleted?.(payload);
    });
  }

  if (handlers.onScanProgress) {
    registerListener<ScanProgressPayload>("scan_progress", (payload) => {
      handlers.onScanProgress?.(payload);
    });
  }

  if (handlers.onSearchFocus) {
    registerListener<unknown>("search_focus", () => {
      handlers.onSearchFocus?.();
    });
  }

  if (handlers.onOpenPanel) {
    registerListener<unknown>("open_panel", (payload) => {
      let target: OpenPanelTarget | null = null;
      if (payload === "folders" || payload === "settings") {
        target = payload;
      } else if (payload && typeof payload === "object") {
        const obj = payload as Record<string, unknown>;
        if (obj.panel === "folders" || obj.panel === "settings") {
          target = obj.panel;
        }
      }
      if (target) {
        handlers.onOpenPanel?.(target);
      }
    });
  }

  if (handlers.onSettingsChanged) {
    registerListener<unknown>("settings_changed", () => {
      handlers.onSettingsChanged?.();
    });
  }

  return () => {
    disposed = true;
    while (activeUnlisteners.length > 0) {
      const fn = activeUnlisteners.pop();
      fn?.();
    }
  };
}
