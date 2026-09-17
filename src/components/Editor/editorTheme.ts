import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * CodeMirror 主题：颜色全部走 CSS 变量（见 styles.css），
 * 因此深浅色切换只需替换 highlight 样式。
 */
const lightHighlight = HighlightStyle.define([
  { tag: t.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#cf222e" },
  { tag: [t.string, t.special(t.string)], color: "#0a3069" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#953800" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#0550ae", fontWeight: "600" },
  { tag: [t.strong], fontWeight: "600" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#0550ae", textDecoration: "underline" },
  { tag: [t.monospace], color: "#0a3069" },
  { tag: [t.quote], color: "#616a75" },
  { tag: [t.list, t.meta], color: "#8250df" },
  { tag: [t.tagName, t.typeName, t.className], color: "#8250df" },
  { tag: [t.attributeName, t.propertyName], color: "#0550ae" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#953800" },
  { tag: [t.function(t.variableName), t.labelName], color: "#8250df" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#6e7781" },
  { tag: t.invalid, color: "#cf222e" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: t.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#ff7b72" },
  { tag: [t.string, t.special(t.string)], color: "#a5d6ff" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#ffa657" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#79c0ff", fontWeight: "600" },
  { tag: [t.strong], fontWeight: "600" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#79c0ff", textDecoration: "underline" },
  { tag: [t.monospace], color: "#a5d6ff" },
  { tag: [t.quote], color: "#a3a8b0" },
  { tag: [t.list, t.meta], color: "#d2a8ff" },
  { tag: [t.tagName, t.typeName, t.className], color: "#d2a8ff" },
  { tag: [t.attributeName, t.propertyName], color: "#79c0ff" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#ffa657" },
  { tag: [t.function(t.variableName), t.labelName], color: "#d2a8ff" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#8b949e" },
  { tag: t.invalid, color: "#f85149" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

/** 基础主题（背景/光标等由 styles.css 统一接管，这里只补 CodeMirror 内部变量） */
const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-size)" },
  ".cm-content": {
    caretColor: "var(--accent)",
    fontFamily: "var(--font-mono)",
    padding: "10px 0 40vh 4px",
  },
  ".cm-line": { padding: "0 12px 0 6px" },
  ".cm-gutters": { fontFamily: "var(--font-mono)" },
  ".cm-foldPlaceholder": {
    background: "var(--bg-hover)",
    border: "none",
    color: "var(--text-muted)",
    padding: "0 4px",
    borderRadius: "4px",
  },
  ".cm-selectionMatch": { background: "var(--accent-soft)" },
  ".cm-searchMatch": { background: "var(--mark-bg)" },
  ".cm-searchMatch.cm-searchMatch-selected": { background: "var(--accent)" },
});

export function createEditorTheme(dark: boolean): Extension[] {
  return [baseTheme, syntaxHighlighting(dark ? darkHighlight : lightHighlight)];
}
