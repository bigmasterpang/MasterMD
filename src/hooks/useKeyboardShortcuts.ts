import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getActiveDoc, useAppStore } from "../stores/appStore";
import { useDialogStore } from "../stores/dialogStore";
import { useSearchStore } from "../stores/searchStore";
import { useSettingsStore } from "../stores/settingsStore";
import {
  deleteLines,
  duplicateLines,
  insertCallout,
  insertCodeBlock,
  insertHorizontalRule,
  insertTable,
  insertToc,
  moveLines,
  setHeading,
  shiftHeading,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleList,
  toggleQuote,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
} from "../utils/editorCommands";
import {
  closeDocWithConfirm,
  newDocument,
  openFileDialog,
  saveActive,
  saveActiveAs,
} from "../utils/fileActions";
import { matchesShortcut } from "../utils/shortcuts";
import { APP_NAME } from "../utils/constants";
import type { ShortcutId } from "../types";

const BINDABLE: ShortcutId[] = [
  "open",
  "save",
  "saveAs",
  "newDoc",
  "viewMode",
  "search",
  "replace",
  "closeTab",
  "settings",
];

/**
 * 全局快捷键。
 * 可自定义项读取 settings.shortcuts；其余为编辑器固定快捷键（源码/分屏模式生效）。
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const runAction = (id: ShortcutId) => {
      switch (id) {
        case "open":
          void openFileDialog();
          break;
        case "save":
          void saveActive();
          break;
        case "saveAs":
          void saveActiveAs();
          break;
        case "newDoc":
          void newDocument();
          break;
        case "viewMode":
          useAppStore.getState().cycleViewMode();
          break;
        case "search":
          useSearchStore.getState().open(false);
          break;
        case "replace":
          useSearchStore.getState().open(true);
          break;
        case "closeTab": {
          const activeId = useAppStore.getState().activeId;
          if (activeId) void closeDocWithConfirm(activeId);
          break;
        }
        case "settings":
          useDialogStore.getState().setSettingsVisible(true);
          break;
      }
    };

    /** 编辑器类快捷键仅在可编辑状态下生效 */
    const editorReady = () => {
      const state = useAppStore.getState();
      const doc = getActiveDoc();
      return state.viewMode !== "preview" && Boolean(doc) && !doc?.readOnly;
    };

    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (!mod) {
        if (key === "escape") {
          const dialogs = useDialogStore.getState();
          if (
            dialogs.unsaved.open ||
            dialogs.conflict.open ||
            dialogs.confirm.open ||
            dialogs.message.open
          ) {
            return;
          }
          if (dialogs.settingsVisible) {
            dialogs.setSettingsVisible(false);
            return;
          }
          if (useSearchStore.getState().visible) {
            useSearchStore.getState().close();
          }
          return;
        }
        // F3 / Shift+F3 查找下一个 / 上一个（Notepad++ 习惯）
        if (event.key === "F3") {
          event.preventDefault();
          const search = useSearchStore.getState();
          if (!search.visible) search.open(false);
          search.step(event.shiftKey ? -1 : 1);
          return;
        }
        // Alt+↑/↓ 上下移动行；Shift+Alt+↑/↓ 复制行
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          if (!editorReady()) return;
          event.preventDefault();
          if (event.shiftKey) duplicateLines();
          else moveLines(event.key === "ArrowUp" ? -1 : 1);
          return;
        }
        return;
      }

      // 输入框内不劫持格式快捷键
      if (inInput && ["b", "i", "k", "`"].includes(key)) return;

      const shortcuts = useSettingsStore.getState().shortcuts;
      const matched = BINDABLE.find((id) => matchesShortcut(event, shortcuts[id] ?? ""));
      if (matched) {
        event.preventDefault();
        runAction(matched);
        return;
      }

      // ---------------- 编辑类快捷键 ----------------
      const editable = editorReady();

      // 标题：Ctrl+1..6 设置级别，Ctrl+0 取消标题
      if (editable && !event.shiftKey && !event.altKey && /^[0-6]$/.test(key)) {
        event.preventDefault();
        setHeading(key === "0" ? 0 : Number(key));
        return;
      }
      // 标题升降级：Ctrl+Alt+↑ / ↓
      if (editable && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        shiftHeading(event.key === "ArrowUp" ? -1 : 1);
        return;
      }

      switch (key) {
        case "tab": {
          event.preventDefault();
          const { docs, activeId, activateDoc } = useAppStore.getState();
          if (docs.length < 2) break;
          const idx = docs.findIndex((d) => d.id === activeId);
          const next = docs[(idx + (event.shiftKey ? docs.length - 1 : 1)) % docs.length];
          if (next) activateDoc(next.id);
          break;
        }
        case "b": {
          if (!editable || event.shiftKey || event.altKey) break;
          event.preventDefault();
          toggleBold();
          break;
        }
        case "i": {
          if (!editable || event.altKey) break;
          event.preventDefault();
          if (event.shiftKey) {
            void import("../components/Toolbar/Toolbar").then((m) => m.promptInsert("image"));
          } else {
            toggleItalic();
          }
          break;
        }
        case "k": {
          if (!editable || event.altKey) break;
          event.preventDefault();
          if (event.shiftKey) deleteLines();
          else void import("../components/Toolbar/Toolbar").then((m) => m.promptInsert("link"));
          break;
        }
        case "`": {
          if (!editable || event.shiftKey) break;
          event.preventDefault();
          toggleInlineCode();
          break;
        }
        case "=":
        case "+": {
          event.preventDefault();
          if (event.altKey && event.shiftKey) {
            if (editable) toggleSuperscript();
            break;
          }
          const { fontSize, set } = useSettingsStore.getState();
          set("fontSize", Math.min(24, fontSize + 1));
          break;
        }
        case "-": {
          event.preventDefault();
          if (event.altKey && event.shiftKey) {
            if (editable) toggleSubscript();
            break;
          }
          const { fontSize, set } = useSettingsStore.getState();
          set("fontSize", Math.max(11, fontSize - 1));
          break;
        }
        case "5": {
          if (!(event.altKey && event.shiftKey) || !editable) break;
          event.preventDefault();
          toggleStrikethrough();
          break;
        }
        case "7":
        case "8":
        case "9": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          toggleList(key === "7" ? "ordered" : key === "8" ? "bullet" : "task");
          break;
        }
        case "q": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          toggleQuote();
          break;
        }
        case "l": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          insertCallout("note");
          break;
        }
        case "c": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          insertCodeBlock();
          break;
        }
        case "t": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          insertTable(3, 3);
          break;
        }
        case "h": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          insertHorizontalRule();
          break;
        }
        case "o": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          insertToc();
          break;
        }
        case "d": {
          if (!event.shiftKey || !editable) break;
          event.preventDefault();
          duplicateLines();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Ctrl+滚轮缩放字号
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const { fontSize, set } = useSettingsStore.getState();
      const next = Math.min(24, Math.max(11, fontSize + (event.deltaY < 0 ? 1 : -1)));
      if (next !== fontSize) set("fontSize", next);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
}

/** 监听当前文档变化，更新窗口标题 */
export function useWindowTitle(): void {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const name = doc?.filePath ? doc.filePath.split(/[\\/]/).pop() || "未命名" : "未命名";
  const title = doc ? `${doc.isDirty ? "● " : ""}${name} - ${APP_NAME}` : APP_NAME;

  useEffect(() => {
    document.title = title;
    void (async () => {
      try {
        await getCurrentWindow().setTitle(title);
      } catch {
        /* 非 Tauri 环境忽略 */
      }
    })();
  }, [title]);
}

/** 把脏标记同步给 Rust，用于关闭窗口时判断是否需要询问 */
export function useDirtyFlagSync(): void {
  const dirty = useAppStore((s) => s.docs.some((d) => d.isDirty));
  useEffect(() => {
    void (async () => {
      try {
        await invoke("set_dirty", { dirty });
      } catch {
        /* ignore */
      }
    })();
  }, [dirty]);
}

/** 提供给外部读取当前活动文档 */
export function currentDoc() {
  return getActiveDoc();
}
