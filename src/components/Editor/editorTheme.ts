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

/**
 * 红绿色弱友好语法高亮（基于 Okabe-Ito 无障碍色板）：
 * - 避免将红与绿、橙红与黄绿用于需要区分的语法成分
 * - 关键字采用洋红紫 + 半粗体（兼具色相与字重双重线索）
 * - 字符串采用高辨识度天青蓝，数字与常量采用暖琥珀金，函数采用靛紫
 * - 错误语法附加波浪下划线，不依赖纯颜色识别
 */
const lightColorblindHighlight = HighlightStyle.define([
  { tag: t.comment, color: "#64748b", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#9d174d", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "#005a8d" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#b45309", fontWeight: "500" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#0072b2", fontWeight: "700" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#0072b2", textDecoration: "underline" },
  { tag: [t.monospace], color: "#005a8d" },
  { tag: [t.quote], color: "#475569" },
  { tag: [t.list, t.meta], color: "#6d28d9" },
  { tag: [t.tagName, t.typeName, t.className], color: "#0f766e", fontWeight: "600" },
  { tag: [t.attributeName, t.propertyName], color: "#0369a1" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#c2410c" },
  { tag: [t.function(t.variableName), t.labelName], color: "#6d28d9", fontWeight: "500" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#475569" },
  { tag: t.invalid, color: "#d55e00", textDecoration: "underline wavy" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

const darkColorblindHighlight = HighlightStyle.define([
  { tag: t.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#f472b6", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "#56b4e9" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#f59e0b", fontWeight: "500" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#56b4e9", fontWeight: "700" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#56b4e9", textDecoration: "underline" },
  { tag: [t.monospace], color: "#56b4e9" },
  { tag: [t.quote], color: "#94a3b8" },
  { tag: [t.list, t.meta], color: "#c084fc" },
  { tag: [t.tagName, t.typeName, t.className], color: "#38bdf8", fontWeight: "600" },
  { tag: [t.attributeName, t.propertyName], color: "#7dd3fc" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#fbbf24" },
  { tag: [t.function(t.variableName), t.labelName], color: "#c084fc", fontWeight: "500" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#94a3b8" },
  { tag: t.invalid, color: "#ff6e40", textDecoration: "underline wavy" },
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

export function createEditorTheme(dark: boolean, colorblindMode = false): Extension[] {
  const style = colorblindMode
    ? dark
      ? darkColorblindHighlight
      : lightColorblindHighlight
    : dark
      ? darkHighlight
      : lightHighlight;
  return [baseTheme, syntaxHighlighting(style)];
}
