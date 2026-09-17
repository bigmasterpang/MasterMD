import { LazyStore } from "@tauri-apps/plugin-store";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useAppStore } from "../stores/appStore";
import { pickSettings, useSettingsStore } from "../stores/settingsStore";
import type { Settings, ViewMode } from "../types";
import { debounce } from "./timing";

/** 是否运行在 Tauri 环境中（纯浏览器打开 vite 页面时跳过持久化） */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface UiState {
  viewMode: ViewMode;
  outlineVisible: boolean;
  windowWidth: number;
  windowHeight: number;
}

const STORE_FILE = "mdview-store.json";
let file: LazyStore | null = null;
let uiCache: UiState = {
  viewMode: "split",
  outlineVisible: true,
  windowWidth: 0,
  windowHeight: 0,
};

async function readWindowSize(): Promise<{ width: number; height: number }> {
  try {
    const win = getCurrentWindow();
    if (await win.isMaximized()) return { width: 0, height: 0 };
    const size = await win.innerSize();
    const scale = await win.scaleFactor();
    return {
      width: Math.round(size.width / scale),
      height: Math.round(size.height / scale),
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

const persistUi = debounce(() => {
  void file?.set("ui", uiCache);
}, 400);

async function captureUi(): Promise<void> {
  const app = useAppStore.getState();
  const size = await readWindowSize();
  uiCache = {
    viewMode: app.viewMode,
    outlineVisible: app.outlineVisible,
    windowWidth: size.width || uiCache.windowWidth,
    windowHeight: size.height || uiCache.windowHeight,
  };
  persistUi();
}

const persistSettings = debounce(() => {
  void file?.set("settings", pickSettings(useSettingsStore.getState()));
}, 400);

/** 应用启动时初始化持久化：恢复设置 / 界面状态，并订阅后续变化 */
export async function initPersistence(): Promise<void> {
  if (!isTauri) {
    useSettingsStore.setState({ loaded: true });
    return;
  }
  try {
    file = new LazyStore(STORE_FILE);
    await file.init();

    const settings = await file.get<Partial<Settings>>("settings");
    if (settings) useSettingsStore.getState().hydrate(settings);
    else useSettingsStore.setState({ loaded: true });

    const ui = await file.get<Partial<UiState>>("ui");
    if (ui) {
      uiCache = { ...uiCache, ...ui };
      useAppStore.setState({
        viewMode: ui.viewMode ?? "split",
        outlineVisible: ui.outlineVisible ?? true,
      });
      if (ui.windowWidth && ui.windowHeight) {
        try {
          await getCurrentWindow().setSize(
            new LogicalSize(ui.windowWidth, ui.windowHeight),
          );
        } catch {
          /* 尺寸恢复失败不影响使用 */
        }
      }
    }
  } catch (error) {
    console.error("初始化本地存储失败", error);
    useSettingsStore.setState({ loaded: true });
  }

  useSettingsStore.subscribe(persistSettings);
  useAppStore.subscribe((state, prev) => {
    if (
      state.viewMode !== prev.viewMode ||
      state.outlineVisible !== prev.outlineVisible
    ) {
      void captureUi();
    }
  });
  window.addEventListener("resize", () => void captureUi());
}

/** 应用退出前保存一次窗口尺寸 */
export async function flushUiState(): Promise<void> {
  if (!isTauri || !file) return;
  await captureUi();
  try {
    await file.save();
  } catch {
    /* ignore */
  }
}
