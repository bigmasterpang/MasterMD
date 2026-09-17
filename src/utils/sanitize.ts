import DOMPurify from "dompurify";

/**
 * 所有渲染结果在注入 DOM 前都必须经过这里。
 * markdown-it 已关闭原始 HTML；这里作为第二道防线，同时允许渲染所需的少量属性。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "input"],
    ADD_ATTR: [
      "id",
      "class",
      "data-tex",
      "data-line",
      "data-code",
      "checked",
      "disabled",
      "type",
      "align",
      "colspan",
      "rowspan",
      "start",
      "value",
    ],
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "link",
      "meta",
      "base",
    ],
    // 阻断 javascript: 等危险协议
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|data|asset|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: true,
    USE_PROFILES: { html: true },
  }) as string;
}
