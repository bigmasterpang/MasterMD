import type { EditorView } from "@codemirror/view";

/**
 * 编辑器实例桥：让工具栏 / 快捷键 / 搜索面板等在不直接持有 CodeMirror 实例的情况下
 * 访问当前激活的编辑器（分屏与源码模式共用）。
 */

let current: EditorView | null = null;

export function registerEditor(view: EditorView | null): void {
  current = view;
}

export function getEditorView(): EditorView | null {
  return current;
}

export function withEditorView(fn: (view: EditorView) => void): void {
  if (current) fn(current);
}
