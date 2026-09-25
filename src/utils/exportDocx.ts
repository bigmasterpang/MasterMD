import type { Token } from "markdown-it";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { showMessage } from "../stores/dialogStore";
import { dirName, joinPath, isExternalUrl } from "./filePath";
import { MIME_BY_EXT, loadImageBinary } from "./exportShared";
import { extName } from "./filePath";
import { escapeHtml } from "./markdown";

type DocxModule = typeof import("docx");

interface ImageAsset {
  data: Uint8Array;
  width: number;
  height: number;
}

/** 预扫描并加载文档内所有本地图片（远程图片跳过） */
async function preloadImages(
  tokens: Token[],
  docPath: string | null,
): Promise<Map<string, ImageAsset>> {
  const map = new Map<string, ImageAsset>();
  const sources = new Set<string>();

  const visit = (list: Token[]) => {
    for (const token of list) {
      if (token.type === "image") {
        const src = String(token.attrGet("src") ?? "");
        if (src && !isExternalUrl(src)) sources.add(src);
      }
      if (token.children) visit(token.children);
      if (token.type === "inline" && token.children) visit(token.children);
    }
  };
  visit(tokens);

  for (const src of sources) {
    try {
      let dataUrl = src;
      if (!src.startsWith("data:")) {
        if (!docPath) continue;
        const abs = /^[a-zA-Z]:[\\/]/.test(src) ? src : joinPath(dirName(docPath), decodeURIComponent(src));
        const base64 = await invoke<string>("read_file_as_base64", { path: abs });
        const mime = MIME_BY_EXT[extName(abs)] ?? "image/png";
        dataUrl = `data:${mime};base64,${base64}`;
      }
      const asset = await loadImageBinary(dataUrl);
      if (asset) map.set(src, asset);
    } catch {
      /* 单张图片失败忽略 */
    }
  }
  return map;
}

interface InlineResult {
  runs: unknown[];
}

/** 将 inline token 转换为 docx 的 TextRun 序列 */
function inlineToRuns(
  docx: DocxModule,
  token: Token,
  images: Map<string, ImageAsset>,
): InlineResult {
  const { TextRun, ExternalHyperlink, ImageRun } = docx;
  const runs: unknown[] = [];
  const children = token.children ?? [];

  let bold = 0;
  let italic = 0;
  let strike = 0;
  let superScript = 0;
  let subScript = 0;
  let linkHref: string | null = null;
  let linkBuffer: unknown[] = [];

  const makeRun = (text: string, extra: Record<string, unknown> = {}) =>
    new TextRun({
      text,
      bold: bold > 0,
      italics: italic > 0,
      strike: strike > 0,
      superScript: superScript > 0,
      subScript: subScript > 0,
      ...extra,
    });

  const push = (run: unknown) => {
    if (linkHref) linkBuffer.push(run);
    else runs.push(run);
  };

  const flushLink = () => {
    if (linkHref && linkBuffer.length > 0) {
      runs.push(new ExternalHyperlink({ children: linkBuffer as never, link: linkHref }));
    }
    linkBuffer = [];
    linkHref = null;
  };

  for (const child of children) {
    switch (child.type) {
      case "text":
        push(makeRun(child.content));
        break;
      case "code_inline":
        push(
          new TextRun({
            text: child.content,
            font: "Consolas",
            size: 20,
            shading: { fill: "F2F2F2" },
          }),
        );
        break;
      case "strong_open":
        bold += 1;
        break;
      case "strong_close":
        bold = Math.max(0, bold - 1);
        break;
      case "em_open":
        italic += 1;
        break;
      case "em_close":
        italic = Math.max(0, italic - 1);
        break;
      case "s_open":
        strike += 1;
        break;
      case "s_close":
        strike = Math.max(0, strike - 1);
        break;
      case "sup":
        superScript += 1;
        break;
      case "sub":
        subScript += 1;
        break;
      case "link_open":
        linkHref = String(child.attrGet("href") ?? "");
        break;
      case "link_close":
        flushLink();
        break;
      case "softbreak":
      case "hardbreak":
        push(new TextRun({ break: 1 }));
        break;
      case "math_inline":
        push(makeRun(`$${child.content}$`));
        break;
      case "image": {
        const src = String(child.attrGet("src") ?? "");
        const asset = images.get(src);
        if (asset) {
          const maxWidth = 560;
          const scale = Math.min(1, maxWidth / (asset.width || maxWidth));
          const width = Math.max(24, Math.round(asset.width * scale));
          const height = Math.max(24, Math.round((asset.height || asset.width) * scale));
          push(
            new ImageRun({
              data: asset.data,
              transformation: { width, height },
              type: pickImageType(src),
            } as never),
          );
        } else {
          push(new TextRun({ text: `[图片: ${child.content || src}]`, italics: true, color: "888888" }));
        }
        break;
      }
      case "html_inline":
      case "entity":
        break;
      default:
        if (child.content && child.nesting === 0) {
          push(makeRun(child.content));
        }
        break;
    }
  }
  flushLink();
  return { runs };
}

function pickImageType(src: string): "png" | "jpg" | "gif" | "bmp" | "svg" {
  const ext = extName(src.split(/[?#]/)[0]);
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "gif") return "gif";
  if (ext === "bmp") return "bmp";
  if (ext === "svg") return "svg";
  return "png";
}

/** Markdown 源码 → docx 文档（异步，需加载图片） */
export async function buildDocxBlob(
  _source: string,
  tokens: Token[],
  docPath: string | null,
  title: string,
): Promise<Blob> {
  const docx = await import("docx");
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    LevelFormat,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    BorderStyle,
  } = docx;

  const images = await preloadImages(tokens, docPath);
  const children: unknown[] = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 36 })],
      spacing: { after: 240 },
    }),
  ];

  const HEADINGS = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];

  let listDepth = 0;
  let orderedDepth = -1;
  let quoteDepth = 0;
  let inTable = false;
  let tableRows: unknown[] = [];
  let tableCells: unknown[] = [];

  const paragraphFromInline = (token: Token, extra: Record<string, unknown> = {}) => {
    const { runs } = inlineToRuns(docx, token, images);
    return new Paragraph({
      children: runs as never,
      ...extra,
    });
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    switch (token.type) {
      case "heading_open": {
        const level = Number(token.tag.slice(1)) || 1;
        if (next?.type === "inline") {
          const { runs } = inlineToRuns(docx, next, images);
          children.push(
            new Paragraph({
              children: runs as never,
              heading: HEADINGS[level - 1],
              spacing: { before: 200, after: 100 },
            }),
          );
          i += 2; // 跳过 inline 与 heading_close
        }
        break;
      }
      case "paragraph_open": {
        if (next?.type === "inline" && !inTable) {
          if (next.children?.some((c) => c.type === "html_inline")) break;
          children.push(
            paragraphFromInline(next, {
              spacing: { after: 140 },
              indent: quoteDepth > 0 ? { left: 360 * quoteDepth } : undefined,
            }),
          );
          i += 2;
        }
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        listDepth += 1;
        if (token.type === "ordered_list_open") orderedDepth = listDepth;
        break;
      }
      case "bullet_list_close":
      case "ordered_list_close": {
        if (token.type === "ordered_list_close") orderedDepth = -1;
        listDepth = Math.max(0, listDepth - 1);
        break;
      }
      case "list_item_open": {
        if (next?.type === "paragraph_open") {
          const inline = tokens[i + 2];
          if (!inline || inline.type !== "inline") break;
          const isTask = /^\[[ xX]\]\s*/.test(inline.content);
          const checked = /^\[[xX]\]/.test(inline.content);
          if (isTask) {
            const first = inline.children?.[0];
            if (first && first.type === "text") {
              first.content = first.content.replace(/^\[[ xX]\]\s*/, "");
            }
          }
          const level = Math.max(0, listDepth - 1);
          const ordered = orderedDepth !== -1;
          const extra = isTask
            ? { bullet: { level } }
            : ordered
              ? { numbering: { reference: "md-ordered", level } }
              : { bullet: { level } };
          const paragraph = paragraphFromInline(inline, {
            ...extra,
            spacing: { after: 60 },
          });
          children.push(paragraph);
          if (isTask) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: checked ? "☑ 已完成" : "☐ 未完成",
                    size: 18,
                    color: "888888",
                  }),
                ],
                spacing: { after: 60 },
                indent: { left: 360 * (level + 1) },
              }),
            );
          }
          i += 2;
        }
        break;
      }
      case "blockquote_open":
        quoteDepth += 1;
        break;
      case "blockquote_close":
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case "fence":
      case "code_block": {
        const lines = token.content.replace(/\n$/, "").split("\n");
        for (const line of lines) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: line || " ", font: "Consolas", size: 18 }),
              ],
              shading: { fill: "F6F8FA" },
              spacing: { after: 0 },
              indent: { left: 240 },
            }),
          );
        }
        children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        break;
      }
      case "table_open":
        inTable = true;
        tableRows = [];
        break;
      case "tr_open":
        tableCells = [];
        break;
      case "th_open":
      case "td_open": {
        const inline = tokens[i + 1];
        if (inline?.type === "inline") {
          const { runs } = inlineToRuns(docx, inline, images);
          tableCells.push(
            new TableCell({
              children: [new Paragraph({ children: runs as never })],
            }),
          );
          i += 1;
        }
        break;
      }
      case "tr_close":
        tableRows.push(new TableRow({ children: tableCells as never }));
        break;
      case "table_close":
        children.push(
          new Table({
            rows: tableRows as never,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
            },
          }),
        );
        children.push(new Paragraph({ children: [], spacing: { after: 160 } }));
        inTable = false;
        break;
      case "hr":
        children.push(
          new Paragraph({
            children: [],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D7DE", space: 1 },
            },
            spacing: { after: 200 },
          }),
        );
        break;
      default:
        break;
    }
  }

  const document = new Document({
    creator: "Master Wang (王大师)",
    title,
    description: "由 MasterEdit 导出 · Master Wang（王大师）",
    numbering: {
      config: [
        {
          reference: "md-ordered",
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
          })),
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: children as never,
      },
    ],
  });

  return Packer.toBlob(document);
}

export interface DocxExportOptions {
  source: string;
  tokens: Token[];
  docPath: string | null;
  title: string;
}

/** 导出 DOCX（浏览器内生成，落盘走 Rust base64 写入） */
export async function exportDocxFile(options: DocxExportOptions): Promise<boolean> {
  try {
    const blob = await buildDocxBlob(
      options.source,
      options.tokens,
      options.docPath,
      options.title,
    );
    const buffer = new Uint8Array(await blob.arrayBuffer());
    const base64 = bytesToBase64(buffer);

    const path = await saveDialog({
      title: "导出为 Word 文档",
      defaultPath: `${options.title}.docx`,
      filters: [{ name: "Word 文档", extensions: ["docx"] }],
    });
    if (!path) return false;
    await invoke<number>("write_binary_file", { path, base64 });
    return true;
  } catch (error) {
    await showMessage("导出 DOCX 失败", String(error));
    return false;
  }
}

/** Uint8Array → base64（分块，避免超长参数） */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export { escapeHtml };
