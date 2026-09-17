import type { ChangeSpec, EditorState, Line } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { withEditorView } from "./editorBridge";
import { parseHeadings } from "./markdown";

/**
 * Markdown 编辑命令集合。
 * 所有命令都作用于当前光标 / 选中行，并尽量保持选区与撤销历史。
 */

export type ListKind = "bullet" | "ordered" | "task";
export type CalloutType =
  | "note"
  | "tip"
  | "important"
  | "warning"
  | "caution"
  | "info"
  | "success"
  | "question"
  | "quote"
  | "danger";

const HEADING_RE = /^(#{1,6})\s+/;
const TASK_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
const BULLET_RE = /^(\s*)([-*+])\s+(?![[])/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+/;
const QUOTE_RE = /^(\s*)>\s?/;

/* ------------------------------ 基础工具 ------------------------------ */

/** 取得选区覆盖的所有行（至少一行） */
function selectedLines(state: EditorState): Line[] {
  const sel = state.selection.main;
  const start = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to);
  const lines: Line[] = [];
  for (let n = start.number; n <= endLine.number; n++) lines.push(state.doc.line(n));
  return lines;
}

/** 选区文本（用于替换） */
function selectionRange(state: EditorState): { from: number; to: number } {
  const sel = state.selection.main;
  return { from: sel.from, to: sel.to };
}

/** 去掉行首的列表 / 引用标记，返回缩进 + 内容 */
function stripMarkers(text: string): string {
  return text
    .replace(/^(\s*)([-*+])\s+\[[ xX]\]\s+/, "$1")
    .replace(/^(\s*)([-*+])\s+/, "$1")
    .replace(/^(\s*)(\d+)[.)]\s+/, "$1")
    .replace(/^(\s*)>\s?/, "$1");
}

function isTaskLine(text: string): boolean {
  return TASK_RE.test(text);
}
function isBulletLine(text: string): boolean {
  return BULLET_RE.test(text) && !isTaskLine(text);
}
function isOrderedLine(text: string): boolean {
  return ORDERED_RE.test(text);
}
function isQuoteLine(text: string): boolean {
  return QUOTE_RE.test(text);
}

function applyChanges(view: EditorView, changes: ChangeSpec[]): void {
  if (changes.length === 0) return;
  view.dispatch({ changes });
}

/* ------------------------------ 内联格式 ------------------------------ */

/** 用定界符包裹选中文本；未选中时插入占位文本并选中 */
export function wrapSelection(before: string, after = before, placeholder = ""): void {
  withEditorView((view) => {
    const { state } = view;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const text = selected || placeholder;
    const insert = `${before}${text}${after}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: {
        anchor: range.from + before.length,
        head: range.from + before.length + text.length,
      },
      scrollIntoView: true,
    });
    view.focus();
  });
}

/** 插入文本（替换选区） */
export function insertText(text: string): void {
  withEditorView((view) => {
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
      scrollIntoView: true,
    });
    view.focus();
  });
}

/** 在光标处插入块级内容，必要时补空行 */
export function insertBlock(text: string): void {
  withEditorView((view) => {
    const { state } = view;
    const range = state.selection.main;
    const lineStart = state.doc.lineAt(range.from).from;
    const before = state.sliceDoc(Math.max(0, lineStart - 2), lineStart);
    const prefix = lineStart === 0 || before.endsWith("\n\n") ? "" : "\n";
    const insert = `${prefix}${text}\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
      scrollIntoView: true,
    });
    view.focus();
  });
}

export function toggleBold(): void {
  wrapSelection("**", "**", "粗体");
}
export function toggleItalic(): void {
  wrapSelection("*", "*", "斜体");
}
export function toggleStrikethrough(): void {
  wrapSelection("~~", "~~", "删除线");
}
export function toggleInlineCode(): void {
  wrapSelection("`", "`", "代码");
}
export function toggleSuperscript(): void {
  wrapSelection("^", "^", "上标");
}
export function toggleSubscript(): void {
  wrapSelection("~", "~", "下标");
}
export function insertLink(): void {
  wrapSelection("[", "](https://)", "链接文字");
}
export function insertImage(): void {
  wrapSelection("![", "](assets/image.png)", "图片描述");
}

/* ------------------------------ 块级结构 ------------------------------ */

/** 设置标题级别；level=0 表示普通段落；再次点击同级标题可取消 */
export function setHeading(level: number): void {
  withEditorView((view) => {
    const { state } = view;
    const changes: ChangeSpec[] = [];
    for (const line of selectedLines(state)) {
      const text = line.text;
      const existing = HEADING_RE.exec(text);
      let next: string;
      if (existing && (existing[1].length === level || level === 0)) {
        next = text.slice(existing[0].length);
      } else if (level === 0) {
        next = text;
      } else {
        next = `${"#".repeat(level)} ${existing ? text.slice(existing[0].length) : text}`;
      }
      if (next !== text) changes.push({ from: line.from, to: line.to, insert: next });
    }
    applyChanges(view, changes);
    view.focus();
  });
}

/** 整体提升 / 降低标题级别 */
export function shiftHeading(delta: number): void {
  withEditorView((view) => {
    const { state } = view;
    const changes: ChangeSpec[] = [];
    for (const line of selectedLines(state)) {
      const text = line.text;
      const existing = HEADING_RE.exec(text);
      if (!existing) continue;
      const level = Math.max(1, Math.min(6, existing[1].length + delta));
      const next = `${"#".repeat(level)} ${text.slice(existing[0].length)}`;
      if (next !== text) changes.push({ from: line.from, to: line.to, insert: next });
    }
    applyChanges(view, changes);
    view.focus();
  });
}

/** 切换列表类型（再次应用同类型则取消列表） */
export function toggleList(kind: ListKind): void {
  withEditorView((view) => {
    const { state } = view;
    const lines = selectedLines(state);
    const allSame = lines.every((line) => {
      const text = line.text;
      if (kind === "task") return isTaskLine(text);
      if (kind === "bullet") return isBulletLine(text);
      return isOrderedLine(text);
    });

    const changes: ChangeSpec[] = [];
    let index = 0;
    for (const line of lines) {
      const text = line.text;
      const stripped = stripMarkers(text);
      const indent = /^\s*/.exec(stripped)?.[0] ?? "";
      const body = stripped.slice(indent.length);
      let next: string;
      if (allSame) {
        next = stripped;
      } else if (kind === "task") {
        next = `${indent}- [ ] ${body}`;
      } else if (kind === "bullet") {
        next = `${indent}- ${body}`;
      } else {
        next = `${indent}${index + 1}. ${body}`;
      }
      index += 1;
      if (next !== text) changes.push({ from: line.from, to: line.to, insert: next });
    }
    applyChanges(view, changes);
    view.focus();
  });
}

/** 切换引用块 */
export function toggleQuote(): void {
  withEditorView((view) => {
    const { state } = view;
    const lines = selectedLines(state);
    const allQuoted = lines.every((line) => isQuoteLine(line.text));
    const changes: ChangeSpec[] = lines.map((line) => {
      const text = line.text;
      const next = allQuoted
        ? text.replace(/^(\s*)>\s?/, "$1")
        : `> ${text}`;
      return { from: line.from, to: line.to, insert: next };
    });
    applyChanges(view, changes);
    view.focus();
  });
}

/** 插入提示块：> [!NOTE] 标题 */
export function insertCallout(type: CalloutType = "note"): void {
  withEditorView((view) => {
    const { state } = view;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const label = type.toUpperCase();

    if (!selected) {
      const template = `> [!${label}]\n> 在此输入内容\n`;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: template },
        selection: {
          anchor: range.from + `> [!${label}]\n> `.length,
          head: range.from + `> [!${label}]\n> `.length + 6,
        },
        scrollIntoView: true,
      });
      view.focus();
      return;
    }

    const lines = selected.split(/\r?\n/);
    const body =
      lines.length === 1
        ? `> [!${label}] ${lines[0]}`
        : `> [!${label}]\n${lines.map((l) => `> ${l}`).join("\n")}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: body },
      selection: { anchor: range.from + body.length },
      scrollIntoView: true,
    });
    view.focus();
  });
}

/** 插入表格 */
export function insertTable(cols = 3, rows = 3): void {
  const width = Math.max(1, Math.min(8, cols));
  const height = Math.max(1, Math.min(20, rows));
  const header = `| ${Array.from({ length: width }, (_, i) => `列 ${i + 1}`).join(" | ")} |`;
  const divider = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  const body = Array.from(
    { length: height },
    () => `| ${Array.from({ length: width }, () => "   ").join(" | ")} |`,
  ).join("\n");
  insertBlock(`${header}\n${divider}\n${body}`);
}

/** 插入水平分割线 */
export function insertHorizontalRule(): void {
  insertBlock("---");
}

/** 插入代码块（围绕选中内容） */
export function insertCodeBlock(lang = ""): void {
  withEditorView((view) => {
    const { state } = view;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to) || "代码";
    const fence = "```";
    const block = `${fence}${lang}\n${selected}\n${fence}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: block },
      selection: {
        anchor: range.from + fence.length + lang.length + 1,
        head: range.from + fence.length + lang.length + 1 + selected.length,
      },
      scrollIntoView: true,
    });
    view.focus();
  });
}

/** 插入当前日期时间 */
export function insertDateTime(): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  insertText(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}`,
  );
}

/** 依据文档标题生成目录 */
export function insertToc(): void {
  withEditorView((view) => {
    const headings = parseHeadings(view.state.doc.toString());
    if (headings.length === 0) {
      insertText("- （当前文档没有标题）");
      return;
    }
    const lines = headings
      .map((h) => {
        const indent = "  ".repeat(Math.max(0, h.level - 1));
        return `${indent}- [${h.text || "未命名"}](#${h.id})`;
      })
      .join("\n");
    insertBlock(`## 目录\n\n${lines}`);
  });
}

/* ------------------------------ 行操作 ------------------------------ */

/** 上下移动选中行 */
export function moveLines(direction: -1 | 1): void {
  withEditorView((view) => {
    const { state } = view;
    const sel = state.selection.main;
    const startLine = state.doc.lineAt(sel.from);
    const endLine = state.doc.lineAt(sel.to);

    if (direction === -1) {
      if (startLine.number === 1) return;
      const prev = state.doc.line(startLine.number - 1);
      const block = state.sliceDoc(startLine.from, endLine.to);
      const shift = prev.length + 1;
      view.dispatch({
        changes: {
          from: prev.from,
          to: endLine.to,
          insert: `${block}\n${prev.text}`,
        },
        selection: EditorSelection.range(sel.from - shift, sel.to - shift),
        scrollIntoView: true,
      });
      return;
    }

    if (endLine.number === state.doc.lines) return;
    const next = state.doc.line(endLine.number + 1);
    const block = state.sliceDoc(startLine.from, endLine.to);
    const shift = next.length + 1;
    view.dispatch({
      changes: {
        from: startLine.from,
        to: next.to,
        insert: `${next.text}\n${block}`,
      },
      selection: EditorSelection.range(sel.from + shift, sel.to + shift),
      scrollIntoView: true,
    });
  });
}

/** 复制选中行 */
export function duplicateLines(): void {
  withEditorView((view) => {
    const { state } = view;
    const sel = state.selection.main;
    const startLine = state.doc.lineAt(sel.from);
    const endLine = state.doc.lineAt(sel.to);
    const block = state.sliceDoc(startLine.from, endLine.to);
    const insert = `\n${block}`;
    view.dispatch({
      changes: { from: endLine.to, to: endLine.to, insert },
      selection: EditorSelection.range(sel.from, sel.to),
      scrollIntoView: true,
    });
  });
}

/** 删除选中行 */
export function deleteLines(): void {
  withEditorView((view) => {
    const { state } = view;
    const sel = state.selection.main;
    const startLine = state.doc.lineAt(sel.from);
    const endLine = state.doc.lineAt(sel.to);
    let from = startLine.from;
    let to = endLine.to;
    if (to < state.doc.length) to += 1;
    else if (from > 0) from -= 1;
    view.dispatch({
      changes: { from, to, insert: "" },
      selection: { anchor: Math.min(from, state.doc.length) },
      scrollIntoView: true,
    });
    view.focus();
  });
}

/** 切换当前行的任务勾选状态 */
export function toggleTaskAtCursor(): void {
  withEditorView((view) => {
    const { state } = view;
    const changes: ChangeSpec[] = [];
    for (const line of selectedLines(state)) {
      const text = line.text;
      const task = TASK_RE.exec(text);
      if (task) {
        const checked = task[3].toLowerCase() === "x";
        const next = text.replace(TASK_RE, `$1$2 [${checked ? " " : "x"}] `);
        changes.push({ from: line.from, to: line.to, insert: next });
      } else {
        const stripped = stripMarkers(text);
        const indent = /^\s*/.exec(stripped)?.[0] ?? "";
        changes.push({
          from: line.from,
          to: line.to,
          insert: `${indent}- [ ] ${stripped.slice(indent.length)}`,
        });
      }
    }
    applyChanges(view, changes);
    view.focus();
  });
}

/** 大小写转换 */
export function transformCase(kind: "upper" | "lower" | "title"): void {
  withEditorView((view) => {
    const { state } = view;
    const range = selectionRange(state);
    const selected = state.sliceDoc(range.from, range.to);
    if (!selected) return;
    let next = selected;
    if (kind === "upper") next = selected.toUpperCase();
    else if (kind === "lower") next = selected.toLowerCase();
    else
      next = selected.replace(/\b([a-z])(\w*)/gi, (_, first: string, rest: string) =>
        `${first.toUpperCase()}${rest}`,
      );
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: next },
      selection: { anchor: range.from, head: range.from + next.length },
    });
    view.focus();
  });
}

/* ------------------------------ 视图辅助 ------------------------------ */

export function focusEditor(): void {
  withEditorView((view) => view.focus());
}

/** 跳转到指定行（0 起） */
export function scrollToLine(line: number): void {
  withEditorView((view) => {
    const doc = view.state.doc;
    const clamped = Math.min(Math.max(1, line + 1), doc.lines);
    const info = doc.line(clamped);
    view.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: "start", yMargin: 24 }),
    });
    view.focus();
  });
}

/** 选中并滚动到指定偏移区间 */
export function selectRange(from: number, to: number, focus = false): void {
  withEditorView((view) => {
    const max = view.state.doc.length;
    const start = Math.min(from, max);
    const end = Math.min(to, max);
    view.dispatch({
      selection: EditorSelection.range(start, end),
      effects: EditorView.scrollIntoView(start, { y: "center" }),
    });
    if (focus) view.focus();
  });
}
