import React, { useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  File,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Music,
  RefreshCw,
  SearchX,
} from "lucide-react";
import type {
  FileFilterType,
  ScanProgressPayload,
  SearchResultItem,
  WatchedRoot,
} from "../types/ipc_types";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
  splitHighlightSegments,
  truncateMiddlePath,
} from "../utils/formatters";

interface ResultListProps {
  items: SearchResultItem[];
  totalMatched: number;
  pageOffset: number;
  pageSize: number;
  selectedIndex: number;
  query: string;
  filterType: FileFilterType;
  rootId: number | null;
  watchedRoots: WatchedRoot[];
  isSearching: boolean;
  isAnyScanning: boolean;
  scanProgress: ScanProgressPayload | null;
  searchError: string | null;
  hotkeyError: string | null;
  isBrowserPreview: boolean;
  platform: string;
  onSelectIndex: (idx: number) => void;
  onOpenItem: (item: SearchResultItem) => void;
  onRevealItem: (item: SearchResultItem) => void;
  onCopyPath: (item: SearchResultItem) => void;
  onPageChange: (nextOffset: number) => void;
  onResetFilters: () => void;
  onOpenFolderManager: () => void;
}

function renderFileIcon(item: SearchResultItem): React.ReactNode {
  if (item.is_directory || item.file_type === "directory") {
    return <Folder className="icon-dir" style={{ width: 16, height: 16, flexShrink: 0 }} />;
  }
  switch (item.file_type) {
    case "document":
      return <FileText className="icon-doc" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    case "image":
      return <ImageIcon className="icon-img" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    case "video":
      return <Film className="icon-video" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    case "audio":
      return <Music className="icon-audio" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    case "code":
      return <Code2 className="icon-code" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    case "archive":
      return <Archive className="icon-archive" style={{ width: 16, height: 16, flexShrink: 0 }} />;
    default:
      return <File className="icon-other" style={{ width: 16, height: 16, flexShrink: 0 }} />;
  }
}

export const ResultList: React.FC<ResultListProps> = ({
  items,
  totalMatched,
  pageOffset,
  pageSize,
  selectedIndex,
  query,
  filterType,
  rootId,
  watchedRoots,
  isSearching,
  isAnyScanning,
  scanProgress,
  searchError,
  hotkeyError,
  isBrowserPreview,
  platform,
  onSelectIndex,
  onOpenItem,
  onRevealItem,
  onCopyPath,
  onPageChange,
  onResetFilters,
  onOpenFolderManager,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const isMac = !platform.toLowerCase().includes("win");
  const modSymbol = isMac ? "⌘" : "Ctrl+";

  const rootMap = useMemo(() => {
    const map = new Map<number, WatchedRoot>();
    for (const r of watchedRoots) {
      map.set(r.id, r);
    }
    return map;
  }, [watchedRoots]);

  useEffect(() => {
    const activeEl = rowRefs.current[selectedIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, items.length, pageOffset]);

  const unavailableRoots = useMemo(
    () =>
      watchedRoots.filter((r) => {
        const st = r.status.toUpperCase();
        return (
          st.includes("OFFLINE") ||
          st.includes("ERROR") ||
          st.includes("MISSING") ||
          st.includes("UNAVAILABLE")
        );
      }),
    [watchedRoots]
  );

  const currentPage = Math.floor(pageOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
  const hasPrevPage = pageOffset > 0;
  const hasNextPage = pageOffset + pageSize < totalMatched;
  const rangeStart = totalMatched === 0 ? 0 : pageOffset + 1;
  const rangeEnd = Math.min(totalMatched, pageOffset + items.length);

  return (
    <main className="vx-content-area">
      {isBrowserPreview && (
        <div className="vx-banner is-warning">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Info style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>Mở bản desktop để chọn thư mục và tìm tệp.</span>
          </div>
          <button type="button" className="vx-chrome-btn" onClick={onOpenFolderManager}>
            Thư mục theo dõi
          </button>
        </div>
      )}

      {hotkeyError && (
        <div className="vx-banner is-warning">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>Lưu ý phím tắt: {hotkeyError}</span>
          </div>
        </div>
      )}

      {searchError && (
        <div className="vx-banner is-error">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{searchError}</span>
          </div>
        </div>
      )}

      {(isAnyScanning || scanProgress) && (
        <div className="vx-banner is-scanning">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <RefreshCw style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Đang lập chỉ mục:{" "}
              {scanProgress?.current_path
                ? truncateMiddlePath(scanProgress.current_path, 52)
                : "Đang duyệt cây thư mục..."}
            </span>
          </div>
          {scanProgress && (
            <span className="font-mono" style={{ flexShrink: 0, fontWeight: 600 }}>
              Đã ghi nhận: {formatNumber(scanProgress.scanned_count)} tệp
            </span>
          )}
        </div>
      )}

      {unavailableRoots.length > 0 && (
        <div className="vx-banner is-warning">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {unavailableRoots.length === 1 && unavailableRoots[0].error_message
                ? `Thư mục hiện không khả dụng: ${unavailableRoots[0].error_message}`
                : `Có ${unavailableRoots.length} thư mục hiện không khả dụng. Chỉ mục được giữ nguyên.`}
            </span>
          </div>
          <button type="button" className="vx-chrome-btn" onClick={onOpenFolderManager}>
            Kiểm tra
          </button>
        </div>
      )}

      {items.length > 0 ? (
        <>
          <div className="vx-table-header">
            <span>Tên tệp & định dạng</span>
            <span>Thư mục cha</span>
            <span style={{ textAlign: "right" }}>Dung lượng</span>
            <span style={{ textAlign: "right" }}>Cập nhật</span>
            <span style={{ textAlign: "right" }}>Thao tác</span>
          </div>

          <div
            ref={scrollContainerRef}
            className="vx-results-scroll"
            role="listbox"
            tabIndex={-1}
            aria-label="Danh sách kết quả tìm kiếm"
          >
            {items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const nameSegments = splitHighlightSegments(item.name, query);
              const parentRoot = rootMap.get(item.root_id);
              const rootErrorDetail = parentRoot?.error_message;
              const unavailableTooltip = rootErrorDetail
                ? `Thư mục hiện không khả dụng (${rootErrorDetail})`
                : "Thư mục hiện không khả dụng — không thể mở/định vị tệp";

              return (
                <div
                  key={`${item.id}-${item.path}`}
                  ref={(el) => {
                    rowRefs.current[idx] = el;
                  }}
                  role="option"
                  aria-selected={isSelected}
                  className={`vx-result-row ${isSelected ? "is-selected" : ""} ${
                    item.is_offline ? "is-offline" : ""
                  }`}
                  onClick={() => onSelectIndex(idx)}
                  onDoubleClick={() => {
                    if (!item.is_offline) {
                      onOpenItem(item);
                    }
                  }}
                >
                  <div className="vx-cell-name">
                    {renderFileIcon(item)}
                    <div className="vx-file-name-wrap">
                      <div className="vx-file-name" title={item.name}>
                        {nameSegments.map((seg, sIdx) =>
                          seg.matched ? (
                            <mark key={sIdx} className="vx-highlight">
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={sIdx}>{seg.text}</span>
                          )
                        )}
                      </div>
                      {item.is_offline && (
                        <span
                          className="vx-offline-tag"
                          title={rootErrorDetail || "Thư mục hiện không khả dụng"}
                        >
                          <AlertTriangle style={{ width: 10, height: 10 }} />
                          Thư mục hiện không khả dụng
                          {rootErrorDetail ? ` • ${truncateMiddlePath(rootErrorDetail, 28)}` : ""}
                        </span>
                      )}
                    </div>
                    {isSelected && <span className="vx-selected-dot" />}
                  </div>

                  <div className="vx-cell-path" title={item.parent_dir}>
                    {truncateMiddlePath(item.parent_dir, 42)}
                  </div>

                  <div className="vx-cell-size">
                    {item.is_directory ? "Thư mục" : formatBytes(item.size_bytes)}
                  </div>

                  <div className="vx-cell-date">{formatTimestamp(item.modified_at)}</div>

                  <div
                    className="vx-cell-actions"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="vx-icon-btn vx-tooltip-btn"
                      disabled={item.is_offline}
                      data-tooltip={
                        item.is_offline ? unavailableTooltip : "Mở tệp (Enter)"
                      }
                      aria-label="Mở tệp"
                      onClick={() => onOpenItem(item)}
                    >
                      <ExternalLink style={{ width: 14, height: 14 }} />
                    </button>

                    <button
                      type="button"
                      className="vx-icon-btn vx-tooltip-btn"
                      disabled={item.is_offline}
                      data-tooltip={
                        item.is_offline
                          ? unavailableTooltip
                          : `Hiện vị trí tệp (${modSymbol}↵)`
                      }
                      aria-label="Hiện vị trí tệp"
                      onClick={() => onRevealItem(item)}
                    >
                      <FolderOpen style={{ width: 14, height: 14 }} />
                    </button>

                    <button
                      type="button"
                      className="vx-icon-btn vx-tooltip-btn"
                      data-tooltip={`Chép đường dẫn (${modSymbol}C)`}
                      aria-label="Chép đường dẫn"
                      onClick={() => onCopyPath(item)}
                    >
                      <Copy style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="vx-pagination-bar">
            <span>
              Trang{" "}
              <strong className="font-mono" style={{ color: "var(--text-primary)" }}>
                {formatNumber(currentPage)}
              </strong>{" "}
              /{" "}
              <strong className="font-mono" style={{ color: "var(--text-primary)" }}>
                {formatNumber(totalPages)}
              </strong>{" "}
              • Hiển thị{" "}
              <strong className="font-mono" style={{ color: "var(--text-primary)" }}>
                {formatNumber(rangeStart)}–{formatNumber(rangeEnd)}
              </strong>{" "}
              trên tổng{" "}
              <strong className="font-mono" style={{ color: "var(--text-primary)" }}>
                {formatNumber(totalMatched)}
              </strong>{" "}
              kết quả
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="vx-btn"
                style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                disabled={!hasPrevPage || isSearching}
                onClick={() => onPageChange(Math.max(0, pageOffset - pageSize))}
              >
                <ChevronLeft style={{ width: 13, height: 13 }} />
                <span>Trang trước</span>
              </button>

              <button
                type="button"
                className="vx-btn"
                style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                disabled={!hasNextPage || isSearching}
                onClick={() => onPageChange(pageOffset + pageSize)}
              >
                <span>Trang sau</span>
                <ChevronRight style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="vx-empty-state">
          {watchedRoots.length === 0 ? (
            <>
              <div className="vx-empty-icon-circle">
                <FolderPlus style={{ width: 20, height: 20 }} />
              </div>
              <div className="vx-empty-title">
                {isBrowserPreview
                  ? "Mở bản desktop để chọn thư mục và tìm tệp."
                  : "Chưa có thư mục nào trong danh sách theo dõi"}
              </div>
              {!isBrowserPreview && (
                <p className="vx-empty-desc">
                  VXSearch chỉ lập chỉ mục tên và đường dẫn trong các thư mục bạn chủ động chọn.
                </p>
              )}
              <button
                type="button"
                className="vx-btn vx-btn-primary"
                onClick={onOpenFolderManager}
              >
                <FolderPlus style={{ width: 14, height: 14 }} />
                <span>Mở quản lý thư mục theo dõi</span>
              </button>
            </>
          ) : (
            <>
              <div className="vx-empty-icon-circle">
                <SearchX style={{ width: 20, height: 20 }} />
              </div>
              <div className="vx-empty-title">
                {query.trim()
                  ? `Không tìm thấy tệp nào khớp với "${query}"`
                  : "Không có tệp nào khớp với bộ lọc hiện tại"}
              </div>
              <p className="vx-empty-desc">
                Kiểm tra lại từ khóa, ký tự mở rộng (ví dụ <code className="font-mono">.pdf</code>,{" "}
                <code className="font-mono">.rs</code>), chuyển bộ lọc sang <strong>Tất cả</strong>{" "}
                hoặc thêm thư mục chứa tệp vào danh sách theo dõi.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(query.trim() !== "" || filterType !== "all" || rootId !== null) && (
                  <button type="button" className="vx-btn" onClick={onResetFilters}>
                    Xóa bộ lọc tìm kiếm
                  </button>
                )}
                <button
                  type="button"
                  className="vx-btn vx-btn-primary"
                  onClick={onOpenFolderManager}
                >
                  <FolderOpen style={{ width: 14, height: 14 }} />
                  <span>Quản lý thư mục theo dõi</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
};
