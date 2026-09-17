import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { askConfirm, showMessage } from "../stores/dialogStore";
import { extName, fileName } from "./filePath";
import { escapeHtml } from "./markdown";

export interface ExportOptions {
  title: string;
  /** 预览区域的 DOM 节点（含已渲染的 Mermaid / KaTeX） */
  source: HTMLElement | null;
  /** 是否把本地图片内联为 Base64 */
  inlineImages: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** 复制预览节点：去掉搜索高亮标记，得到干净的 HTML */
function clonePreview(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("mark.search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  clone.querySelectorAll("input[type=checkbox]").forEach((box) => {
    box.removeAttribute("disabled");
  });
  return clone;
}

/** 把本地图片替换为 Base64 data URI */
async function inlineLocalImages(root: HTMLElement): Promise<number> {
  const images = Array.from(root.querySelectorAll("img"));
  let count = 0;
  for (const img of images) {
    const localPath = img.getAttribute("data-local-path");
    if (!localPath) continue;
    try {
      const base64 = await invoke<string>("read_file_as_base64", {
        path: localPath,
      });
      const mime = MIME_BY_EXT[extName(localPath)] ?? "image/png";
      img.setAttribute("src", `data:${mime};base64,${base64}`);
      img.removeAttribute("data-local-path");
      count += 1;
    } catch {
      /* 单个图片失败不影响整体导出 */
    }
  }
  return count;
}

/** 导出的单文件 HTML 样式（自包含，跟随系统深浅色） */
const EXPORT_CSS = `
:root{--bg:#fff;--panel:#f6f7f9;--border:#e4e6eb;--text:#1f2328;--muted:#616a75;--accent:#2563eb;--code-bg:#f6f8fa}
@media (prefers-color-scheme: dark){:root{--bg:#1e1f22;--panel:#26282c;--border:#34363b;--text:#e6e7e9;--muted:#a3a8b0;--accent:#4c8dff;--code-bg:#24262a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;font-size:15px;line-height:1.75}
.wrap{max-width:860px;margin:0 auto;padding:48px 28px 96px}
.md-body img{max-width:100%;border-radius:6px}
.md-body h1,.md-body h2,.md-body h3,.md-body h4,.md-body h5,.md-body h6{font-weight:600;line-height:1.3;margin:1.6em 0 .7em}
.md-body h1{font-size:1.9em;padding-bottom:.3em;border-bottom:1px solid var(--border)}
.md-body h2{font-size:1.45em;padding-bottom:.25em;border-bottom:1px solid var(--border)}
.md-body h3{font-size:1.2em}.md-body h4{font-size:1.05em}
.md-body h5,.md-body h6{font-size:.95em;color:var(--muted)}
.md-body a{color:var(--accent);text-decoration:none}.md-body a:hover{text-decoration:underline}
.md-body code{font-family:"Cascadia Mono",Consolas,monospace;font-size:.88em;background:var(--code-bg);border:1px solid var(--border);border-radius:5px;padding:.12em .35em}
.md-body pre{margin:1em 0;background:var(--code-bg);border:1px solid var(--border);border-radius:8px;overflow:auto}
.md-body pre code{display:block;padding:.9em 1em;background:none;border:none;font-size:.86em;line-height:1.6}
.md-body blockquote{margin:.9em 0;padding:.2em 1em;color:var(--muted);border-left:3px solid var(--border);background:var(--panel);border-radius:0 8px 8px 0}
.md-body table{border-collapse:collapse;margin:1em 0;display:block;width:max-content;max-width:100%;overflow:auto}
.md-body th,.md-body td{padding:.45em .85em;border:1px solid var(--border)}
.md-body th{background:var(--panel);font-weight:600}
.md-body hr{height:1px;border:none;background:var(--border);margin:1.8em 0}
.md-body ul,.md-body ol{padding-left:1.6em}
.md-body .task-item{list-style:none;margin-left:-1.35em}
.md-body .mermaid-block{margin:1em 0;padding:1em;background:var(--panel);border:1px solid var(--border);border-radius:8px;text-align:center;overflow-x:auto}
.md-body .front-matter{margin-bottom:1.5em;padding:.75em 1em;border:1px solid var(--border);border-radius:8px;background:var(--panel);font-size:.9em}
.front-matter dl{display:grid;grid-template-columns:minmax(80px,max-content) 1fr;gap:.25em 1em;margin:0}
.front-matter dt{color:var(--muted);font-family:Consolas,monospace}
.front-matter dd{margin:0}
.hljs{color:var(--text)}
.hljs-comment,.hljs-quote{color:#8b949e;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag,.hljs-name{color:#cf222e}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#0a3069}
.hljs-number,.hljs-variable,.hljs-template-variable,.hljs-type{color:#953800}
.hljs-title,.hljs-section,.hljs-title.class_,.hljs-title.function_{color:#8250df}
.hljs-attr,.hljs-selector-class,.hljs-selector-id,.hljs-symbol,.hljs-built_in{color:#0550ae}
@media (prefers-color-scheme: dark){
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag,.hljs-name{color:#ff7b72}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#a5d6ff}
.hljs-number,.hljs-variable,.hljs-template-variable,.hljs-type{color:#ffa657}
.hljs-title,.hljs-section,.hljs-title.class_,.hljs-title.function_{color:#d2a8ff}
.hljs-attr,.hljs-selector-class,.hljs-selector-id,.hljs-symbol,.hljs-built_in{color:#79c0ff}
}
`;

export function buildExportHtml(
  title: string,
  bodyHtml: string,
  embeddedImages: number,
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="wrap">
<div class="md-body">
${bodyHtml}
</div>
</div>
<!-- 内联图片 ${embeddedImages} 张；由 mastermd 导出 -->
</body>
</html>
`;
}

/** 导出为单文件 HTML */
export async function exportHtmlFile(options: ExportOptions): Promise<boolean> {
  if (!options.source) {
    await showMessage("导出失败", "当前没有可导出的预览内容。");
    return false;
  }
  let inlineImages = false;
  if (options.source.querySelector("img[data-local-path]")) {
    inlineImages = await askConfirm({
      title: "导出 HTML",
      message:
        "文档包含本地图片。是否将图片以 Base64 内联到 HTML 中？\n\n内联后文件体积会增大，但可以单独分享而不丢失图片。",
      confirmText: "内联图片",
      cancelText: "仅保留路径",
    });
  }

  const clone = clonePreview(options.source);
  const embedded = inlineImages ? await inlineLocalImages(clone) : 0;
  const html = buildExportHtml(options.title, clone.innerHTML, embedded);

  try {
    const target = await saveDialog({
      title: "导出为 HTML",
      defaultPath: `${options.title.replace(/\.[^.]+$/, "") || "document"}.html`,
      filters: [{ name: "HTML 文件", extensions: ["html", "htm"] }],
    });
    if (!target) return false;
    await invoke<number>("write_markdown_file", { path: target, content: html });
    void fileName(target);
    return true;
  } catch (error) {
    await showMessage("导出失败", String(error));
    return false;
  }
}
