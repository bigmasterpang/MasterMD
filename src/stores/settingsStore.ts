import { create } from "zustand";
import type { Settings } from "../types";
import { MIN_FONT_SIZE, MAX_FONT_SIZE, MIN_AUTOSAVE_INTERVAL } from "../utils/constants";
import { DEFAULT_SHORTCUTS, SHORTCUT_IDS } from "../utils/shortcuts";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "blue",
  fontSize: 14,
  fontFamily: "",
  tabSize: 2,
  wordWrap: true,
  showLineNumbers: true,
  autoSave: false,
  autoSaveInterval: 30,
  recentFilesLimit: 10,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  autoCheckUpdate: true,
  outlineMaxLevel: 6,
};

interface SettingsStore extends Settings {
  loaded: boolean;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  update(patch: Partial<Settings>): void;
  reset(): void;
  /** 从持久化数据恢复（做一次边界收敛） */
  hydrate(patch: Partial<Settings>): void;
}

/** 收敛非法输入，避免持久化数据损坏导致界面异常 */
function clampSettings(patch: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = { ...patch };
  if (typeof out.fontSize === "number") {
    out.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(out.fontSize)));
  }
  if (typeof out.tabSize === "number") {
    out.tabSize = Math.min(8, Math.max(1, Math.round(out.tabSize)));
  }
  if (typeof out.autoSaveInterval === "number") {
    out.autoSaveInterval = Math.max(MIN_AUTOSAVE_INTERVAL, Math.round(out.autoSaveInterval));
  }
  if (typeof out.recentFilesLimit === "number") {
    out.recentFilesLimit = Math.min(10, Math.max(1, Math.round(out.recentFilesLimit)));
  }
  if (out.theme && !["light", "dark", "system"].includes(out.theme)) {
    delete out.theme;
  }
  if (out.accent && !["blue", "violet", "emerald", "amber", "rose"].includes(out.accent)) {
    delete out.accent;
  }
  if (typeof out.outlineMaxLevel === "number") {
    out.outlineMaxLevel = Math.min(6, Math.max(1, Math.round(out.outlineMaxLevel)));
  }
  if (out.shortcuts) {
    const merged = { ...DEFAULT_SHORTCUTS };
    for (const id of SHORTCUT_IDS) {
      const value = out.shortcuts[id];
      if (typeof value === "string" && value.trim()) merged[id] = value.trim();
    }
    out.shortcuts = merged;
  }
  return out;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  set: (key, value) => set({ [key]: value } as unknown as Partial<SettingsStore>),
  update: (patch) => set(clampSettings(patch)),
  reset: () => set({ ...DEFAULT_SETTINGS }),
  hydrate: (patch) => set({ ...clampSettings(patch), loaded: true }),
}));

/** 订阅时用于提取需要持久化的字段 */
export function pickSettings(state: SettingsStore): Settings {
  return {
    theme: state.theme,
    accent: state.accent,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    tabSize: state.tabSize,
    wordWrap: state.wordWrap,
    showLineNumbers: state.showLineNumbers,
    autoSave: state.autoSave,
    autoSaveInterval: state.autoSaveInterval,
    recentFilesLimit: state.recentFilesLimit,
    shortcuts: state.shortcuts,
    autoCheckUpdate: state.autoCheckUpdate,
    outlineMaxLevel: state.outlineMaxLevel,
  };
}
