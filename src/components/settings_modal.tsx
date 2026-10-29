import type {AppSettings,SystemStatus,ToastType} from '../types/ipc_types';
import type {AppLanguage,ExtendedThemeMode} from '../i18n/translations';
import {SettingsShell,GeneralSettings,UpdatesSettings,AboutSettings,SupportSettings,commonSettingsTabs} from './shared/settings_ui';

import {AppUpdates} from './app_updates';
import {useEffect,useState} from 'react';
import {AlertTriangle,Database,Keyboard,RefreshCw,Search} from 'lucide-react';

import {
  ipcOpenProjectUrl,
  ipcResetSettings,
  ipcUpdateSettings,
  ipcVacuumDatabase,
  startWindowDrag,
} from "../services/tauri_ipc";
import { formatBytes, formatNumber, parseAppError } from "../utils/formatters";
import {translations} from '../i18n/translations';

export type SettingsTabId =
  | "general"
  | "search"
  | "shortcuts"
  | "cache"
  | "updates"
  | "about"
  | "support";

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTabId;
  language: AppLanguage;
  themeMode: ExtendedThemeMode;
  settings: AppSettings;
  systemStatus: SystemStatus;
  onClose: () => void;
  onChangeLanguage: (lang: AppLanguage) => void;
  onChangeThemeMode: (mode: ExtendedThemeMode) => void;
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
  language,
  themeMode,
  settings,
  systemStatus,
  onClose,
  onChangeLanguage,
  onChangeThemeMode,
  onSettingsUpdated,
  onRefreshSystemStatus,
  onNotify,
}) => {
  const t = translations[language].settings;
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






  useEffect(() => {
    setDraftDebounceMs(settings.debounce_ms);
  }, [settings.debounce_ms]);





  if (!isOpen) return null;

  const isMac = !systemStatus.platform.toLowerCase().includes("win");



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
      onChangeThemeMode(defaults.theme);
      setDraftDebounceMs(defaults.debounce_ms);
      await onRefreshSystemStatus();
      onNotify("success", t.resetSuccessToast);
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectThemeMode = async (mode: ExtendedThemeMode) => {
    if (isSaving) return;
    const backendTheme = mode === "oled" ? "dark" : mode;
    if (settings.theme !== backendTheme && !(await persistFullSettings({...settings,theme:backendTheme}))) return;
    onChangeThemeMode(mode);
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
      onNotify("warning", t.shortcuts.unsupportedKeyWarning);
      return;
    }

    const parts: string[] = [];
    if (e.metaKey) parts.push(isMac ? "Command" : "Super");
    if (e.ctrlKey) parts.push("Control");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    if (parts.length === 0) {
      onNotify("warning", t.shortcuts.modifierRequiredWarning);
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
        successMsg: t.shortcuts.updatedHotkeyToast(combo),
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
        t.cache.vacuumToast(
          formatBytes(res.db_size_before_bytes),
          formatBytes(res.db_size_after_bytes)
        )
      );
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsVacuuming(false);
    }
  };

  const effectiveHotkeyError = localHotkeyError || systemStatus.hotkey_error;





return (<SettingsShell theme={themeMode} appName="VXSearch" language={language} tabs={[commonSettingsTabs(language)[0], {id:'search',label:t.tabs.search,icon:<Search size={16}/>} ,{id:'shortcuts',label:t.tabs.shortcuts,icon:<Keyboard size={16}/>} ,{id:'cache',label:t.tabs.cache,icon:<Database size={16}/>} , ...commonSettingsTabs(language).slice(1)]} activeTab={activeTab} onTabChange={id=>setActiveTab(id as SettingsTabId)} onClose={onClose} onReset={handleResetDefaults}  disabled={isSaving || isVacuuming} canTrapTab={()=>!isRecordingHotkey} onEscape={()=>{if(isRecordingHotkey)setIsRecordingHotkey(false);else if(!isSaving&&!isVacuuming)onClose();}} onDrag={() => { void startWindowDrag(); }}>{activeTab === 'search' && (<>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.search.windowBehaviorTitle}
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
                        {t.search.closeToTrayTitle}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {t.search.closeToTrayDesc}
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
                        {t.search.autoSelectTitle}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {t.search.autoSelectDesc}
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
                      {t.search.debounceTitle}
                    </span>
                    <span className="vx-badge-pill">{draftDebounceMs} ms</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {t.search.debounceDesc}
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
              </>)}
{activeTab === 'shortcuts' && (<>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.shortcuts.globalHotkeyTitle}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {t.shortcuts.globalHotkeyDescPrefix}
                    <code className="font-mono">
                      {isMac ? "Command+Shift+F" : "Alt+Shift+F"}
                    </code>
                    {t.shortcuts.globalHotkeyDescMiddle}
                    <code className="font-mono">Control+Alt+F</code>
                    {t.shortcuts.globalHotkeyDescSuffix}
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
                        ? t.shortcuts.recordingPrompt
                        : t.shortcuts.recordBtn}
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
                              successMsg: t.shortcuts.presetHotkeyToast(preset),
                              isHotkeyChange: true,
                            }
                          )
                        }
                      >
                        {t.shortcuts.usePresetPrefix}
                        <span className="font-mono">{preset}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.shortcuts.navTableTitle}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navMove}</span>
                      <span className="vx-kbd-tag">↑ / ↓</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navOpen}</span>
                      <span className="vx-kbd-tag">Enter</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navReveal}</span>
                      <span className="vx-kbd-tag">{isMac ? "⌘ + Enter" : "Ctrl + Enter"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navCopy}</span>
                      <span className="vx-kbd-tag">{isMac ? "⌘ + C" : "Ctrl + C"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navSettings}</span>
                      <span className="vx-kbd-tag">{isMac ? "⌘ + ," : "Ctrl + ,"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.shortcuts.navEsc}</span>
                      <span className="vx-kbd-tag">Escape</span>
                    </div>
                  </div>
                </div>
              </>)}
{activeTab === 'cache' && (<>
                <div className="vx-card">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.cache.title}
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
                        {t.cache.statRoots}
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}
                      >
                        {formatNumber(systemStatus.total_roots, language)}
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
                        {t.cache.statFiles}
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-bright)" }}
                      >
                        {formatNumber(systemStatus.total_files, language)}
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
                        {t.cache.statSourceSize}
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
                        {t.cache.statDbSize}
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
                    {t.cache.vacuumTitle}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {t.cache.vacuumDesc}
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
                      {t.cache.vacuumDonePrefix} {formatBytes(lastVacuumInfo.before)} →{" "}
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
                        {isVacuuming ? t.cache.vacuumingBtn : t.cache.vacuumBtn}
                      </span>
                    </button>
                  </div>
                </div>
              </>)}
{activeTab === 'general' && <GeneralSettings language={language} theme={themeMode} themes={['system','dark','light','oled']} onThemeChange={handleSelectThemeMode} onLanguageChange={onChangeLanguage} disabled={isSaving || isVacuuming}/>}
{activeTab === 'updates' && <UpdatesSettings language={language} version={systemStatus.app_version}><AppUpdates language={language}/></UpdatesSettings>}
{activeTab === 'about' && <AboutSettings language={language} appName="VXSearch" version={systemStatus.app_version}  description={t.about.description} repository="https://github.com/linhbv94/VXSearch" icon={<Search/>} technologies={["Tauri 2","Rust Core","SQLite","Notify Watcher","React 19","TypeScript"]} onOpenRepository={() => { void ipcOpenProjectUrl(); }}/>}
{activeTab === 'support' && <SupportSettings language={language} qrSource={"/support_qr.png"}/>}</SettingsShell>);
};
