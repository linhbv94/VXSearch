import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import { QuickSearch } from "./quick_search";
import "./styles/theme_tokens.css";

const isQuickSearchView =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("view") === "quick_search";

document.documentElement.classList.toggle("quick-search-window", isQuickSearchView);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isQuickSearchView ? <QuickSearch /> : <App />}
  </React.StrictMode>
);
