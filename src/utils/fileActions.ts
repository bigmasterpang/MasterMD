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
import { fileName, isMarkdownPath, isOpenablePath, samePath } from "./filePath";
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
    if (!payload.encrypted && payload.size > LARGE_FILE_BYTES) {
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
    // 非 Markdown 文件（代码/纯文本）固定以源码模式打开
    if (!isMarkdownPath(payload.path)) {
      useAppStore.getState().setViewMode("source");
    }
    void addRecentFile(payload.path);
    void watchFile(payload.path);
    // 加密文档不弹窗提示：状态栏已有「已解密」标记，保存时自动按原格式加密写回
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
      `目前支持 Markdown（.md/.markdown/.mdown）、纯文本（.txt/.log 等）与常见代码/配置文件（.json/.js/.ts/.py/.java/.sql/.yml 等）。\n\n拖入的文件：\n${paths
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

/* ------------------------------ 编码与换行符 ------------------------------ */

/**
 * 切换文件编码（重新解释）：
 * 从磁盘按新编码重新读取，内容变化时保持「未保存」，保存后即以新编码写回。
 */
export async function setDocEncoding(id: string, encoding: string): Promise<void> {
  const doc = getDocById(id);
  if (!doc) return;
  if (!doc.filePath) {
    useAppStore.getState().patchDoc(id, { encoding });
    return;
  }
  if (doc.isDirty) {
    const ok = await askConfirm({
      title: "切换编码",
      message: "切换编码会重新读取磁盘文件，未保存的修改将丢失。是否继续？",
      confirmText: "继续切换",
    });
    if (!ok) return;
  }
  try {
    const payload = await invoke<FilePayload>("read_markdown_file", {
      path: doc.filePath,
      encoding,
    });
    // content 变化时 patchDoc 会自动重算 isDirty：不同即视为待保存
    useAppStore.getState().patchDoc(id, {
      content: payload.content,
      encoding,
      eol: payload.eol ?? doc.eol,
      size: payload.size,
      modifiedAt: payload.modifiedAt,
    });
  } catch (error) {
    await showMessage("切换编码失败", String(error));
  }
}

/** 切换换行符（保存时统一转换） */
export function setDocEol(id: string, eol: string): void {
  const doc = getDocById(id);
  if (!doc) return;
  const lf = doc.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const converted =
    eol === "crlf" ? lf.replace(/\n/g, "\r\n") : eol === "cr" ? lf.replace(/\n/g, "\r") : lf;
  useAppStore.getState().patchDoc(id, { eol, isDirty: converted !== doc.savedContent });
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
      encryptedHeader: doc.encryptedHeader,
      encoding: doc.encoding,
      eol: doc.eol,
    });
    markSelfWrite();
    useAppStore.getState().patchDoc(id, {
      savedContent: doc.content,
      isDirty: false,
      modifiedAt,
      // 加密文档落盘后会多出 4096 字节文件头
      size: (doc.encrypted ? 4096 : 0) + utf8Size(doc.content),
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
    const isBlank = doc.docType === "blank" && !doc.filePath;
    const defaultPath = doc.filePath ?? (isBlank ? "未命名" : "未命名.md");
    const target = await invoke<string | null>("save_file_dialog", {
      defaultPath,
      filterAll: isBlank,
    });
    if (!target) return false;
    markSelfWrite();
    const modifiedAt = await invoke<number>("write_markdown_file", {
      path: target,
      content: doc.content,
      encryptedHeader: doc.encryptedHeader,
      encoding: doc.encoding,
      eol: doc.eol,
    });
    markSelfWrite();
    const oldPath = doc.filePath;
    useAppStore.getState().patchDoc(id, {
      filePath: target,
      savedContent: doc.content,
      isDirty: false,
      readOnly: false,
      // 加密文档另存为后仍是加密文档（沿用原文件头）
      size: (doc.encrypted ? 4096 : 0) + utf8Size(doc.content),
      modifiedAt,
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

export async function newDocument(type: "markdown" | "blank" = "markdown"): Promise<void> {
  if (!(await ensureNoDirty(getActiveDoc()))) return;
  const isMd = type === "markdown";
  const doc = createDoc({
    content: isMd ? EMPTY_DOC_PLACEHOLDER : "",
    savedContent: isMd ? EMPTY_DOC_PLACEHOLDER : "",
    docType: type,
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
    const encrypted = payload.encrypted ?? false;
    useAppStore.getState().patchDoc(id, {
      content: payload.content,
      savedContent: payload.content,
      isDirty: false,
      encrypted,
      encryptedHeader: payload.encryptedHeader ?? null,
      encoding: payload.encoding ?? doc.encoding,
      eol: payload.eol ?? doc.eol,
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
