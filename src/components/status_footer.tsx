import React from "react";
import type { SystemStatus } from "../types/ipc_types";
import { formatBytes, formatNumber } from "../utils/formatters";
import { type AppLanguage, translations } from "../i18n/translations";

interface StatusFooterProps {
  language?: AppLanguage;
  systemStatus: SystemStatus;
  isBrowserPreview: boolean;
  isScanning: boolean;
}

export const StatusFooter: React.FC<StatusFooterProps> = ({
  language = "vi",
  systemStatus,
  isBrowserPreview,
  isScanning,
}) => {
  const t = translations[language].statusFooter;
  const isMac = !systemStatus.platform.toLowerCase().includes("win");
  const modKey = isMac ? "⌘" : "Ctrl+";

  return (
    <footer className="vx-status-footer">
      <div className="vx-footer-left">
        <span
          className={`vx-status-dot ${
            isBrowserPreview
              ? "is-preview"
              : isScanning
                ? "is-scanning"
                : "is-ready"
          }`}
        />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <strong className="font-mono" style={{ color: "var(--text-secondary)" }}>
            {formatNumber(systemStatus.total_roots, language)}
          </strong>{" "}
          {t.foldersUnit} •{" "}
          <strong className="font-mono" style={{ color: "var(--text-secondary)" }}>
            {formatNumber(systemStatus.total_files, language)}
          </strong>{" "}
          {t.filesUnit} ({formatBytes(systemStatus.total_size_bytes)}) • {t.indexLabel}{" "}
          <span className="font-mono">{formatBytes(systemStatus.db_size_bytes)}</span> •{" "}
          {isBrowserPreview
            ? t.browserPreview
            : isScanning
              ? t.scanning
              : t.ready}
        </span>
      </div>

      <div className="vx-footer-right">
        <span>
          <span className="vx-kbd-tag">↑↓</span> {t.selectHint}
        </span>
        <span>
          <span className="vx-kbd-tag">↵</span> {t.openHint}
        </span>
        <span>
          <span className="vx-kbd-tag">{modKey}↵</span> {t.revealHint}
        </span>
        <span>
          <span className="vx-kbd-tag">{modKey}C</span> {t.copyHint}
        </span>
        <span>
          <span className="vx-kbd-tag">Esc</span> {t.escHint}
        </span>
      </div>
    </footer>
  );
};
