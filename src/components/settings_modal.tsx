import {AppUpdates} from './app_updates';
import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Coffee,
  Database,
  ExternalLink,
  Info,
  Keyboard,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AppSettings,
  SystemStatus,
  ThemeMode,
  ToastType,
} from "../types/ipc_types";
import {
  ipcOpenProjectUrl,
  ipcResetSettings,
  ipcUpdateSettings,
  ipcVacuumDatabase,
  startWindowDrag,
} from "../services/tauri_ipc";
import { formatBytes, formatNumber, parseAppError } from "../utils/formatters";

export type SettingsTabId =
  | "general"
  | "shortcuts"
  | "cache"
  | "updates"
  | "about"
  | "support";

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTabId;
  settings: AppSettings;
  systemStatus: SystemStatus;
  onClose: () => void;
  onSettingsUpdated: (next: AppSettings) => void;
  onRefreshSystemStatus: () => Promise<void>;
  onNotify: (type: ToastType, message: string) => void;
}

const MODIFIER_CODES = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

function mapKeyCodeToHotkeyToken(code: string): string | null {
  if (MODIFIER_CODES.has(code)) {
    return "MODIFIER_ONLY";
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }
  const specialMap: Record<string, string> = {
    Space: "Space",
    Equal: "Equal",
    NumpadAdd: "NumpadAdd",
    Minus: "Minus",
    NumpadSubtract: "NumpadSubtract",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    NumpadEnter: "NumpadEnter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Backquote: "Backquote",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
  };
  return specialMap[code] || null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = "general",
  settings,
  systemStatus,
  onClose,
  onSettingsUpdated,
  onRefreshSystemStatus,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [localHotkeyError, setLocalHotkeyError] = useState<string | null>(null);
  const [draftDebounceMs, setDraftDebounceMs] = useState<number>(settings.debounce_ms);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [lastVacuumInfo, setLastVacuumInfo] = useState<{
    before: number;
    after: number;
  } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [aboutIconError, setAboutIconError] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setDraftDebounceMs(settings.debounce_ms);
  }, [settings.debounce_ms]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setLocalHotkeyError(null);
    setIsRecordingHotkey(false);

    const timer = window.setTimeout(() => {
      const firstBtn = dialogRef.current?.querySelector<HTMLElement>(
        "button.vx-sidebar-tab.is-active, button:not(:disabled)"
      );
      firstBtn?.focus();
    }, 10);

    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();

        if (isRecordingHotkey) {
          setIsRecordingHotkey(false);
          return;
        }
        if (isSaving || isVacuuming) {
          return;
        }
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current && !isRecordingHotkey) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !dialogRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || active === last || !dialogRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, isRecordingHotkey, isSaving, isVacuuming, onClose]);

  if (!isOpen) return null;

  const isMac = !systemStatus.platform.toLowerCase().includes("win");

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".no-drag")) return;
    if (e.button === 0) {
      void startWindowDrag();
    }
  };

  const persistFullSettings = async (
    next: AppSettings,
    options?: { successMsg?: string; isHotkeyChange?: boolean }
  ): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    if (options?.isHotkeyChange) {
      setLocalHotkeyError(null);
    }
    try {
      await ipcUpdateSettings(next);
      onSettingsUpdated(next);
      await onRefreshSystemStatus();
      if (options?.successMsg) {
        onNotify("success", options.successMsg);
      }
      return true;
    } catch (err) {
      const appErr = parseAppError(err);
      setDraftDebounceMs(settings.debounce_ms);
      if (options?.isHotkeyChange) {
        setLocalHotkeyError(appErr.message);
      }
      onNotify("error", appErr.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const commitDraftDebounce = () => {
    if (isSaving || draftDebounceMs === settings.debounce_ms) return;
    void persistFullSettings({
      ...settings,
      debounce_ms: draftDebounceMs,
    });
  };

  const handleResetDefaults = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setLocalHotkeyError(null);
    try {
      const defaults = await ipcResetSettings();
      onSettingsUpdated(defaults);
      setDraftDebounceMs(defaults.debounce_ms);
      await onRefreshSystemStatus();
      onNotify("success", "Đã khôi phục cài đặt mặc định.");
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleHotkeyRecordKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isRecordingHotkey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecordingHotkey(false);
      return;
    }

    const token = mapKeyCodeToHotkeyToken(e.code);
    if (token === "MODIFIER_ONLY") {
      return;
    }
    if (!token) {
      onNotify(
        "warning",
        "Phím này không hỗ trợ làm phím tắt toàn cục. Hãy chọn chữ cái, chữ số, F1–F24, Space hoặc mũi tên."
      );
      return;
    }

    const parts: string[] = [];
    if (e.metaKey) parts.push(isMac ? "Command" : "Super");
    if (e.ctrlKey) parts.push("Control");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    if (parts.length === 0) {
      onNotify(
        "warning",
        "Tổ hợp phím cần có ít nhất 1 phím bổ trợ (Command/Super, Control, Alt hoặc Shift)."
      );
      return;
    }

    parts.push(token);
    const combo = parts.join("+");
    setIsRecordingHotkey(false);
    void persistFullSettings(
      {
        ...settings,
        global_hotkey: combo,
      },
      {
        successMsg: `Đã cập nhật phím tắt toàn cục: ${combo}`,
        isHotkeyChange: true,
      }
    );
  };

  const handleVacuum = async () => {
    if (isVacuuming || isSaving) return;
    setIsVacuuming(true);
    try {
      const res = await ipcVacuumDatabase();
      setLastVacuumInfo({
        before: res.db_size_before_bytes,
        after: res.db_size_after_bytes,
      });
      await onRefreshSystemStatus();
      onNotify(
        "success",
        `Đã thu gọn bộ nhớ chỉ mục: ${formatBytes(res.db_size_before_bytes)} → ${formatBytes(
          res.db_size_after_bytes
        )}`
      );
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsVacuuming(false);
    }
  };

  const effectiveHotkeyError = localHotkeyError || systemStatus.hotkey_error;

  return (
    <div
      className="vx-modal-backdrop"
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          !isRecordingHotkey &&
          !isSaving &&
          !isVacuuming
        ) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="vx-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Cài đặt VXSearch"
      >
        <div
          className="vx-modal-header"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          onMouseDown={handleHeaderMouseDown}
        >
          <div className="vx-modal-title" data-tauri-drag-region>
            <Settings style={{ width: 16, height: 16, color: "var(--accent-bright)" }} />
            <span>Cài đặt VXSearch</span>
          </div>
          <button
            type="button"
            className="vx-icon-btn no-drag"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            disabled={isSaving || isVacuuming}
            onClick={onClose}
            aria-label="Đóng"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="vx-modal-body">
          <aside className="vx-settings-sidebar" aria-label="Danh mục cài đặt">
            <div className="vx-sidebar-group-title">Tính năng cốt lõi</div>
            <button
              type="button"
              className={`vx-sidebar-tab ${activeTab === "general" ? "is-active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <Settings style={{ width: 14, height: 14 }} />
              <span>Chung (General)</span>
            </button>
            <button
              type="button"
              className={`vx-sidebar-tab ${activeTab === "shortcuts" ? "is-active" : ""}`}
              onClick={() => setActiveTab("shortcuts")}
            >
              <Keyboard style={{ width: 14, height: 14 }} />
              <span>Phím tắt (Shortcuts)</span>
            </button>
            <button
              type="button"
              className={`vx-sidebar-tab ${activeTab === "cache" ? "is-active" : ""}`}
              onClick={() => setActiveTab("cache")}
            >
              <Database style={{ width: 14, height: 14 }} />
              <span>Bộ nhớ chỉ mục</span>
            </button>

            <div className="vx-sidebar-divider" />

            <div className="vx-sidebar-group-title">Thông tin & Hỗ trợ</div>
            <button
              type="button"
              className={`vx-sidebar-tab ${activeTab === "updates" ? "is-active" : ""}`}
              onClick={() => setActiveTab("updates")}
            >
              <Sparkles style={{ width: 14, height: 14 }} />
              <span>Cập nhật (Updates)</span>
            </button>
            <button
              type="button"
              className={`vx-sidebar-tab ${activeTab === "about" ? "is-active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              <Info style={{ width: 14, height: 14 }} />
              <span>Giới thiệu (About)</span>
            </button>
            <button
              type="button"
              className={`vx-sidebar-tab is-support ${
                activeTab === "support" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("support")}
            >
              <Coffee style={{ width: 14, height: 14, color: "var(--semantic-amber)" }} />
              <span>Ủng hộ tác giả</span>
            </button>
          </aside>

          <div className="vx-settings-content">
            {activeTab === "general" && (
              <>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Giao diện & Chủ đề (Theme)
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Chọn chế độ màu hiển thị chuẩn VXUtilities.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {(
                      [
                        { id: "dark", label: "Tối (Dark Mode)" },
                        { id: "light", label: "Sáng (Light Mode)" },
                        { id: "system", label: "Theo hệ thống" },
                      ] as Array<{ id: ThemeMode; label: string }>
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        disabled={isSaving}
                        className={`vx-btn ${
                          settings.theme === mode.id ? "vx-btn-primary" : ""
                        }`}
                        onClick={() =>
                          void persistFullSettings({
                            ...settings,
                            theme: mode.id,
                          })
                        }
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Hành vi cửa sổ & Tìm kiếm
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      cursor: isSaving ? "not-allowed" : "pointer",
                      padding: "4px 0",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                        Chạy ngầm trên Menu Bar / System Tray khi đóng cửa sổ
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Giữ bộ theo dõi thư mục hoạt động nền và mở lại bằng phím tắt.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={settings.close_to_tray}
                      onChange={(e) =>
                        void persistFullSettings({
                          ...settings,
                          close_to_tray: e.target.checked,
                        })
                      }
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      cursor: isSaving ? "not-allowed" : "pointer",
                      padding: "4px 0",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                        Tự động bôi đen ô tìm kiếm khi kích hoạt cửa sổ
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Cho phép gõ từ khóa mới ngay khi gọi cửa sổ VXSearch.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={settings.auto_select_input}
                      onChange={(e) =>
                        void persistFullSettings({
                          ...settings,
                          auto_select_input: e.target.checked,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="vx-card">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      Độ trễ tìm kiếm (Debounce)
                    </span>
                    <span className="vx-badge-pill">{draftDebounceMs} ms</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Thời gian chờ trước khi thực hiện tìm kiếm khi bạn đang gõ phím (100ms – 2000ms).
                  </p>
                  <input
                    type="range"
                    min={100}
                    max={2000}
                    step={50}
                    disabled={isSaving}
                    value={draftDebounceMs}
                    onChange={(e) => setDraftDebounceMs(Number(e.target.value))}
                    onPointerUp={commitDraftDebounce}
                    onKeyUp={commitDraftDebounce}
                    onBlur={commitDraftDebounce}
                  />
                </div>
              </>
            )}

            {activeTab === "shortcuts" && (
              <>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Phím tắt toàn cục (Global Hotkey)
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Nhấn tổ hợp phím này để hiện/ẩn nhanh cửa sổ VXSearch. Mặc định{" "}
                    <code className="font-mono">
                      {isMac ? "Command+Shift+F" : "Alt+Shift+F"}
                    </code>{" "}
                    (dự phòng <code className="font-mono">Control+Alt+F</code> nếu bị chiếm).
                  </p>

                  {effectiveHotkeyError && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 8px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--semantic-rose-bg)",
                        color: "var(--semantic-rose)",
                        fontSize: 11,
                      }}
                    >
                      <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <span>{effectiveHotkeyError}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div
                      className="font-mono"
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-strong)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--accent-bright)",
                      }}
                    >
                      {settings.global_hotkey}
                    </div>

                    <button
                      type="button"
                      disabled={isSaving}
                      className={`vx-btn ${isRecordingHotkey ? "vx-btn-primary" : ""}`}
                      onClick={() => setIsRecordingHotkey((v) => !v)}
                      onKeyDown={handleHotkeyRecordKeyDown}
                    >
                      {isRecordingHotkey
                        ? "Nhấn tổ hợp phím mới... (Esc để hủy)"
                        : "Ghi phím tắt mới"}
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {(isMac
                      ? ["Command+Shift+F", "Control+Alt+F", "Alt+Shift+F"]
                      : ["Alt+Shift+F", "Control+Shift+F", "Control+Alt+F"]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={isSaving}
                        className="vx-btn"
                        style={{ height: 24, fontSize: 11 }}
                        onClick={() =>
                          void persistFullSettings(
                            {
                              ...settings,
                              global_hotkey: preset,
                            },
                            {
                              successMsg: `Đã đặt phím tắt: ${preset}`,
                              isHotkeyChange: true,
                            }
                          )
                        }
                      >
                        Dùng <span className="font-mono">{preset}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Bảng phím tắt điều hướng trong ứng dụng
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Di chuyển lên / xuống danh sách kết quả</span>
                      <span className="vx-kbd-tag">↑ / ↓</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Mở tệp đang chọn bằng ứng dụng mặc định</span>
                      <span className="vx-kbd-tag">Enter</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Hiện vị trí tệp trong Finder / Explorer</span>
                      <span className="vx-kbd-tag">{isMac ? "⌘ + Enter" : "Ctrl + Enter"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Sao chép đường dẫn đầy đủ của tệp đang chọn</span>
                      <span className="vx-kbd-tag">{isMac ? "⌘ + C" : "Ctrl + C"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Xóa từ khóa tìm kiếm / Đóng hộp thoại / Ẩn cửa sổ</span>
                      <span className="vx-kbd-tag">Escape</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "cache" && (
              <>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Bộ nhớ chỉ mục
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        padding: 10,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        SỐ THƯ MỤC THEO DÕI
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}
                      >
                        {formatNumber(systemStatus.total_roots)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        TỔNG SỐ TỆP TRONG CHỈ MỤC
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-bright)" }}
                      >
                        {formatNumber(systemStatus.total_files)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        TỔNG DUNG LƯỢNG TỆP GỐC
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        {formatBytes(systemStatus.total_size_bytes)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        DUNG LƯỢNG BỘ NHỚ CHỈ MỤC
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 14, fontWeight: 600, color: "var(--semantic-emerald)" }}
                      >
                        {formatBytes(systemStatus.db_size_bytes)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Thu gọn chỉ mục
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Giải phóng dung lượng trống trong bộ nhớ chỉ mục sau khi bạn gỡ bỏ các thư mục lớn.
                  </p>

                  {lastVacuumInfo && (
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--semantic-emerald)",
                        padding: "4px 8px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--semantic-emerald-bg)",
                      }}
                    >
                      Đã thu gọn: {formatBytes(lastVacuumInfo.before)} →{" "}
                      {formatBytes(lastVacuumInfo.after)}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
                    <button
                      type="button"
                      className="vx-btn vx-btn-primary"
                      disabled={isVacuuming || isSaving}
                      onClick={() => void handleVacuum()}
                    >
                      <RefreshCw style={{ width: 14, height: 14 }} />
                      <span>
                        {isVacuuming ? "Đang thu gọn..." : "Thu gọn chỉ mục"}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "updates" && (
              <><div className="vx-card">Phiên bản đang chạy: v{systemStatus.app_version} ({systemStatus.platform})</div><AppUpdates /></>
            )}

            {activeTab === "about" && (
              <div className="vx-card" style={{ gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {!aboutIconError ? (
                    <img
                      src="/app_icon.png"
                      alt="VXSearch"
                      style={{ width: 44, height: 44, borderRadius: 10 }}
                      onError={() => setAboutIconError(true)}
                    />
                  ) : (
                    <div className="vx-empty-icon-circle">
                      <Search style={{ width: 22, height: 22 }} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                      VXSearch
                    </div>
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--accent-bright)" }}>
                      Phiên bản v{systemStatus.app_version || "0.1.0"} • Nền tảng:{" "}
                      {systemStatus.platform}
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  VXSearch là tiện ích tìm kiếm tệp cục bộ theo danh sách thư mục chỉ định thuộc hệ sinh thái{" "}
                  <strong>VXUtilities</strong>. Ứng dụng lập chỉ mục tên và đường dẫn tệp cục bộ, đồng thời theo dõi sự kiện thay đổi thư mục theo thời gian thực.
                </p>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Tác giả:</span>
                    <strong style={{ color: "var(--text-primary)" }}>Bùi Việt Linh</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted)" }}>Mã nguồn & Dự án:</span>
                    <button
                      type="button"
                      className="vx-chrome-btn"
                      style={{ color: "var(--accent-bright)", padding: "0 6px" }}
                      onClick={() => void ipcOpenProjectUrl()}
                    >
                      <span>https://github.com/linhbv94/VXSearch</span>
                      <ExternalLink style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 6,
                    }}
                  >
                    Công nghệ nền tảng
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[
                      "Tauri 2",
                      "Rust Core",
                      "SQLite",
                      "Notify Watcher",
                      "React 19",
                      "TypeScript",
                    ].map((tech) => (
                      <span key={tech} className="vx-kbd-tag">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "support" && (
              <div
                className="vx-card"
                style={{
                  alignItems: "center",
                  textAlign: "center",
                  padding: "18px 16px",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 9999,
                    background: "var(--semantic-amber-bg)",
                    color: "var(--semantic-amber)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Coffee style={{ width: 14, height: 14 }} />
                  <span>Ủng hộ tác giả Bùi Việt Linh</span>
                </div>

                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    maxWidth: 410,
                    lineHeight: 1.55,
                  }}
                >
                  Cảm ơn bạn đã tin tưởng sử dụng <strong>VXSearch</strong> trong công việc hằng ngày! Nếu ứng dụng giúp bạn tiết kiệm thời gian, bạn có thể mời tác giả một ly cà phê qua mã VietQR bên dưới.
                </p>

                <div
                  style={{
                    background: "#ffffff",
                    padding: 14,
                    borderRadius: 16,
                    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.35)",
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!qrError ? (
                    <img
                      src="/support_qr.png"
                      alt="Mã QR VietQR ủng hộ tác giả Bùi Việt Linh"
                      style={{
                        width: 210,
                        height: 210,
                        objectFit: "contain",
                        display: "block",
                      }}
                      onError={() => setQrError(true)}
                    />
                  ) : (
                    <div
                      style={{
                        width: 210,
                        height: 210,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#0f172a",
                        fontSize: 11,
                        padding: 12,
                      }}
                    >
                      <Coffee style={{ width: 28, height: 28, color: "#d97706", marginBottom: 6 }} />
                      <strong>Mã QR VietQR</strong>
                      <span>(/support_qr.png)</span>
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Quét trực tiếp bằng ứng dụng Ngân hàng trên điện thoại
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="vx-modal-footer">
          <button
            type="button"
            className="vx-btn"
            disabled={isSaving || isVacuuming}
            onClick={() => void handleResetDefaults()}
          >
            <RotateCcw style={{ width: 13, height: 13 }} />
            <span>Khôi phục mặc định</span>
          </button>

          <button
            type="button"
            className="vx-btn vx-btn-primary"
            disabled={isSaving || isVacuuming}
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
