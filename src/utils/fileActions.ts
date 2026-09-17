import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createDoc, docFromPayload, getActiveDoc, getDocById, useAppStore } from "../stores/appStore";
import { askConfirm, askUnsaved, showMessage } from "../stores/dialogStore";
import type { FilePayload } from "../types";
import {
  EMPTY_DOC_PLACEHOLDER,
  LARGE_FILE_BYTES,
  OPEN_DIALOG_FILTERS,
} from "./constants";
import { fileName, isOpenablePath, isTextPath, samePath } from "./filePath";
import { formatBytes } from "./timing";

/** 展示用名称 */
export function displayName(doc: { filePath: string | null }): string {
  return doc.filePath ? fileName(doc.filePath) : "未命名文档";
}

function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

/* ------------------------------ 自身写入标记 -------------------------- */

let lastSelfWriteAt = 0;

/** 记录一次由本应用发起的写入，用于忽略监听器回传的自身事件 */
export function markSelfWrite(): void {
  lastSelfWriteAt = Date.now();
}

export function isRecentSelfWrite(windowMs = 1200): boolean {
  return Date.now() - lastSelfWriteAt < windowMs;
}

/* ------------------------------ 最近文件 ------------------------------ */

export async function loadRecentFiles(): Promise<void> {
  try {
    const list = await invoke<string[]>("get_recent_files");
    useAppStore.getState().setRecentFiles(list);
  } catch (error) {
    console.error("读取最近文件失败", error);
  }
}

export async function addRecentFile(path: string): Promise<void> {
  try {
    const list = await invoke<string[]>("add_recent_file", { path });
    useAppStore.getState().setRecentFiles(list);
  } catch (error) {
    console.error("记录最近文件失败", error);
  }
}

export async function removeRecentFile(path: string): Promise<void> {
  try {
    const list = await invoke<string[]>("remove_recent_file", { path });
    useAppStore.getState().setRecentFiles(list);
  } catch (error) {
    console.error("移除最近文件失败", error);
  }
}

export async function clearRecentFiles(): Promise<void> {
  try {
    const list = await invoke<string[]>("clear_recent_files");
    useAppStore.getState().setRecentFiles(list);
  } catch (error) {
    console.error("清空最近文件失败", error);
  }
}

/* ------------------------------ 文件监听 ------------------------------ */

export async function watchFile(path: string): Promise<void> {
  try {
    await invoke("watch_file", { path });
  } catch (error) {
    console.error("启动文件监听失败", error);
  }
}

export async function unwatchFile(path: string): Promise<void> {
  try {
    await invoke("unwatch_file", { path });
  } catch (error) {
    console.error("停止文件监听失败", error);
  }
}

/* ------------------------------ 打开文件 ------------------------------ */

/** 处理未保存变更；返回 false 表示用户取消 */
async function ensureNoDirty(doc: { id: string; filePath: string | null; isDirty: boolean } | null): Promise<boolean> {
  if (!doc || !doc.isDirty) return true;
  const choice = await askUnsaved(displayName(doc));
  if (choice === "cancel") return false;
  if (choice === "save") return await saveDoc(doc.id);
  return true;
}

export async function openPath(path: string): Promise<boolean> {
  if (!(await ensureNoDirty(getActiveDoc()))) return false;

  const existing = useAppStore
    .getState()
    .docs.find((d) => samePath(d.filePath, path));
  if (existing) {
    useAppStore.getState().activateDoc(existing.id);
    return true;
  }

  try {
    const payload = await invoke<FilePayload>("read_markdown_file", { path });
    if (payload.size > LARGE_FILE_BYTES) {
      const ok = await askConfirm({
        title: "文件较大",
        message: `「${fileName(payload.path)}」大小为 ${formatBytes(
          payload.size,
        )}，将以只读方式打开以保证流畅度。`,
        confirmText: "只读打开",
      });
      if (!ok) return false;
    }
    const doc = docFromPayload(payload);
    useAppStore.getState().addDoc(doc);
    if (isTextPath(payload.path)) {
      useAppStore.getState().setViewMode("source");
    }
    void addRecentFile(payload.path);
    void watchFile(payload.path);
    return true;
  } catch (error) {
    await showMessage("打开失败", `无法打开文件：\n${path}\n\n${String(error)}`);
    void removeRecentFile(path);
    return false;
  }
}

export async function openFileDialog(): Promise<void> {
  try {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: "打开 Markdown 文件",
      filters: OPEN_DIALOG_FILTERS,
    });
    if (typeof selected === "string") {
      await openPath(selected);
    }
  } catch (error) {
    await showMessage("打开失败", String(error));
  }
}

/** 拖放打开：只打开第一个文件 */
export async function openDroppedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const openable = paths.filter(isOpenablePath);
  if (openable.length === 0) {
    await showMessage(
      "不支持的文件类型",
      `仅支持打开以下类型：\n.md / .markdown / .mdown / .txt\n\n拖入的文件：\n${paths
        .slice(0, 5)
        .join("\n")}`,
    );
    return;
  }
  if (openable.length > 1) {
    await showMessage(
      "暂不支持多开",
      `一次只能打开一个文件，将打开第一个：\n${fileName(openable[0])}`,
    );
  }
  await openPath(openable[0]);
}

/* ------------------------------ 保存文件 ------------------------------ */

export async function saveDoc(id: string): Promise<boolean> {
  const doc = getDocById(id);
  if (!doc) return false;
  if (!doc.filePath) return saveDocAs(id);
  if (doc.readOnly) {
    await showMessage(
      "只读文档",
      "当前文档以只读方式打开（文件过大），请使用「另存为」保存副本。",
    );
    return false;
  }
  try {
    // 先标记自身写入：OS 可能在 invoke 返回前就投递监听事件
    markSelfWrite();
    const modifiedAt = await invoke<number>("write_markdown_file", {
      path: doc.filePath,
      content: doc.content,
    });
    markSelfWrite();
    useAppStore.getState().patchDoc(id, {
      savedContent: doc.content,
      isDirty: false,
      modifiedAt,
      size: utf8Size(doc.content),
    });
    void addRecentFile(doc.filePath);
    return true;
  } catch (error) {
    await showMessage("保存失败", String(error));
    return false;
  }
}

export async function saveDocAs(id: string): Promise<boolean> {
  const doc = getDocById(id);
  if (!doc) return false;
  try {
    const target = await invoke<string | null>("save_file_dialog", {
      defaultPath: doc.filePath,
    });
    if (!target) return false;
    markSelfWrite();
    const modifiedAt = await invoke<number>("write_markdown_file", {
      path: target,
      content: doc.content,
    });
    markSelfWrite();
    const oldPath = doc.filePath;
    useAppStore.getState().patchDoc(id, {
      filePath: target,
      savedContent: doc.content,
      isDirty: false,
      readOnly: false,
      modifiedAt,
      size: utf8Size(doc.content),
    });
    if (oldPath && !samePath(oldPath, target)) void unwatchFile(oldPath);
    void addRecentFile(target);
    void watchFile(target);
    return true;
  } catch (error) {
    await showMessage("保存失败", String(error));
    return false;
  }
}

export async function saveActive(): Promise<boolean> {
  const doc = getActiveDoc();
  if (!doc) return false;
  return saveDoc(doc.id);
}

export async function saveActiveAs(): Promise<boolean> {
  const doc = getActiveDoc();
  if (!doc) return false;
  return saveDocAs(doc.id);
}

/* ------------------------------ 关闭 / 新建 --------------------------- */

export async function closeDocWithConfirm(id: string): Promise<boolean> {
  const doc = getDocById(id);
  if (!doc) return true;
  if (!(await ensureNoDirty(doc))) return false;
  if (doc.filePath) void unwatchFile(doc.filePath);
  useAppStore.getState().closeDoc(id);
  return true;
}

export async function closeAllDocsWithConfirm(): Promise<boolean> {
  const docs = [...useAppStore.getState().docs];
  for (const doc of docs) {
    if (!(await closeDocWithConfirm(doc.id))) return false;
  }
  return true;
}

export async function newDocument(): Promise<void> {
  if (!(await ensureNoDirty(getActiveDoc()))) return;
  const doc = createDoc({
    content: EMPTY_DOC_PLACEHOLDER,
    savedContent: EMPTY_DOC_PLACEHOLDER,
  });
  useAppStore.getState().addDoc(doc);
  useAppStore.getState().setViewMode("source");
}

/** 丢弃本地修改，重新从磁盘加载 */
export async function reloadDocFromDisk(id: string): Promise<boolean> {
  const doc = getDocById(id);
  if (!doc?.filePath) return false;
  try {
    const payload = await invoke<FilePayload>("read_markdown_file", {
      path: doc.filePath,
    });
    useAppStore.getState().patchDoc(id, {
      content: payload.content,
      savedContent: payload.content,
      isDirty: false,
      readOnly: payload.size > LARGE_FILE_BYTES,
      modifiedAt: payload.modifiedAt,
      size: payload.size,
    });
    return true;
  } catch (error) {
    console.error("重新加载失败", error);
    return false;
  }
}

/* ------------------------------ 外链 ------------------------------ */

export async function openExternal(url: string): Promise<void> {
  if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
  try {
    await openUrl(url);
  } catch (error) {
    await showMessage("无法打开链接", `${url}\n\n${String(error)}`);
  }
}
