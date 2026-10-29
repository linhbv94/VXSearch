import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  FolderOpen,
  FolderPlus,
  Minus,
  RefreshCw,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import type { WatchedRoot } from "../types/ipc_types";
import {
  closeOrHideAppWindow,
  minimizeAppWindow,
  startWindowDrag,
  toggleMaximizeAppWindow,
} from "../services/tauri_ipc";
import { formatNumber, getFolderBasename } from "../utils/formatters";
import { type AppLanguage, translations } from "../i18n/translations";

interface TitleBarProps {
  platform: string;
  language?: AppLanguage;
  watchedRoots: WatchedRoot[];
  selectedRootId: number | null;
  closeToTray: boolean;
  onSelectRootFilter: (rootId: number | null) => void;
  onOpenFolderManager: () => void;
  onQuickAddFolder: () => void;
  onOpenSettings: () => void;
  onClearSearch: () => void;
  onFocusSearch: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  platform,
  language = "vi",
  watchedRoots,
  selectedRootId,
  closeToTray,
  onSelectRootFilter,
  onOpenFolderManager,
  onQuickAddFolder,
  onOpenSettings,
  onClearSearch,
  onFocusSearch,
}) => {
  const t = translations[language].titleBar;
  const isWindows = platform.toLowerCase().includes("win");
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const [winMenuOpen, setWinMenuOpen] = useState<"file" | "edit" | null>(null);
  const dropdownTimerRef = useRef<number | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
        setWinMenuOpen(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape" && (folderDropdownOpen || winMenuOpen !== null)) {
        e.preventDefault();
        e.stopPropagation();
        setFolderDropdownOpen(false);
        setWinMenuOpen(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [folderDropdownOpen, winMenuOpen]);

  const handleBarMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".no-drag")) return;
    if (e.button === 0) {
      void startWindowDrag();
    }
  };

  const openFolderHover = () => {
    if (dropdownTimerRef.current) {
      window.clearTimeout(dropdownTimerRef.current);
      dropdownTimerRef.current = null;
    }
    setFolderDropdownOpen(true);
  };

  const closeFolderHoverDelayed = () => {
    if (dropdownTimerRef.current) {
      window.clearTimeout(dropdownTimerRef.current);
    }
    dropdownTimerRef.current = window.setTimeout(() => {
      setFolderDropdownOpen(false);
    }, 180);
  };

  const displayedRoots = watchedRoots.slice(0, 5);

  return (
    <header
      ref={barRef}
      className={`vx-titlebar ${isWindows ? "is-windows" : "is-macos"}`}
      data-vx-titlebar-profile={isWindows ? "windows_32" : "standard_32"}
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onMouseDown={handleBarMouseDown}
    >
      <div className="vx-titlebar-left" data-tauri-drag-region>
        <div
          className="vx-app-badge"
          data-tauri-drag-region
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Search
            aria-hidden="true"
            data-vx-titlebar-glyph
            style={{
              width: 16,
              height: 16,
              color: "var(--accent-bright)",
              flexShrink: 0,
            }}
          />
          <span className="vx-app-title" data-vx-titlebar-name>
            VXSearch
          </span>
        </div>

        {isWindows && (
          <div
            className="vx-dropdown-wrapper no-drag" data-vx-windows-menu
            style={
              {
                WebkitAppRegion: "no-drag",
                display: "flex",
                alignItems: "center",
                gap: 2,
                marginLeft: 4,
              } as React.CSSProperties
            }
          >
            <div className="vx-dropdown-wrapper">
              <button
                type="button"
                className={`vx-chrome-btn ${winMenuOpen === "file" ? "is-active" : ""}`}
                onClick={() => setWinMenuOpen(winMenuOpen === "file" ? null : "file")}
              >
                {t.fileMenu}
              </button>
              {winMenuOpen === "file" && (
                <div className="vx-dropdown-menu glass-dropdown">
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      onQuickAddFolder();
                    }}
                  >
                    <span>{t.addFolderItem}</span>
                    <FolderPlus style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      onOpenFolderManager();
                    }}
                  >
                    <span>{t.manageFoldersItem}</span>
                    <FolderOpen style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      onOpenSettings();
                    }}
                  >
                    <span>{t.settingsItem}</span>
                    <Settings style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      void closeOrHideAppWindow(closeToTray);
                    }}
                  >
                    <span>{closeToTray ? t.hideToTray : t.quitApp}</span>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}
            </div>

            <div className="vx-dropdown-wrapper">
              <button
                type="button"
                className={`vx-chrome-btn ${winMenuOpen === "edit" ? "is-active" : ""}`}
                onClick={() => setWinMenuOpen(winMenuOpen === "edit" ? null : "edit")}
              >
                {t.editMenu}
              </button>
              {winMenuOpen === "edit" && (
                <div className="vx-dropdown-menu glass-dropdown">
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      onFocusSearch();
                    }}
                  >
                    <span>{t.focusSearchItem}</span>
                    <span className="vx-kbd-tag">Ctrl+F</span>
                  </button>
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setWinMenuOpen(null);
                      onClearSearch();
                    }}
                  >
                    <span>{t.clearFiltersItem}</span>
                    <span className="vx-kbd-tag">Esc</span>
                  </button>
                </div>
              )}
            </div>

            <div
              className="vx-dropdown-wrapper"
              onMouseEnter={openFolderHover}
              onMouseLeave={closeFolderHoverDelayed}
            >
              <button
                type="button"
                className={`vx-chrome-btn ${selectedRootId !== null ? "is-active" : ""}`}
                onClick={onOpenFolderManager}
                title={t.foldersBtnTitle}
              >
                <FolderOpen
                  style={{ width: 14, height: 14, color: "var(--accent-bright)" }}
                />
                <span>{t.foldersBtn}</span>
                <span className="vx-badge-pill">{watchedRoots.length}</span>
              </button>
              {folderDropdownOpen && (
                <div
                  className="vx-dropdown-menu glass-dropdown"
                  onMouseEnter={openFolderHover}
                  onMouseLeave={closeFolderHoverDelayed}
                >
                  <div className="vx-dropdown-header">{t.watchedFoldersHeader}</div>
                  {displayedRoots.length === 0 ? (
                    <div
                      style={{ padding: "8px", fontSize: 11, color: "var(--text-muted)" }}
                    >
                      {t.noWatchedFolders}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`vx-dropdown-item ${
                          selectedRootId === null ? "is-selected" : ""
                        }`}
                        onClick={() => {
                          onSelectRootFilter(null);
                          setFolderDropdownOpen(false);
                        }}
                      >
                        <span>{t.allFolders(watchedRoots.length)}</span>
                        {selectedRootId === null && (
                          <Check style={{ width: 13, height: 13 }} />
                        )}
                      </button>
                      {displayedRoots.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`vx-dropdown-item ${
                            selectedRootId === r.id ? "is-selected" : ""
                          }`}
                          title={r.path}
                          onClick={() => {
                            onSelectRootFilter(r.id);
                            setFolderDropdownOpen(false);
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.alias || getFolderBasename(r.path)}
                          </span>
                          <span
                            className="font-mono"
                            style={{ fontSize: 10, color: "var(--text-muted)" }}
                          >
                            {formatNumber(r.total_files, language)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  <div
                    style={{
                      height: 1,
                      background: "var(--border-subtle)",
                      margin: "4px 0",
                    }}
                  />
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setFolderDropdownOpen(false);
                      onQuickAddFolder();
                    }}
                  >
                    <span>{t.addNewFolderItem}</span>
                    <FolderPlus
                      style={{ width: 13, height: 13, color: "var(--accent-bright)" }}
                    />
                  </button>
                  <button
                    type="button"
                    className="vx-dropdown-item"
                    onClick={() => {
                      setFolderDropdownOpen(false);
                      onOpenFolderManager();
                    }}
                  >
                    <span>{t.openFolderManagerItem}</span>
                    <RefreshCw style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className="vx-titlebar-right no-drag"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {!isWindows && (
          <div
            className="vx-dropdown-wrapper"
            onMouseEnter={openFolderHover}
            onMouseLeave={closeFolderHoverDelayed}
          >
            <button
              type="button"
              className={`vx-chrome-btn ${selectedRootId !== null ? "is-active" : ""}`}
              onClick={onOpenFolderManager}
              title={t.foldersBtnTitle}
            >
              <FolderOpen
                style={{ width: 14, height: 14, color: "var(--accent-bright)" }}
              />
              <span>{t.foldersBtn}</span>
              <span className="vx-badge-pill">{watchedRoots.length}</span>
            </button>
            {folderDropdownOpen && (
              <div
                className="vx-dropdown-menu align-right glass-dropdown"
                onMouseEnter={openFolderHover}
                onMouseLeave={closeFolderHoverDelayed}
              >
                <div className="vx-dropdown-header">{t.watchedFoldersHeader}</div>
                {displayedRoots.length === 0 ? (
                  <div
                    style={{ padding: "8px", fontSize: 11, color: "var(--text-muted)" }}
                  >
                    {t.noWatchedFolders}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`vx-dropdown-item ${
                        selectedRootId === null ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        onSelectRootFilter(null);
                        setFolderDropdownOpen(false);
                      }}
                    >
                      <span>{t.allFolders(watchedRoots.length)}</span>
                      {selectedRootId === null && (
                        <Check style={{ width: 13, height: 13 }} />
                      )}
                    </button>
                    {displayedRoots.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className={`vx-dropdown-item ${
                          selectedRootId === r.id ? "is-selected" : ""
                        }`}
                        title={r.path}
                        onClick={() => {
                          onSelectRootFilter(r.id);
                          setFolderDropdownOpen(false);
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.alias || getFolderBasename(r.path)}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: 10, color: "var(--text-muted)" }}
                        >
                          {formatNumber(r.total_files, language)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                <div
                  style={{
                    height: 1,
                    background: "var(--border-subtle)",
                    margin: "4px 0",
                  }}
                />
                <button
                  type="button"
                  className="vx-dropdown-item"
                  onClick={() => {
                    setFolderDropdownOpen(false);
                    onQuickAddFolder();
                  }}
                >
                  <span>{t.addNewFolderItem}</span>
                  <FolderPlus
                    style={{ width: 13, height: 13, color: "var(--accent-bright)" }}
                  />
                </button>
                <button
                  type="button"
                  className="vx-dropdown-item"
                  onClick={() => {
                    setFolderDropdownOpen(false);
                    onOpenFolderManager();
                  }}
                >
                  <span>{t.manageAllFoldersItem}</span>
                  <FolderOpen style={{ width: 13, height: 13 }} />
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="vx-settings-gear-btn"
          data-vx-settings-button
          onClick={onOpenSettings}
          title={t.settingsBtnTitle}
          aria-label={t.settingsBtnTitle}
        >
          <Settings style={{ width: 16, height: 16, flexShrink: 0 }} />
        </button>

        {isWindows && (
          <div className="vx-win-controls">
            <button
              type="button"
              className="vx-win-btn"
              onClick={() => void minimizeAppWindow()}
              title={t.minimize}
              aria-label={t.minimize}
            >
              <Minus style={{ width: 14, height: 14 }} />
            </button>
            <button
              type="button"
              className="vx-win-btn"
              onClick={() => void toggleMaximizeAppWindow()}
              title={t.maximize}
              aria-label={t.maximize}
            >
              <Square style={{ width: 12, height: 12 }} />
            </button>
            <button
              type="button"
              className="vx-win-btn is-close"
              onClick={() => void closeOrHideAppWindow(closeToTray)}
              title={closeToTray ? t.closeToTrayTitle : t.closeTitle}
              aria-label={t.closeTitle}
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
