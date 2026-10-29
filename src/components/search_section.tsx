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
import { type AppLanguage, translations } from "../i18n/translations";

interface SearchSectionProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  language?: AppLanguage;
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

const FILTER_CHIP_ICONS: Array<{
  id: FileFilterType;
  icon: React.ReactNode;
}> = [
  { id: "all", icon: <Layers style={{ width: 13, height: 13 }} /> },
  { id: "document", icon: <FileText style={{ width: 13, height: 13 }} /> },
  { id: "image", icon: <ImageIcon style={{ width: 13, height: 13 }} /> },
  { id: "video", icon: <Film style={{ width: 13, height: 13 }} /> },
  { id: "audio", icon: <Music style={{ width: 13, height: 13 }} /> },
  { id: "code", icon: <Code2 style={{ width: 13, height: 13 }} /> },
  { id: "archive", icon: <Archive style={{ width: 13, height: 13 }} /> },
  { id: "directory", icon: <Folder style={{ width: 13, height: 13 }} /> },
];

export const SearchSection: React.FC<SearchSectionProps> = ({
  inputRef,
  language = "vi",
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
  const t = translations[language].searchSection;

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
          placeholder={t.placeholder}
          className="vx-search-input"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <div className="vx-search-meta">
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {t.resultsMeta(
              formatNumber(totalMatched, language),
              Number.isFinite(tookMs) ? tookMs.toFixed(2) : "0.00"
            )}
          </span>
          {(query.length > 0 || filterType !== "all" || rootId !== null) && (
            <button
              type="button"
              className="vx-icon-btn"
              onClick={onClearAll}
              title={t.clearTitle}
              aria-label={t.clearAria}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
          <span className="vx-kbd-tag">Esc</span>
        </div>
      </div>

      <div className="vx-filter-bar">
        <div className="vx-chips-group" role="tablist" aria-label={t.filterTablistAria}>
          {FILTER_CHIP_ICONS.map((chip) => {
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
                <span>{t.chips[chip.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="vx-filter-selects">
          <div className="vx-select-wrap" title={t.filterByRootTitle}>
            <select
              className="vx-select"
              value={rootId === null ? "" : String(rootId)}
              onChange={(e) => {
                const val = e.target.value;
                onChangeRootId(val === "" ? null : Number(val));
              }}
              aria-label={t.filterByRootAria}
            >
              <option value="">{t.allFoldersOption}</option>
              {watchedRoots.map((root) => (
                <option key={root.id} value={String(root.id)}>
                  {root.alias || getFolderBasename(root.path)}
                </option>
              ))}
            </select>
            <ChevronDown className="vx-select-icon" style={{ width: 12, height: 12 }} />
          </div>

          <div className="vx-select-wrap" title={t.sortTitle}>
            <select
              className="vx-select"
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as SortByOption)}
              aria-label={t.sortAria}
            >
              <option value="relevance">{t.sortOptions.relevance}</option>
              <option value="modified_desc">{t.sortOptions.modified_desc}</option>
              <option value="size_desc">{t.sortOptions.size_desc}</option>
              <option value="name_asc">{t.sortOptions.name_asc}</option>
            </select>
            <ChevronDown className="vx-select-icon" style={{ width: 12, height: 12 }} />
          </div>
        </div>
      </div>
    </section>
  );
};
