import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  GitMerge,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type {
  ScanProgressPayload,
  ToastType,
  WatchedRoot,
} from "../types/ipc_types";
import {
  ipcAddWatchedRoot,
  ipcConfirmMergeRoots,
  ipcPickFolder,
  ipcRefreshWatchedRoot,
  ipcRelinkWatchedRoot,
  ipcRemoveWatchedRoot,
  startWindowDrag,
} from "../services/tauri_ipc";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
  parseAppError,
} from "../utils/formatters";
import { type AppLanguage, translations } from "../i18n/translations";

interface FolderManagerModalProps {
  isOpen: boolean;
  language?: AppLanguage;
  watchedRoots: WatchedRoot[];
  scanProgress: ScanProgressPayload | null;
  onClose: () => void;
  onRefreshAll: () => Promise<void>;
  onNotify: (type: ToastType, message: string) => void;
  onPickerBusyChange?: (busy: boolean) => void;
}

interface PendingMergeState {
  parentPath: string;
  coveredRootIds: number[];
  message: string;
}

interface PendingRelinkState {
  rootId: number;
  oldPath: string;
  newPath: string;
}

function getStatusDisplay(
  status: string,
  t: (typeof translations)["vi"]["folderModal"] | (typeof translations)["en"]["folderModal"]
): {
  label: string;
  color: string;
  bgColor: string;
} {
  const upper = status.toUpperCase();
  if (upper.includes("SCANNING") || upper.includes("RECONCIL")) {
    return {
      label: t.statusScanning,
      color: "var(--accent-bright)",
      bgColor: "var(--accent-surface)",
    };
  }
  if (
    upper.includes("OFFLINE") ||
    upper.includes("UNAVAILABLE") ||
    upper.includes("ERROR") ||
    upper.includes("MISSING")
  ) {
    return {
      label: t.statusUnavailable,
      color: "var(--semantic-amber)",
      bgColor: "var(--semantic-amber-bg)",
    };
  }
  return {
    label: t.statusWatching,
    color: "var(--semantic-emerald)",
    bgColor: "var(--semantic-emerald-bg)",
  };
}

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  isOpen,
  language = "vi",
  watchedRoots,
  scanProgress,
  onClose,
  onRefreshAll,
  onNotify,
  onPickerBusyChange,
}) => {
  const t = translations[language].folderModal;
  const [isBusy, setIsBusy] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<PendingMergeState | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null);
  const [pendingRelink, setPendingRelink] = useState<PendingRelinkState | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      const firstBtn = dialogRef.current?.querySelector<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)"
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

        if (isBusy || isPicking) {
          return;
        }
        if (pendingMerge !== null) {
          setPendingMerge(null);
          return;
        }
        if (pendingRelink !== null) {
          setPendingRelink(null);
          return;
        }
        if (pendingRemoveId !== null) {
          setPendingRemoveId(null);
          return;
        }
        if (showManualInput) {
          setShowManualInput(false);
          setManualPath("");
          return;
        }
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
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
  }, [
    isOpen,
    isBusy,
    isPicking,
    pendingMerge,
    pendingRelink,
    pendingRemoveId,
    showManualInput,
    onClose,
  ]);

  if (!isOpen) return null;

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".no-drag")) return;
    if (e.button === 0) {
      void startWindowDrag();
    }
  };

  const tryAddFolderByPath = async (targetPath: string) => {
    const trimmed = targetPath.trim();
    if (!trimmed) return;
    setIsBusy(true);
    try {
      await ipcAddWatchedRoot(trimmed);
      setManualPath("");
      setShowManualInput(false);
      await onRefreshAll();
      onNotify("success", t.toasts.added(trimmed));
    } catch (err) {
      const appErr = parseAppError(err);
      const rawCovered = appErr.details?.covered_root_ids;
      const coveredIds = Array.isArray(rawCovered)
        ? rawCovered.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
        : [];

      if (appErr.code === "E_PARENT_OF_EXISTING" || coveredIds.length > 0) {
        setPendingMerge({
          parentPath: trimmed,
          coveredRootIds: coveredIds,
          message: appErr.message || t.mergeDefaultMessage,
        });
      } else {
        onNotify("warning", appErr.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handlePickAndAddFolder = async () => {
    if (isBusy || isPicking) return;
    setIsPicking(true);
    onPickerBusyChange?.(true);
    try {
      const picked = await ipcPickFolder();
      if (!picked) return;
      await tryAddFolderByPath(picked);
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsPicking(false);
      onPickerBusyChange?.(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!pendingMerge || isBusy) return;
    setIsBusy(true);
    try {
      await ipcConfirmMergeRoots(
        pendingMerge.parentPath,
        pendingMerge.coveredRootIds
      );
      setPendingMerge(null);
      setManualPath("");
      setShowManualInput(false);
      await onRefreshAll();
      onNotify("success", t.toasts.merged(pendingMerge.parentPath));
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRefreshRoot = async (rootId: number) => {
    if (isBusy || isPicking) return;
    setIsBusy(true);
    try {
      await ipcRefreshWatchedRoot(rootId);
      await onRefreshAll();
      onNotify("info", t.toasts.refreshed);
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleInitiateRelink = async (root: WatchedRoot) => {
    if (isBusy || isPicking) return;
    setIsPicking(true);
    onPickerBusyChange?.(true);
    try {
      const picked = await ipcPickFolder();
      if (!picked) return;
      setPendingRelink({
        rootId: root.id,
        oldPath: root.path,
        newPath: picked,
      });
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsPicking(false);
      onPickerBusyChange?.(false);
    }
  };

  const handleConfirmRelink = async () => {
    if (!pendingRelink || isBusy) return;
    setIsBusy(true);
    try {
      await ipcRelinkWatchedRoot(pendingRelink.rootId, pendingRelink.newPath);
      setPendingRelink(null);
      await onRefreshAll();
      onNotify("success", t.toasts.relinked(pendingRelink.newPath));
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmRemove = async (rootId: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await ipcRemoveWatchedRoot(rootId);
      setPendingRemoveId(null);
      await onRefreshAll();
      const countText =
        typeof res.removed_files_count === "number"
          ? t.toasts.removedCountSuffix(formatNumber(res.removed_files_count, language))
          : "";
      onNotify("success", t.toasts.removed(countText));
    } catch (err) {
      const appErr = parseAppError(err);
      onNotify("error", appErr.message);
    } finally {
      setIsBusy(false);
    }
  };

  const totalFilesAllRoots = watchedRoots.reduce((acc, r) => acc + r.total_files, 0);
  const totalBytesAllRoots = watchedRoots.reduce((acc, r) => acc + r.total_size_bytes, 0);

  return (
    <div
      className="vx-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy && !isPicking) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="vx-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
      >
        <div
          className="vx-modal-header"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          onMouseDown={handleHeaderMouseDown}
        >
          <div className="vx-modal-title" data-tauri-drag-region>
            <FolderOpen style={{ width: 16, height: 16, color: "var(--accent-bright)" }} />
            <span>{t.title}</span>
          </div>
          <button
            type="button"
            className="vx-icon-btn no-drag"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            disabled={isBusy || isPicking}
            onClick={onClose}
            aria-label={t.closeAria}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="vx-modal-scroll">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              {t.subtitle}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="vx-btn"
                onClick={() => setShowManualInput((v) => !v)}
                disabled={isBusy || isPicking}
              >
                {t.manualPathBtn}
              </button>
              <button
                type="button"
                className="vx-btn vx-btn-primary"
                onClick={() => void handlePickAndAddFolder()}
                disabled={isBusy || isPicking}
              >
                {isBusy || isPicking ? (
                  <Loader2 style={{ width: 14, height: 14 }} />
                ) : (
                  <FolderPlus style={{ width: 14, height: 14 }} />
                )}
                <span>{t.addFolderBtn}</span>
              </button>
            </div>
          </div>

          {showManualInput && (
            <form
              className="vx-card"
              style={{ marginBottom: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                void tryAddFolderByPath(manualPath);
              }}
            >
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                {t.manualInputLabel}
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder={t.manualInputPlaceholder}
                  className="vx-search-input"
                  style={{
                    height: 30,
                    padding: "0 10px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                  }}
                />
                <button
                  type="submit"
                  className="vx-btn vx-btn-primary"
                  disabled={isBusy || !manualPath.trim()}
                >
                  {t.addBtn}
                </button>
                <button
                  type="button"
                  className="vx-btn"
                  disabled={isBusy}
                  onClick={() => {
                    setShowManualInput(false);
                    setManualPath("");
                  }}
                >
                  {t.cancelBtn}
                </button>
              </div>
            </form>
          )}

          {pendingMerge && (
            <div
              className="vx-card"
              style={{
                marginBottom: 12,
                borderColor: "var(--accent-border)",
                background: "var(--accent-surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 600,
                  color: "var(--accent-bright)",
                  fontSize: 12,
                }}
              >
                <GitMerge style={{ width: 15, height: 15 }} />
                <span>{t.mergeTitle}</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5 }}>
                {pendingMerge.message}
              </p>
              <div
                style={{
                  fontSize: 11,
                  padding: "6px 8px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <strong>{t.newParentLabel}</strong>{" "}
                  <span className="font-mono">{pendingMerge.parentPath}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>{t.coveredRootsLabel}</strong>
                </div>
                <ul style={{ marginLeft: 16, marginTop: 2 }}>
                  {pendingMerge.coveredRootIds.map((cid) => {
                    const matched = watchedRoots.find((r) => r.id === cid);
                    return (
                      <li key={cid} className="font-mono" style={{ fontSize: 10 }}>
                        {matched ? matched.path : t.missingRootLabel}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="vx-btn"
                  onClick={() => setPendingMerge(null)}
                  disabled={isBusy}
                >
                  {t.cancelMergeBtn}
                </button>
                <button
                  type="button"
                  className="vx-btn vx-btn-primary"
                  onClick={() => void handleConfirmMerge()}
                  disabled={isBusy}
                >
                  <CheckCircle2 style={{ width: 14, height: 14 }} />
                  <span>{t.confirmMergeBtn}</span>
                </button>
              </div>
            </div>
          )}

          {pendingRelink && (
            <div
              className="vx-card"
              style={{
                marginBottom: 12,
                borderColor: "rgba(251, 191, 36, 0.4)",
                background: "var(--semantic-amber-bg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 600,
                  color: "var(--semantic-amber)",
                  fontSize: 12,
                }}
              >
                <Link2 style={{ width: 15, height: 15 }} />
                <span>{t.relinkTitle(pendingRelink.rootId)}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5 }}>
                <div>
                  {t.oldPathLabel} <code className="font-mono">{pendingRelink.oldPath}</code>
                </div>
                <div>
                  {t.newPathLabel} <code className="font-mono">{pendingRelink.newPath}</code>
                </div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  {t.relinkDesc}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="vx-btn"
                  onClick={() => setPendingRelink(null)}
                  disabled={isBusy}
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="button"
                  className="vx-btn vx-btn-primary"
                  onClick={() => void handleConfirmRelink()}
                  disabled={isBusy}
                >
                  {t.confirmRelinkBtn}
                </button>
              </div>
            </div>
          )}

          {watchedRoots.length === 0 ? (
            <div
              className="vx-card"
              style={{
                alignItems: "center",
                justifyContent: "center",
                padding: "28px 16px",
                textAlign: "center",
              }}
            >
              <FolderOpen style={{ width: 28, height: 28, color: "var(--text-muted)" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {t.emptyTitle}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 380 }}>
                {t.emptyDescPrefix}
                <strong>{t.addFolderBtn}</strong>
                {t.emptyDescSuffix}
              </p>
            </div>
          ) : (
            <div className="vx-root-list">
              {watchedRoots.map((root) => {
                const statusInfo = getStatusDisplay(root.status, t);
                const isRootScanning =
                  scanProgress?.root_id === root.id ||
                  root.status.toUpperCase().includes("SCANNING");
                const isConfirmingRemove = pendingRemoveId === root.id;
                const isRootUnavailable =
                  root.status.toUpperCase().includes("OFFLINE") ||
                  root.status.toUpperCase().includes("UNAVAILABLE") ||
                  root.status.toUpperCase().includes("ERROR") ||
                  root.status.toUpperCase().includes("MISSING");

                return (
                  <div key={root.id} className="vx-root-card">
                    <div className="vx-root-top">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <FolderOpen
                          style={{
                            width: 15,
                            height: 15,
                            color: statusInfo.color,
                            flexShrink: 0,
                          }}
                        />
                        <span className="vx-root-path">{root.path}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          className="vx-icon-btn vx-tooltip-btn"
                          data-tooltip={t.refreshTooltip}
                          aria-label={t.refreshAria}
                          disabled={isBusy || isPicking}
                          onClick={() => void handleRefreshRoot(root.id)}
                        >
                          <RefreshCw style={{ width: 14, height: 14 }} />
                        </button>

                        <button
                          type="button"
                          className="vx-icon-btn vx-tooltip-btn"
                          data-tooltip={t.relinkTooltip}
                          aria-label={t.relinkAria}
                          disabled={isBusy || isPicking}
                          onClick={() => void handleInitiateRelink(root)}
                        >
                          <Link2 style={{ width: 14, height: 14 }} />
                        </button>

                        <button
                          type="button"
                          className="vx-icon-btn vx-tooltip-btn"
                          data-tooltip={t.removeTooltip}
                          aria-label={t.removeAria}
                          disabled={isBusy || isPicking}
                          onClick={() =>
                            setPendingRemoveId(isConfirmingRemove ? null : root.id)
                          }
                        >
                          <Trash2
                            style={{
                              width: 14,
                              height: 14,
                              color: "var(--semantic-rose)",
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="vx-root-meta">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "1px 7px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          color: statusInfo.color,
                          background: statusInfo.bgColor,
                        }}
                      >
                        ● {statusInfo.label}
                      </span>

                      {root.is_removable && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "1px 6px",
                            borderRadius: 9999,
                            fontSize: 10,
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <HardDrive style={{ width: 11, height: 11 }} />
                          {t.removableDrive}
                        </span>
                      )}

                      <span className="font-mono">
                        {t.filesCount(formatNumber(root.total_files, language))}
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        {formatBytes(root.total_size_bytes)}
                      </span>
                      <span>•</span>
                      <span>
                        {t.lastScanPrefix}{" "}
                        <span className="font-mono">
                          {formatTimestamp(root.last_scan_at)}
                        </span>
                      </span>
                    </div>

                    {isRootScanning && scanProgress?.root_id === root.id && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--accent-bright)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          paddingTop: 2,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.indexingPathPrefix} {scanProgress.current_path}
                        </span>
                        <span className="font-mono" style={{ flexShrink: 0 }}>
                          {t.filesCount(formatNumber(scanProgress.scanned_count, language))}
                        </span>
                      </div>
                    )}

                    {(root.error_message || isRootUnavailable) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "5px 8px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--semantic-amber-bg)",
                          color: "var(--semantic-amber)",
                          fontSize: 11,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
                          <span>
                            {root.error_message || t.unavailableDefaultMsg}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="vx-btn"
                          style={{ height: 22, fontSize: 10, padding: "0 8px" }}
                          disabled={isBusy || isPicking}
                          onClick={() => void handleInitiateRelink(root)}
                        >
                          {t.relinkActionBtn}
                        </button>
                      </div>
                    )}

                    {isConfirmingRemove && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--semantic-rose-bg)",
                          border: "1px solid rgba(251, 113, 133, 0.35)",
                          fontSize: 11,
                        }}
                      >
                        <span style={{ color: "var(--text-primary)" }}>
                          {t.confirmRemoveText}
                        </span>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="vx-btn"
                            style={{ height: 24, fontSize: 11 }}
                            disabled={isBusy}
                            onClick={() => setPendingRemoveId(null)}
                          >
                            {t.cancelBtn}
                          </button>
                          <button
                            type="button"
                            className="vx-btn vx-btn-danger"
                            style={{ height: 24, fontSize: 11 }}
                            disabled={isBusy}
                            onClick={() => void handleConfirmRemove(root.id)}
                          >
                            {t.confirmRemoveBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="vx-modal-footer">
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {t.footerSummary(
              watchedRoots.length,
              formatNumber(totalFilesAllRoots, language),
              formatBytes(totalBytesAllRoots)
            )}
          </span>

          <button
            type="button"
            className="vx-btn"
            disabled={isBusy || isPicking}
            onClick={onClose}
          >
            {t.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
