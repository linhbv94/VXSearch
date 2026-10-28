import React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ToastItem } from "../types/ipc_types";

interface ToastContainerProps {
  toasts: ToastItem[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="vx-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => {
        let color = "var(--semantic-emerald)";
        let borderColor = "rgba(52, 211, 153, 0.3)";
        let icon = <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0 }} />;

        if (toast.type === "warning") {
          color = "var(--semantic-amber)";
          borderColor = "rgba(251, 191, 36, 0.35)";
          icon = <TriangleAlert style={{ width: 14, height: 14, flexShrink: 0 }} />;
        } else if (toast.type === "error") {
          color = "var(--semantic-rose)";
          borderColor = "rgba(251, 113, 133, 0.35)";
          icon = <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />;
        } else if (toast.type === "info") {
          color = "var(--accent-bright)";
          borderColor = "var(--accent-border)";
          icon = <Info style={{ width: 14, height: 14, flexShrink: 0 }} />;
        }

        return (
          <div
            key={toast.id}
            className="vx-toast glass-panel"
            style={{ color, borderColor }}
          >
            {icon}
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};
