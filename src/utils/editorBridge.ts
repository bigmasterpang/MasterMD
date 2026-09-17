/**
 * 编辑器命令桥：让工具栏 / 快捷键 / 搜索栏在不直接持有 CodeMirror 实例的情况下
 * 调用编辑器能力。
 */

export interface EditorApi {
  wrapSelection(before: string, after?: string, placeholder?: string): void;
  insertText(text: string): void;
  focus(): void;
  scrollToLine(line: number): void;
  /** 源码模式搜索：设置查询串并定位到第一个结果 */
  applySearch(query: string, caseSensitive: boolean): void;
  findNext(): void;
  findPrevious(): void;
  clearSearch(): void;
  /** 当前视口信息，用于滚动同步 */
  getScrollMetrics(): { scrollTop: number; scrollHeight: number; clientHeight: number } | null;
  setScrollTop(top: number): void;
}

let api: EditorApi | null = null;

export function registerEditor(next: EditorApi | null): void {
  api = next;
}

export function getEditor(): EditorApi | null {
  return api;
}
