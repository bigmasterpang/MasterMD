import type { EditorView } from "@codemirror/view";

/**
 * 编辑器实例桥：让工具栏 / 快捷键 / 搜索面板 / 代码导航等在不直接持有 CodeMirror 实例的情况下
 * 访问当前激活或指定 docId 的编辑器（分屏与双栏模式共用）。
 */

let current: EditorView | null = null;
const viewsByDocId = new Map<string, EditorView>();

export function registerEditor(view: EditorView | null, docId?: string): void {
  current = view;
  if (docId && view) {
    viewsByDocId.set(docId, view);
  }
}

export function unregisterEditor(docId: string, view?: EditorView | null): void {
  const existing = viewsByDocId.get(docId);
  if (!view || existing === view) {
    viewsByDocId.delete(docId);
  }
  if (view && current === view) {
    current = null;
  }
}

export function getEditorView(docId?: string): EditorView | null {
  if (docId && viewsByDocId.has(docId)) {
    return viewsByDocId.get(docId) ?? null;
  }
  return current;
}

export function withEditorView(fn: (view: EditorView) => void, docId?: string): void {
  const target = getEditorView(docId);
  if (target) fn(target);
}
