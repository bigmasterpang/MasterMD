import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { createDoc, docFromPayload, useAppStore } from "../stores/appStore";
import { pickSettings, useSettingsStore } from "../stores/settingsStore";
import type { FilePayload, Settings, ViewMode } from "../types";
import { debounce } from "./timing";

/** 是否运行在 Tauri 环境中（纯浏览器打开 vite 页面时跳过持久化） */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface UiState {
  viewMode: ViewMode;
  outlineVisible: boolean;
  windowWidth: number;
  windowHeight: number;
  split?: boolean;
  splitRatio?: number;
  activePane?: 0 | 1;
}

const STORE_FILE = "mastermd-store.json";
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
    split: app.layout.split,
    splitRatio: app.layout.ratio,
    activePane: app.layout.activePane,
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
        layout: {
          split: ui.split ?? false,
          activePane: ui.activePane ?? 0,
          ratio: typeof ui.splitRatio === "number" ? ui.splitRatio : 0.5,
        },
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
      state.outlineVisible !== prev.outlineVisible ||
      state.layout.split !== prev.layout.split ||
      state.layout.ratio !== prev.layout.ratio ||
      state.layout.activePane !== prev.layout.activePane
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

/* ------------------------------------------------------------------ */
/* 会话恢复：避免意外重载（如误按刷新）导致未保存内容丢失              */
/* ------------------------------------------------------------------ */

interface SessionPayload {
  /** 已保存文档的路径及窗格（用于恢复标签页，兼容旧版 string 数组） */
  paths: Array<string | { path: string; pane?: 0 | 1 }>;
  /** 未保存 / 未命名文档的内容及窗格 */
  unsaved: Array<{ path: string | null; content: string; pane?: 0 | 1 }>;
}

const SESSION_TAB_LIMIT = 8;
const SESSION_CONTENT_LIMIT = 512 * 1024;

const persistSession = debounce(() => {
  void writeSession();
}, 1200);

async function writeSession(): Promise<void> {
  if (!file) return;
  try {
    const { docs } = useAppStore.getState();
    const payload: SessionPayload = {
      paths: docs
        .filter((doc) => doc.filePath)
        .map((doc) => ({ path: doc.filePath as string, pane: doc.pane ?? 0 }))
        .slice(0, SESSION_TAB_LIMIT),
      unsaved: docs
        .filter((doc) => doc.isDirty || !doc.filePath)
        .filter((doc) => doc.content.length <= SESSION_CONTENT_LIMIT)
        .slice(0, SESSION_TAB_LIMIT)
        .map((doc) => ({
          path: doc.filePath,
          content: doc.content,
          pane: doc.pane ?? 0,
        })),
    };
    await file.set("session", payload);
  } catch (error) {
    console.error("保存会话失败", error);
  }
}

/** 启动时恢复上次未保存的内容与打开的标签页 */
export async function restoreSession(): Promise<void> {
  if (!isTauri || !file) return;
  try {
    const payload = await file.get<SessionPayload>("session");
    if (!payload) return;
    const state = useAppStore.getState();
    const opened = new Set(
      state.docs
        .map((doc) => doc.filePath?.toLowerCase())
        .filter((path): path is string => Boolean(path)),
    );

    // 1. 未保存 / 未命名文档优先恢复
    for (const entry of payload.unsaved ?? []) {
      if (!entry.content) continue;
      const doc = createDoc({
        filePath: entry.path,
        content: entry.content,
        savedContent: entry.path ? "" : entry.content,
        isDirty: Boolean(entry.path),
        pane: entry.pane ?? 0,
      });
      if (entry.path) {
        try {
          const disk = await invoke<FilePayload>("read_markdown_file", { path: entry.path });
          doc.savedContent = disk.content;
          doc.modifiedAt = disk.modifiedAt;
          doc.size = disk.size;
          doc.isDirty = disk.content !== entry.content;
          opened.add(entry.path.toLowerCase());
        } catch {
          // 文件已不存在：保留内容，等待用户另存为
          doc.isDirty = true;
        }
      }
      state.addDoc(doc);
    }

    // 2. 其余已保存标签页
    for (const item of payload.paths ?? []) {
      const path = typeof item === "string" ? item : item.path;
      const pane = typeof item === "string" ? 0 : item.pane ?? 0;
      if (opened.has(path.toLowerCase())) continue;
      try {
        const payloadData = await invoke<FilePayload>("read_markdown_file", { path });
        if (payloadData.size > SESSION_CONTENT_LIMIT * 4) continue;
        const restoredDoc = docFromPayload(payloadData);
        restoredDoc.pane = pane;
        state.addDoc(restoredDoc);
        opened.add(path.toLowerCase());
      } catch {
        /* 打不开的文件跳过 */
      }
    }
  } catch (error) {
    console.error("恢复会话失败", error);
  }
}

/** 开始监听文档变化并持久化会话 */
export function startSessionTracking(): void {
  useAppStore.subscribe((state, prev) => {
    if (state.docs !== prev.docs) persistSession();
  });
}
