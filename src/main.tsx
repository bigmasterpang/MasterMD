import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initPersistence } from "./utils/persist";
import { useSettingsStore } from "./stores/settingsStore";

/** 首帧渲染前先恢复主题，避免闪白 */
async function bootstrap(): Promise<void> {
  await initPersistence();

  const { theme, accent, fontSize } = useSettingsStore.getState();
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.accent = accent;
  root.style.setProperty("--editor-size", `${fontSize}px`);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
