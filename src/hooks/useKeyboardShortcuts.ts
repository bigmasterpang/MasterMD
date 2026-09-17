import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getActiveDoc, useAppStore } from "../stores/appStore";
import { useDialogStore } from "../stores/dialogStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getEditor } from "../utils/editorBridge";
import {
  closeDocWithConfirm,
  newDocument,
  openFileDialog,
  saveActive,
  saveActiveAs,
} from "../utils/fileActions";
import { matchesShortcut } from "../utils/shortcuts";
import type { ShortcutId } from "../types";

const BINDABLE: ShortcutId[] = [
  "open",
  "save",
  "saveAs",
  "newDoc",
  "viewMode",
  "search",
  "closeTab",
  "settings",
];

/**
 * 全局快捷键。
 * 可自定义的部分读取自 settings.shortcuts；格式类快捷键（B/I/K）固定在编辑器内处理。
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const runAction = (id: ShortcutId, shift: boolean) => {
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
          useAppStore.getState().setSearchVisible(true);
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
      void shift;
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
            return; // 弹窗自己处理
          }
          if (dialogs.settingsVisible) {
            dialogs.setSettingsVisible(false);
            return;
          }
          if (useAppStore.getState().searchVisible) {
            useAppStore.getState().setSearchVisible(false);
            getEditor()?.clearSearch();
          }
        }
        return;
      }

      // 输入框内不劫持格式快捷键
      if (inInput && (key === "b" || key === "i" || key === "k")) return;

      const shortcuts = useSettingsStore.getState().shortcuts;
      const matched = BINDABLE.find((id) => matchesShortcut(event, shortcuts[id] ?? ""));
      if (matched) {
        event.preventDefault();
        runAction(matched, event.shiftKey);
        return;
      }

      switch (key) {
        case "tab": {
          event.preventDefault();
          const { docs, activeId, activateDoc } = useAppStore.getState();
          if (docs.length < 2) break;
          const idx = docs.findIndex((d) => d.id === activeId);
          const next =
            docs[(idx + (event.shiftKey ? docs.length - 1 : 1)) % docs.length];
          if (next) activateDoc(next.id);
          break;
        }
        case "b":
        case "i":
        case "k": {
          const viewMode = useAppStore.getState().viewMode;
          if (viewMode === "preview") break;
          event.preventDefault();
          if (key === "b") getEditor()?.wrapSelection("**", "**", "粗体");
          else if (key === "i") getEditor()?.wrapSelection("*", "*", "斜体");
          else getEditor()?.wrapSelection("[", "](https://)", "链接文字");
          break;
        }
        case "=":
        case "+": {
          event.preventDefault();
          const { fontSize, set } = useSettingsStore.getState();
          set("fontSize", Math.min(24, fontSize + 1));
          break;
        }
        case "-": {
          event.preventDefault();
          const { fontSize, set } = useSettingsStore.getState();
          set("fontSize", Math.max(11, fontSize - 1));
          break;
        }
        case "0": {
          event.preventDefault();
          useSettingsStore.getState().set("fontSize", 14);
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
  const title = doc ? `${doc.isDirty ? "● " : ""}${name} - mdview` : "mdview";

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
