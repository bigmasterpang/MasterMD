import type { ShortcutId, ShortcutMap } from "../types";

export const SHORTCUT_IDS: ShortcutId[] = [
  "open",
  "save",
  "saveAs",
  "newDoc",
  "viewMode",
  "search",
  "closeTab",
  "settings",
];

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  open: "打开文件",
  save: "保存",
  saveAs: "另存为",
  newDoc: "新建文档",
  viewMode: "切换视图模式",
  search: "文件内搜索",
  closeTab: "关闭当前标签",
  settings: "打开设置",
};

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  open: "Ctrl+O",
  save: "Ctrl+S",
  saveAs: "Ctrl+Shift+S",
  newDoc: "Ctrl+N",
  viewMode: "Ctrl+E",
  search: "Ctrl+F",
  closeTab: "Ctrl+W",
  settings: "Ctrl+,",
};

export interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

/** 解析 "Ctrl+Shift+S" 形式的快捷键 */
export function parseShortcut(text: string): ParsedShortcut | null {
  if (!text) return null;
  const parts = text
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const parsed: ParsedShortcut = { ctrl: false, shift: false, alt: false, key: "" };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") parsed.ctrl = true;
    else if (lower === "shift") parsed.shift = true;
    else if (lower === "alt") parsed.alt = true;
    else parsed.key = lower;
  }
  if (!parsed.key) return null;
  return parsed;
}

/** 键盘事件是否匹配某个快捷键 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  return event.key.toLowerCase() === parsed.key;
}

/** 键盘事件转快捷键字符串（用于自定义录入） */
export function eventToShortcut(event: KeyboardEvent): string | null {
  const key = event.key;
  if (["Control", "Shift", "Alt", "Meta", "CapsLock", "Escape", "Tab"].includes(key)) {
    return null;
  }
  if (!(event.ctrlKey || event.metaKey)) return null;
  const parts: string[] = ["Ctrl"];
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  const normalized = key.length === 1 ? key.toUpperCase() : key;
  parts.push(normalized);
  return parts.join("+");
}

/** 检查快捷键冲突，返回冲突的其它功能 id */
export function findConflict(
  map: ShortcutMap,
  id: ShortcutId,
  value: string,
): ShortcutId | null {
  const target = value.toLowerCase();
  for (const other of SHORTCUT_IDS) {
    if (other === id) continue;
    if ((map[other] ?? "").toLowerCase() === target) return other;
  }
  return null;
}
