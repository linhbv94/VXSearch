import type { AppError } from "../types/ipc_types";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || Number.isNaN(num)) return "0";
  return num.toLocaleString("vi-VN");
}

export function formatTimestamp(epochSecondsOrMs: number | null | undefined): string {
  if (!epochSecondsOrMs || epochSecondsOrMs <= 0) return "—";
  const ms = epochSecondsOrMs < 1e11 ? epochSecondsOrMs * 1000 : epochSecondsOrMs;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function truncateMiddlePath(pathStr: string, maxLen = 46): string {
  if (!pathStr) return "";
  if (pathStr.length <= maxLen) return pathStr;
  const keepStart = Math.ceil((maxLen - 3) * 0.4);
  const keepEnd = Math.floor((maxLen - 3) * 0.6);
  return `${pathStr.slice(0, keepStart)}...${pathStr.slice(pathStr.length - keepEnd)}`;
}

export function getFolderBasename(pathStr: string): string {
  if (!pathStr) return "";
  const cleaned = pathStr.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || pathStr;
}

export function normalizeVietnamese(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

export function splitHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  if (!text) return [];
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => normalizeVietnamese(t));

  if (tokens.length === 0) {
    return [{ text, matched: false }];
  }

  const normText = normalizeVietnamese(text);
  const matchFlags = new Array<boolean>(text.length).fill(false);

  for (const token of tokens) {
    if (!token) continue;
    let startIndex = 0;
    while (startIndex < normText.length) {
      const idx = normText.indexOf(token, startIndex);
      if (idx === -1) break;
      for (let i = idx; i < idx + token.length && i < matchFlags.length; i++) {
        matchFlags[i] = true;
      }
      startIndex = idx + Math.max(1, token.length);
    }
  }

  const segments: HighlightSegment[] = [];
  let currentMatched = matchFlags[0] ?? false;
  let currentStart = 0;

  for (let i = 1; i < text.length; i++) {
    if (matchFlags[i] !== currentMatched) {
      segments.push({
        text: text.slice(currentStart, i),
        matched: currentMatched,
      });
      currentMatched = matchFlags[i];
      currentStart = i;
    }
  }
  segments.push({
    text: text.slice(currentStart),
    matched: currentMatched,
  });

  return segments;
}

export function parseAppError(err: unknown): AppError {
  if (!err) {
    return {
      code: "E_UNKNOWN",
      message: "Đã xảy ra lỗi không xác định.",
      details: null,
    };
  }

  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.code === "string" && typeof obj.message === "string") {
      return {
        code: obj.code,
        message: obj.message,
        details:
          obj.details && typeof obj.details === "object"
            ? (obj.details as Record<string, unknown>)
            : null,
      };
    }
    if (typeof obj.message === "string") {
      try {
        const parsed = JSON.parse(obj.message) as Record<string, unknown>;
        if (typeof parsed.code === "string" && typeof parsed.message === "string") {
          return {
            code: parsed.code,
            message: parsed.message,
            details:
              parsed.details && typeof parsed.details === "object"
                ? (parsed.details as Record<string, unknown>)
                : null,
          };
        }
      } catch {
        // Ignore JSON parse failure
      }
      return {
        code: typeof obj.code === "string" ? obj.code : "E_ERROR",
        message: obj.message,
        details: null,
      };
    }
  }

  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err) as Record<string, unknown>;
      if (typeof parsed.code === "string" && typeof parsed.message === "string") {
        return {
          code: parsed.code,
          message: parsed.message,
          details:
            parsed.details && typeof parsed.details === "object"
              ? (parsed.details as Record<string, unknown>)
              : null,
        };
      }
    } catch {
      // Plain string error
    }
    return {
      code: "E_STRING",
      message: err,
      details: null,
    };
  }

  return {
    code: "E_UNKNOWN",
    message: String(err),
    details: null,
  };
}
