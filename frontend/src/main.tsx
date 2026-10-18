import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts: served from our own origin, so no visitor IPs go to Google.
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource-variable/instrument-sans/wght-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/global.scss";
import { reloadOnceForNewVersion } from "./components/staleChunk";

// Vite fires this when preloading a code-split chunk fails, typically because
// a deploy replaced it. Reload once to pick up the new build.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadOnceForNewVersion()) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
