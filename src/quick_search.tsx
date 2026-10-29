import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseAppError } from "./utils/formatters";
import {
  type AppLanguage,
  type ExtendedThemeMode,
  normalizeExtendedTheme,
  normalizeLanguage,
  translations,
} from "./i18n/translations";

type ThemeMode = "light" | "dark" | "system";

interface AppSettings {
  theme: ThemeMode;
  [key: string]: unknown;
}

interface QuickSearchSubmitResult {
  accepted?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function resolveEffectiveTheme(mode: ExtendedThemeMode): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark" || mode === "oled") return "dark";
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

function applyDocumentTheme(mode: ExtendedThemeMode): void {
  if (typeof document === "undefined") return;
  const effective = resolveEffectiveTheme(mode);
  const root = document.documentElement;
  root.classList.remove("light", "dark", "oled");
  root.classList.add(effective);
  if (mode === "oled") {
    root.classList.add("oled");
  }
  root.style.colorScheme = effective;
}

export const QuickSearch: React.FC = () => {
  const [language, setLanguage] = useState<AppLanguage>(() =>
    normalizeLanguage(localStorage.getItem("vxsearch_lang"))
  );
  const [query, setQuery] = useState("");
  const [themeMode, setThemeMode] = useState<ExtendedThemeMode>(() =>
    normalizeExtendedTheme(localStorage.getItem("vxsearch_theme"))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = translations[language].quickSearch;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  const focusAndSelectInput = useCallback((selectAll: boolean) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (selectAll) {
      el.select();
    }
  }, []);

  const loadThemeSettings = useCallback(async () => {
    const storedLang = normalizeLanguage(localStorage.getItem("vxsearch_lang"));
    setLanguage(storedLang);
    const storedTheme = localStorage.getItem("vxsearch_theme");
    if (storedTheme === "oled") {
      setThemeMode("oled");
      applyDocumentTheme("oled");
      return;
    }
    if (!isTauri()) return;
    try {
      const settings = await invoke<AppSettings>("get_settings");
      if (!mountedRef.current || !settings) return;
      const mode: ExtendedThemeMode =
        settings.theme === "light" ||
        settings.theme === "dark" ||
        settings.theme === "system"
          ? settings.theme
          : "system";
      setThemeMode(mode);
      applyDocumentTheme(mode);
    } catch {
      // Giữ theme mặc định nếu chưa đọc được settings
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    applyDocumentTheme(themeMode);
    return () => {
      mountedRef.current = false;
    };
  }, [themeMode]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "vxsearch_lang") {
        setLanguage(normalizeLanguage(e.newValue));
      } else if (e.key === "vxsearch_theme") {
        const nextTheme = normalizeExtendedTheme(e.newValue);
        setThemeMode(nextTheme);
        applyDocumentTheme(nextTheme);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handleMediaChange = () => {
      if (themeMode === "system") {
        applyDocumentTheme("system");
      }
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleMediaChange);
      return () => mql.removeEventListener("change", handleMediaChange);
    }
    mql.addListener(handleMediaChange);
    return () => mql.removeListener(handleMediaChange);
  }, [themeMode]);

  useEffect(() => {
    focusAndSelectInput(false);
    void loadThemeSettings();

    const handleWindowFocus = () => {
      focusAndSelectInput(true);
      void loadThemeSettings();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        focusAndSelectInput(true);
        void loadThemeSettings();
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let disposed = false;
    let unlistenFocus: (() => void) | null = null;

    if (isTauri()) {
      void listen("quick_search_focus", () => {
        if (disposed) return;
        setErrorMessage(null);
        focusAndSelectInput(true);
        void loadThemeSettings();
      })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
          } else {
            unlistenFocus = unlisten;
          }
        })
        .catch(() => {
          // Bỏ qua khi môi trường preview không có event bridge
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (unlistenFocus) {
        unlistenFocus();
        unlistenFocus = null;
      }
    };
  }, [focusAndSelectInput, loadThemeSettings]);

  const hidePopup = useCallback(async () => {
    setErrorMessage(null);
    if (!isTauri()) return;
    try {
      await invoke("hide_quick_search");
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = parseAppError(err).message;
      setErrorMessage(msg || t.hideError);
    }
  }, [t.hideError]);

  const submitSearch = useCallback(async () => {
    if (isComposingRef.current || submittingRef.current) return;
    if (query.trim().length === 0) return;

    setErrorMessage(null);
    if (!isTauri()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await invoke<QuickSearchSubmitResult>("submit_quick_search", {
        query,
      });
      if (!mountedRef.current) return;
      if (result && typeof result === "object" && result.accepted === false) {
        const msg =
          typeof result.error === "string"
            ? result.error
            : typeof result.message === "string"
              ? result.message
              : t.submitError;
        setErrorMessage(msg);
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = parseAppError(err).message;
      setErrorMessage(msg || t.execError);
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [query, t.execError, t.submitError]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isComposingRef.current || submittingRef.current) return;
    void submitSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent;
    const composing =
      isComposingRef.current ||
      Boolean(nativeEvent.isComposing) ||
      e.keyCode === 229 ||
      nativeEvent.keyCode === 229 ||
      e.key === "Process";

    if (composing) {
      if (e.key === "Enter") {
        e.preventDefault();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      void hidePopup();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      void submitSearch();
    }
  };

  const isBlank = query.trim().length === 0;
  const isButtonDisabled = isSubmitting || isBlank;

  return (
    <form
      role="search"
      aria-label={t.formAria}
      title={errorMessage ?? undefined}
      onSubmit={handleFormSubmit}
      onKeyDown={handleKeyDown}
      style={{
        width: "100%",
        maxWidth: 380,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        height: 64,
        minHeight: 64,
        maxHeight: 64,
        boxSizing: "border-box",
        padding: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: 0,
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        fontFamily: SYSTEM_FONT_STACK,
        fontSize: 12,
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <label
        htmlFor="vx-quick-search-input"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {t.inputLabel}
      </label>
      <input
        ref={inputRef}
        id="vx-quick-search-input"
        type="text"
        value={query}
        placeholder={t.placeholder}
        aria-label={t.inputLabel}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby="vx-quick-search-status"
        title={errorMessage ?? undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (errorMessage) {
            setErrorMessage(null);
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: 36,
          boxSizing: "border-box",
          padding: "0 10px",
          fontFamily: SYSTEM_FONT_STACK,
          fontSize: 12,
          color: "var(--text-primary)",
          background: "var(--bg-input)",
          border: errorMessage
            ? "1px solid var(--semantic-rose)"
            : "1px solid var(--accent-primary)",
          borderRadius: 6,
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={isButtonDisabled}
        aria-label={t.submitBtn}
        title={errorMessage ?? t.submitTitle}
        style={{
          height: 36,
          padding: "0 12px",
          boxSizing: "border-box",
          fontFamily: SYSTEM_FONT_STACK,
          fontSize: 12,
          fontWeight: 600,
          color: isButtonDisabled ? "var(--text-disabled)" : "#ffffff",
          background: isButtonDisabled ? "var(--bg-hover)" : "var(--accent-primary)",
          border: isButtonDisabled
            ? "1px solid var(--border-subtle)"
            : "1px solid var(--accent-border)",
          borderRadius: 6,
          cursor: isButtonDisabled ? "not-allowed" : "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {t.submitBtn}
      </button>
      <span
        id="vx-quick-search-status"
        role="status"
        aria-live="polite"
        title={errorMessage ?? undefined}
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 1,
          fontSize: 10,
          lineHeight: "10px",
          color: "var(--semantic-rose)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          pointerEvents: "none",
        }}
      >
        {errorMessage ?? ""}
      </span>
    </form>
  );
};
