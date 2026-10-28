import React from "react";
import {
  Archive,
  ChevronDown,
  Code2,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Layers,
  Music,
  Search,
  X,
} from "lucide-react";
import type { FileFilterType, SortByOption, WatchedRoot } from "../types/ipc_types";
import { formatNumber, getFolderBasename } from "../utils/formatters";

interface SearchSectionProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  filterType: FileFilterType;
  rootId: number | null;
  sortBy: SortByOption;
  watchedRoots: WatchedRoot[];
  totalMatched: number;
  tookMs: number;
  isSearching: boolean;
  onChangeQuery: (q: string) => void;
  onChangeFilterType: (t: FileFilterType) => void;
  onChangeRootId: (id: number | null) => void;
  onChangeSortBy: (s: SortByOption) => void;
  onClearAll: () => void;
}

const FILTER_CHIPS: Array<{
  id: FileFilterType;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "all", label: "Tất cả", icon: <Layers style={{ width: 13, height: 13 }} /> },
  { id: "document", label: "Tài liệu", icon: <FileText style={{ width: 13, height: 13 }} /> },
  { id: "image", label: "Ảnh", icon: <ImageIcon style={{ width: 13, height: 13 }} /> },
  { id: "video", label: "Video", icon: <Film style={{ width: 13, height: 13 }} /> },
  { id: "audio", label: "Âm thanh", icon: <Music style={{ width: 13, height: 13 }} /> },
  { id: "code", label: "Code", icon: <Code2 style={{ width: 13, height: 13 }} /> },
  { id: "archive", label: "Nén", icon: <Archive style={{ width: 13, height: 13 }} /> },
  { id: "directory", label: "Thư mục", icon: <Folder style={{ width: 13, height: 13 }} /> },
];

export const SearchSection: React.FC<SearchSectionProps> = ({
  inputRef,
  query,
  filterType,
  rootId,
  sortBy,
  watchedRoots,
  totalMatched,
  tookMs,
  isSearching,
  onChangeQuery,
  onChangeFilterType,
  onChangeRootId,
  onChangeSortBy,
  onClearAll,
}) => {
  return (
    <section className="vx-search-section">
      <div className="vx-search-input-wrap">
        <Search
          style={{
            width: 15,
            height: 15,
            color: isSearching ? "var(--accent-bright)" : "var(--text-muted)",
            flexShrink: 0,
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          placeholder="Nhập tên tệp, đường dẫn hoặc phần mở rộng (.pdf, .rs, .mp3)..."
          className="vx-search-input"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <div className="vx-search-meta">
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {formatNumber(totalMatched)} kết quả • {Number.isFinite(tookMs) ? tookMs.toFixed(2) : "0.00"}ms
          </span>
          {(query.length > 0 || filterType !== "all" || rootId !== null) && (
            <button
              type="button"
              className="vx-icon-btn"
              onClick={onClearAll}
              title="Xóa từ khóa và bộ lọc (Esc)"
              aria-label="Xóa từ khóa"
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
          <span className="vx-kbd-tag">Esc</span>
        </div>
      </div>

      <div className="vx-filter-bar">
        <div className="vx-chips-group" role="tablist" aria-label="Lọc theo loại tệp">
          {FILTER_CHIPS.map((chip) => {
            const active = filterType === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`vx-chip ${active ? "is-active" : ""}`}
                onClick={() => onChangeFilterType(chip.id)}
              >
                {chip.icon}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        <div className="vx-filter-selects">
          <div className="vx-select-wrap" title="Lọc theo thư mục gốc">
            <select
              className="vx-select"
              value={rootId === null ? "" : String(rootId)}
              onChange={(e) => {
                const val = e.target.value;
                onChangeRootId(val === "" ? null : Number(val));
              }}
              aria-label="Lọc theo thư mục theo dõi"
            >
              <option value="">Tất cả thư mục</option>
              {watchedRoots.map((root) => (
                <option key={root.id} value={String(root.id)}>
                  {root.alias || getFolderBasename(root.path)}
                </option>
              ))}
            </select>
            <ChevronDown className="vx-select-icon" style={{ width: 12, height: 12 }} />
          </div>

          <div className="vx-select-wrap" title="Sắp xếp kết quả">
            <select
              className="vx-select"
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as SortByOption)}
              aria-label="Sắp xếp kết quả"
            >
              <option value="relevance">Phù hợp nhất</option>
              <option value="modified_desc">Mới cập nhật</option>
              <option value="size_desc">Dung lượng giảm</option>
              <option value="name_asc">Tên A → Z</option>
            </select>
            <ChevronDown className="vx-select-icon" style={{ width: 12, height: 12 }} />
          </div>
        </div>
      </div>
    </section>
  );
};
