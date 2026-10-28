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

interface TitleBarProps {
  platform: string;
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
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onMouseDown={handleBarMouseDown}
    >
      <div className="vx-titlebar-left" data-tauri-drag-region>
        {!isWindows ? (
          <div
            className="vx-app-badge"
            data-tauri-drag-region
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Search
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                color: "var(--accent-bright)",
                flexShrink: 0,
              }}
            />
            <span className="vx-app-title">VXSearch</span>
          </div>
        ) : (
          <div
            className="vx-dropdown-wrapper no-drag"
            style={
              {
                WebkitAppRegion: "no-drag",
                display: "flex",
                alignItems: "center",
                gap: 2,
              } as React.CSSProperties
            }
          >
            <div className="vx-dropdown-wrapper">
              <button
                type="button"
                className={`vx-chrome-btn ${winMenuOpen === "file" ? "is-active" : ""}`}
                onClick={() => setWinMenuOpen(winMenuOpen === "file" ? null : "file")}
              >
                Tệp
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
                    <span>Thêm thư mục theo dõi...</span>
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
                    <span>Quản lý thư mục theo dõi</span>
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
                    <span>Cài đặt</span>
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
                    <span>{closeToTray ? "Ẩn xuống khay hệ thống" : "Thoát ứng dụng"}</span>
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
                Chỉnh sửa
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
                    <span>Chọn ô tìm kiếm</span>
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
                    <span>Xóa bộ lọc tìm kiếm</span>
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
                title="Quản lý thư mục theo dõi"
              >
                <FolderOpen
                  style={{ width: 14, height: 14, color: "var(--accent-bright)" }}
                />
                <span>Thư mục</span>
                <span className="vx-badge-pill">{watchedRoots.length}</span>
              </button>
              {folderDropdownOpen && (
                <div
                  className="vx-dropdown-menu glass-dropdown"
                  onMouseEnter={openFolderHover}
                  onMouseLeave={closeFolderHoverDelayed}
                >
                  <div className="vx-dropdown-header">Thư mục theo dõi</div>
                  {displayedRoots.length === 0 ? (
                    <div
                      style={{ padding: "8px", fontSize: 11, color: "var(--text-muted)" }}
                    >
                      Chưa có thư mục nào được theo dõi.
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
                        <span>Tất cả thư mục ({watchedRoots.length})</span>
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
                            {formatNumber(r.total_files)}
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
                    <span>+ Thêm thư mục mới...</span>
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
                    <span>Mở quản lý thư mục...</span>
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
              title="Quản lý thư mục theo dõi"
            >
              <FolderOpen
                style={{ width: 14, height: 14, color: "var(--accent-bright)" }}
              />
              <span>Thư mục</span>
              <span className="vx-badge-pill">{watchedRoots.length}</span>
            </button>
            {folderDropdownOpen && (
              <div
                className="vx-dropdown-menu align-right glass-dropdown"
                onMouseEnter={openFolderHover}
                onMouseLeave={closeFolderHoverDelayed}
              >
                <div className="vx-dropdown-header">Thư mục theo dõi</div>
                {displayedRoots.length === 0 ? (
                  <div
                    style={{ padding: "8px", fontSize: 11, color: "var(--text-muted)" }}
                  >
                    Chưa có thư mục nào được theo dõi.
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
                      <span>Tất cả thư mục ({watchedRoots.length})</span>
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
                          {formatNumber(r.total_files)}
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
                  <span>+ Thêm thư mục mới...</span>
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
                  <span>Quản lý tất cả thư mục...</span>
                  <FolderOpen style={{ width: 13, height: 13 }} />
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="vx-chrome-btn"
          onClick={onOpenSettings}
          title="Cài đặt VXSearch"
          aria-label="Cài đặt VXSearch"
        >
          <Settings style={{ width: 14, height: 14 }} />
          <span>Cài đặt</span>
        </button>

        {isWindows && (
          <div className="vx-win-controls">
            <button
              type="button"
              className="vx-win-btn"
              onClick={() => void minimizeAppWindow()}
              title="Thu nhỏ"
              aria-label="Thu nhỏ"
            >
              <Minus style={{ width: 14, height: 14 }} />
            </button>
            <button
              type="button"
              className="vx-win-btn"
              onClick={() => void toggleMaximizeAppWindow()}
              title="Phóng to / Khôi phục"
              aria-label="Phóng to / Khôi phục"
            >
              <Square style={{ width: 12, height: 12 }} />
            </button>
            <button
              type="button"
              className="vx-win-btn is-close"
              onClick={() => void closeOrHideAppWindow(closeToTray)}
              title={closeToTray ? "Đóng (Ẩn vào khay)" : "Đóng"}
              aria-label="Đóng"
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
