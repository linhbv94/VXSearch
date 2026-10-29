import {AppUpdates} from './components/app_updates';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuickSearchHandoff } from "./services/use_quick_search_handoff";
import { FolderManagerModal } from "./components/folder_manager_modal";
import { ResultList } from "./components/result_list";
import { SearchSection } from "./components/search_section";
import { SettingsModal } from "./components/settings_modal";
import { StatusFooter } from "./components/status_footer";
import { TitleBar } from "./components/title_bar";
import { ToastContainer } from "./components/toast_container";
import {
  detectInitialPlatform,
  getDefaultSettings,
  ipcCopyFilePath,
  ipcGetSettings,
  ipcGetSystemStatus,
  ipcGetWatchedRoots,
  ipcHideWindow,
  ipcOpenFile,
  ipcRevealFile,
  ipcSearchFiles,
  isTauriRuntime,
  subscribeNativeEvents,
} from "./services/tauri_ipc";
import type {
  AppSettings,
  FileFilterType,
  ScanProgressPayload,
  SearchResultItem,
  SortByOption,
  SystemStatus,
  ToastItem,
  ToastType,
  WatchedRoot,
} from "./types/ipc_types";
import { parseAppError } from "./utils/formatters";

import {type AppLanguage, type ExtendedThemeMode, normalizeLanguage, normalizeExtendedTheme} from './i18n/translations';
import {ipcSetAppLanguage} from './services/tauri_ipc';
const PAGE_SIZE = 50;

function isSearchNavigationTarget(
  target: EventTarget | null,
  searchInput: HTMLInputElement | null
): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return true;
  }
  if (target === searchInput) {
    return true;
  }
  if (target === document.body || target === document.documentElement) {
    return true;
  }
  const tagName = target.tagName.toUpperCase();
  if (
    tagName === "BUTTON" ||
    tagName === "SELECT" ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "A"
  ) {
    return false;
  }
  if (target.closest("button, select, input, textarea, a")) {
    return false;
  }
  return Boolean(target.closest(".vx-results-scroll"));
}

export const App: React.FC = () => {
  const isBrowserPreview = !isTauriRuntime();
  const initialPlatform = detectInitialPlatform();

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    total_roots: 0,
    total_files: 0,
    total_size_bytes: 0,
    db_size_bytes: 0,
    is_any_scanning: false,
    platform: initialPlatform,
    app_version: "0.1.0",
    hotkey_error: null,
  });

  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedTheme = localStorage.getItem("vxsearch_theme");
    const defaults = getDefaultSettings(initialPlatform);
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") {
      defaults.theme = savedTheme;
    }
    return defaults;
  });

  const [language, setLanguage] = useState<AppLanguage>(() => normalizeLanguage(localStorage.getItem('vxsearch_lang')));
  const [themeMode, setThemeMode] = useState<ExtendedThemeMode>(() => normalizeExtendedTheme(localStorage.getItem('vxsearch_theme')));
  useEffect(() => {
    localStorage.setItem('vxsearch_lang', language);
    document.documentElement.lang = language;
    void ipcSetAppLanguage(language).catch(console.error);
  }, [language]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if(e.key === 'vxsearch_lang') setLanguage(normalizeLanguage(e.newValue));
      if(e.key === 'vxsearch_theme') setThemeMode(normalizeExtendedTheme(e.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const [query, setQuery] = useState("");
  const [handoffRevision, setHandoffRevision] = useState(0);
  const [filterType, setFilterType] = useState<FileFilterType>("all");
  const [rootId, setRootId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortByOption>("relevance");
  const [pageOffset, setPageOffset] = useState(0);

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [tookMs, setTookMs] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressPayload | null>(null);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchGenerationRef = useRef(0);
  const lastStateSignatureRef = useRef<string>("");
  const invalidateTimerRef = useRef<number | null>(null);
  const pickerBusyRef = useRef(false);

  // Refs for latest values inside event/poll callbacks
  const queryRef = useRef(query);
  queryRef.current = query;
  const filterTypeRef = useRef(filterType);
  filterTypeRef.current = filterType;
  const rootIdRef = useRef(rootId);
  rootIdRef.current = rootId;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;
  const pageOffsetRef = useRef(pageOffset);
  pageOffsetRef.current = pageOffset;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const folderModalOpenRef = useRef(folderModalOpen);
  folderModalOpenRef.current = folderModalOpen;
  const settingsModalOpenRef = useRef(settingsModalOpen);
  settingsModalOpenRef.current = settingsModalOpen;

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Theme application (dark / light / system)
  useEffect(() => {
    localStorage.setItem("vxsearch_theme", themeMode);
    const rootEl = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const effectiveDark =
        themeMode === "dark" || themeMode === "oled" ||
        (themeMode === "system" && mediaQuery.matches);
      rootEl.classList.remove("dark", "light", "oled");
      if(themeMode === "oled") rootEl.classList.add("oled");
      rootEl.classList.add(effectiveDark ? "dark" : "light");
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => {
      mediaQuery.removeEventListener("change", applyTheme);
    };
  }, [themeMode]);

  const executeSearch = useCallback(
    async (
      q: string,
      fType: FileFilterType,
      rId: number | null,
      sBy: SortByOption,
      offset: number,
      preserveSelection: boolean
    ) => {
      let currentGen = ++searchGenerationRef.current;
      setIsSearching(true);
      try {
        const res = await ipcSearchFiles({
          query: q,
          filter_type: fType,
          root_id: rId,
          sort_by: sBy,
          limit: PAGE_SIZE,
          offset,
        });
        if (currentGen !== searchGenerationRef.current) return;

        // If current page became empty after deletions while earlier pages still have items, step back to last valid page
        if (offset > 0 && res.items.length === 0 && res.total_matched > 0) {
          const validOffset = Math.max(
            0,
            Math.floor((res.total_matched - 1) / PAGE_SIZE) * PAGE_SIZE
          );
          setPageOffset(validOffset);
          pageOffsetRef.current = validOffset;
          currentGen = ++searchGenerationRef.current;
          const retryRes = await ipcSearchFiles({
            query: q,
            filter_type: fType,
            root_id: rId,
            sort_by: sBy,
            limit: PAGE_SIZE,
            offset: validOffset,
          });
          if (currentGen !== searchGenerationRef.current) return;
          setResults(retryRes.items);
          setTotalMatched(retryRes.total_matched);
          setTookMs(retryRes.took_ms);
          setSearchError(null);
          setSelectedIndex(Math.max(0, retryRes.items.length - 1));
          return;
        }

        setResults(res.items);
        setTotalMatched(res.total_matched);
        setTookMs(res.took_ms);
        setSearchError(null);
        setSelectedIndex((prev) => {
          if (!preserveSelection) return 0;
          if (res.items.length === 0) return 0;
          return Math.min(prev, res.items.length - 1);
        });
      } catch (err) {
        if (currentGen !== searchGenerationRef.current) return;
        const appErr = parseAppError(err);
        setSearchError(appErr.message);
        setResults([]);
        setTotalMatched(0);
      } finally {
        if (currentGen === searchGenerationRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  // Handlers that immediately invalidate in-flight search generation before debounce
  const handleQueryChange = useCallback((nextQuery: string) => {
    ++searchGenerationRef.current;
    setQuery(nextQuery);
    setPageOffset(0);
    pageOffsetRef.current = 0;
    setSelectedIndex(0);
  }, []);

  const handleFilterTypeChange = useCallback((nextType: FileFilterType) => {
    ++searchGenerationRef.current;
    setFilterType(nextType);
    setPageOffset(0);
    pageOffsetRef.current = 0;
    setSelectedIndex(0);
  }, []);

  const handleRootIdChange = useCallback((nextRootId: number | null) => {
    ++searchGenerationRef.current;
    setRootId(nextRootId);
    setPageOffset(0);
    pageOffsetRef.current = 0;
    setSelectedIndex(0);
  }, []);

  const handleSortByChange = useCallback((nextSortBy: SortByOption) => {
    ++searchGenerationRef.current;
    setSortBy(nextSortBy);
    setPageOffset(0);
    pageOffsetRef.current = 0;
    setSelectedIndex(0);
  }, []);

  const handleResetFilters = useCallback(() => {
    ++searchGenerationRef.current;
    setQuery("");
    setFilterType("all");
    setRootId(null);
    setPageOffset(0);
    pageOffsetRef.current = 0;
    setSelectedIndex(0);
    searchInputRef.current?.focus();
  }, []);

  useQuickSearchHandoff((nextQuery) => {
    handleResetFilters();
    handleQueryChange(nextQuery);
    setSortBy("relevance");
    setFolderModalOpen(false);
    setSettingsModalOpen(false);
    setHandoffRevision(revision => revision + 1);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  });

  const handlePageChange = useCallback(
    (nextOffset: number) => {
      const clamped = Math.max(0, nextOffset);
      setPageOffset(clamped);
      pageOffsetRef.current = clamped;
      setSelectedIndex(0);
      void executeSearch(
        queryRef.current,
        filterTypeRef.current,
        rootIdRef.current,
        sortByRef.current,
        clamped,
        false
      );
    },
    [executeSearch]
  );

  const refreshStatusAndRoots = useCallback(
    async (forceSearchRefresh = false) => {
      try {
        const [statusRes, rootsRes] = await Promise.all([
          ipcGetSystemStatus(),
          ipcGetWatchedRoots(),
        ]);
        setSystemStatus(statusRes);
        setWatchedRoots(rootsRes);

        if (!statusRes.is_any_scanning) {
          setScanProgress(null);
        }

        const signature = JSON.stringify({
          files: statusRes.total_files,
          roots: statusRes.total_roots,
          scanning: statusRes.is_any_scanning,
          rootStates: rootsRes.map((r) => `${r.id}:${r.status}:${r.total_files}:${r.error_message || ""}`),
        });

        const stateChanged = lastStateSignatureRef.current !== signature;
        lastStateSignatureRef.current = signature;

        if (forceSearchRefresh || stateChanged) {
          await executeSearch(
            queryRef.current,
            filterTypeRef.current,
            rootIdRef.current,
            sortByRef.current,
            pageOffsetRef.current,
            true
          );
        }
      } catch (err) {
        const appErr = parseAppError(err);
        setSearchError(appErr.message);
      }
    },
    [executeSearch]
  );

  const reloadSettingsFromBackend = useCallback(async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        ipcGetSettings(),
        ipcGetSystemStatus(),
      ]);
      setSettings(settingsRes);
      setSystemStatus(statusRes);
    } catch {
      // Ignore background reload error
    }
  }, []);

  const tryFocusAndSelectSearchInput = useCallback(() => {
    if (
      settingsRef.current.auto_select_input &&
      !folderModalOpenRef.current &&
      !settingsModalOpenRef.current &&
      !pickerBusyRef.current &&
      searchInputRef.current
    ) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const [statusRes, rootsRes, settingsRes] = await Promise.all([
          ipcGetSystemStatus(),
          ipcGetWatchedRoots(),
          ipcGetSettings(),
        ]);
        if (!mounted) return;
        setSystemStatus(statusRes);
        setWatchedRoots(rootsRes);
        setSettings(settingsRes);
        lastStateSignatureRef.current = JSON.stringify({
          files: statusRes.total_files,
          roots: statusRes.total_roots,
          scanning: statusRes.is_any_scanning,
          rootStates: rootsRes.map((r) => `${r.id}:${r.status}:${r.total_files}:${r.error_message || ""}`),
        });
      } catch (err) {
        if (!mounted) return;
        const appErr = parseAppError(err);
        setSearchError(appErr.message);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  // Debounced search on query / filter / root / sort change (resets to offset 0)
  useEffect(() => {
    const delay = query.trim().length > 0 ? Math.max(30, settings.debounce_ms) : 0;
    const timer = window.setTimeout(() => {
      void executeSearch(query, filterType, rootId, sortBy, 0, false);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query, filterType, rootId, sortBy, settings.debounce_ms, executeSearch, handoffRevision]);

  // Native Tauri events subscription + 3s poll fallback
  useEffect(() => {
    const scheduleInvalidate = () => {
      if (invalidateTimerRef.current) return;
      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        void refreshStatusAndRoots(true);
      }, 220);
    };

    const cleanupEvents = subscribeNativeEvents({
      onIndexChanged: () => {
        scheduleInvalidate();
      },
      onRootStatusChanged: () => {
        scheduleInvalidate();
      },
      onScanCompleted: () => {
        setScanProgress(null);
        scheduleInvalidate();
      },
      onScanProgress: (payload) => {
        setScanProgress(payload);
      },
      onSearchFocus: () => {
        tryFocusAndSelectSearchInput();
      },
      onOpenPanel: (panel) => {
        if (panel === "folders") {
          setSettingsModalOpen(false);
          setFolderModalOpen(true);
        } else if (panel === "settings") {
          setFolderModalOpen(false);
          setSettingsModalOpen(true);
        }
      },
      onSettingsChanged: () => {
        void reloadSettingsFromBackend();
      },
    });

    const pollInterval = window.setInterval(() => {
      void refreshStatusAndRoots(false);
    }, 3000);

    return () => {
      cleanupEvents();
      window.clearInterval(pollInterval);
      if (invalidateTimerRef.current) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
    };
  }, [
    refreshStatusAndRoots,
    reloadSettingsFromBackend,
    tryFocusAndSelectSearchInput,
  ]);

  // Focus & auto-select search input when window gains focus (No auto-hide on blur!)
  useEffect(() => {
    const handleWindowFocus = () => {
      tryFocusAndSelectSearchInput();
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [tryFocusAndSelectSearchInput]);

  const handleOpenItem = useCallback(
    async (item: SearchResultItem) => {
      if (item.is_offline) {
        addToast("warning", language === "vi" ? "Thư mục hiện không khả dụng — không thể mở tệp." : "Folder unavailable — cannot open file.");
        return;
      }
      try {
        await ipcOpenFile(item.path);
      } catch (err) {
        const appErr = parseAppError(err);
        addToast("error", appErr.message);
        void refreshStatusAndRoots(true);
      }
    },
    [addToast, refreshStatusAndRoots, language]
  );

  const handleRevealItem = useCallback(
    async (item: SearchResultItem) => {
      if (item.is_offline) {
        addToast("warning", language === "vi" ? "Thư mục hiện không khả dụng — không thể định vị tệp." : "Folder unavailable — cannot reveal file.");
        return;
      }
      try {
        await ipcRevealFile(item.path);
      } catch (err) {
        const appErr = parseAppError(err);
        addToast("error", appErr.message);
        void refreshStatusAndRoots(true);
      }
    },
    [addToast, refreshStatusAndRoots, language]
  );

  const handleCopyPath = useCallback(
    async (item: SearchResultItem) => {
      try {
        await ipcCopyFilePath(item.path);
        addToast("success", language === "vi" ? `Đã chép đường dẫn: ${item.name}` : `Copied path: ${item.name}`);
      } catch (err) {
        const appErr = parseAppError(err);
        addToast("error", appErr.message);
      }
    },
    [addToast, language]
  );

  // Context-aware global keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault(); setSettingsModalOpen(v => !v); return;
      }
      if (folderModalOpen || settingsModalOpen) {
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      const canNavigateList = isSearchNavigationTarget(
        e.target,
        searchInputRef.current
      );

      if (e.key === "ArrowDown" && canNavigateList) {
        if (results.length > 0) {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(results.length - 1, prev + 1));
        }
        return;
      }

      if (e.key === "ArrowUp" && canNavigateList) {
        if (results.length > 0) {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      if (e.key === "Enter" && canNavigateList) {
        const selectedItem = results[selectedIndex];
        if (selectedItem) {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            void handleRevealItem(selectedItem);
          } else {
            void handleOpenItem(selectedItem);
          }
        }
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "c" &&
        canNavigateList
      ) {
        const inputEl = searchInputRef.current;
        const hasTextSelection =
          e.target === inputEl &&
          inputEl !== null &&
          inputEl.selectionStart !== null &&
          inputEl.selectionEnd !== null &&
          inputEl.selectionStart !== inputEl.selectionEnd;

        if (!hasTextSelection && results[selectedIndex]) {
          e.preventDefault();
          void handleCopyPath(results[selectedIndex]);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (query !== "" || filterType !== "all" || rootId !== null || pageOffset > 0) {
          handleResetFilters();
        } else {
          void ipcHideWindow();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    filterType,
    folderModalOpen,
    handleCopyPath,
    handleOpenItem,
    handleResetFilters,
    handleRevealItem,
    pageOffset,
    query,
    results,
    rootId,
    selectedIndex,
    settingsModalOpen,
  ]);

  return (
    <div className="vx-app-shell">
      <TitleBar
        language={language}
        platform={systemStatus.platform}
        watchedRoots={watchedRoots}
        selectedRootId={rootId}
        closeToTray={settings.close_to_tray}
        onSelectRootFilter={handleRootIdChange}
        onOpenFolderManager={() => setFolderModalOpen(true)}
        onQuickAddFolder={() => setFolderModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onClearSearch={handleResetFilters}
        onFocusSearch={() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }}
      />

      <SearchSection
        language={language}
        inputRef={searchInputRef}
        query={query}
        filterType={filterType}
        rootId={rootId}
        sortBy={sortBy}
        watchedRoots={watchedRoots}
        totalMatched={totalMatched}
        tookMs={tookMs}
        isSearching={isSearching}
        onChangeQuery={handleQueryChange}
        onChangeFilterType={handleFilterTypeChange}
        onChangeRootId={handleRootIdChange}
        onChangeSortBy={handleSortByChange}
        onClearAll={handleResetFilters}
      />

      <ResultList
        language={language}
        items={results}
        totalMatched={totalMatched}
        pageOffset={pageOffset}
        pageSize={PAGE_SIZE}
        selectedIndex={selectedIndex}
        query={query}
        filterType={filterType}
        rootId={rootId}
        watchedRoots={watchedRoots}
        isSearching={isSearching}
        isAnyScanning={systemStatus.is_any_scanning}
        scanProgress={scanProgress}
        searchError={searchError}
        hotkeyError={systemStatus.hotkey_error}
        isBrowserPreview={isBrowserPreview}
        platform={systemStatus.platform}
        onSelectIndex={setSelectedIndex}
        onOpenItem={(item) => void handleOpenItem(item)}
        onRevealItem={(item) => void handleRevealItem(item)}
        onCopyPath={(item) => void handleCopyPath(item)}
        onPageChange={handlePageChange}
        onResetFilters={handleResetFilters}
        onOpenFolderManager={() => setFolderModalOpen(true)}
      />

      <StatusFooter
        language={language}
        systemStatus={systemStatus}
        isBrowserPreview={isBrowserPreview}
        isScanning={systemStatus.is_any_scanning || scanProgress !== null}
      />

      <FolderManagerModal
        language={language}
        isOpen={folderModalOpen}
        watchedRoots={watchedRoots}
        scanProgress={scanProgress}
        onClose={() => setFolderModalOpen(false)}
        onRefreshAll={async () => {
          await refreshStatusAndRoots(true);
        }}
        onNotify={addToast}
        onPickerBusyChange={(busy) => {
          pickerBusyRef.current = busy;
        }}
      />

      <SettingsModal
        language={language}
        themeMode={themeMode}
        onChangeLanguage={setLanguage}
        onChangeThemeMode={setThemeMode}
        isOpen={settingsModalOpen}
        settings={settings}
        systemStatus={systemStatus}
        onClose={() => setSettingsModalOpen(false)}
        onSettingsUpdated={(next) => setSettings(next)}
        onRefreshSystemStatus={async () => {
          await refreshStatusAndRoots(false);
        }}
        onNotify={addToast}
      />

      <AppUpdates notice language={language} />
      <ToastContainer toasts={toasts} />
    </div>
  );
};
