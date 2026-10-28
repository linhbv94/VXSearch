import React from "react";
import type { SystemStatus } from "../types/ipc_types";
import { formatBytes, formatNumber } from "../utils/formatters";

interface StatusFooterProps {
  systemStatus: SystemStatus;
  isBrowserPreview: boolean;
  isScanning: boolean;
}

export const StatusFooter: React.FC<StatusFooterProps> = ({
  systemStatus,
  isBrowserPreview,
  isScanning,
}) => {
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
            {formatNumber(systemStatus.total_roots)}
          </strong>{" "}
          thư mục •{" "}
          <strong className="font-mono" style={{ color: "var(--text-secondary)" }}>
            {formatNumber(systemStatus.total_files)}
          </strong>{" "}
          tệp ({formatBytes(systemStatus.total_size_bytes)}) • Chỉ mục{" "}
          <span className="font-mono">{formatBytes(systemStatus.db_size_bytes)}</span> •{" "}
          {isBrowserPreview
            ? "Mở bản desktop để chọn thư mục và tìm tệp."
            : isScanning
              ? "Đang lập chỉ mục..."
              : "Sẵn sàng"}
        </span>
      </div>

      <div className="vx-footer-right">
        <span>
          <span className="vx-kbd-tag">↑↓</span> Chọn
        </span>
        <span>
          <span className="vx-kbd-tag">↵</span> Mở
        </span>
        <span>
          <span className="vx-kbd-tag">{modKey}↵</span> Vị trí
        </span>
        <span>
          <span className="vx-kbd-tag">{modKey}C</span> Chép
        </span>
        <span>
          <span className="vx-kbd-tag">Esc</span> Xóa/Ẩn
        </span>
      </div>
    </footer>
  );
};
