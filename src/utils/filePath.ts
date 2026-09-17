import {
  MARKDOWN_EXTENSIONS,
  OPENABLE_EXTENSIONS,
  TEXT_EXTENSIONS,
} from "./constants";

/** 统一使用反斜杠，便于 Windows 路径比较 */
export function normalizeSlashes(p: string): string {
  return p.replace(/[\\/]+/g, "\\");
}

export function extName(p: string): string {
  const base = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : "";
}

export function fileName(p: string | null | undefined): string {
  if (!p) return "未命名";
  const base = p.split(/[\\/]/).pop();
  return base && base.length > 0 ? base : p;
}

export function dirName(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx > 0 ? p.slice(0, idx) : "";
}

export function isMarkdownPath(p: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extName(p));
}

export function isTextPath(p: string): boolean {
  return TEXT_EXTENSIONS.includes(extName(p));
}

export function isOpenablePath(p: string): boolean {
  const ext = extName(p);
  return ext === "" ? false : OPENABLE_EXTENSIONS.includes(ext);
}

/** Windows 路径比较：忽略大小写与分隔符差异 */
export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return normalizeSlashes(a).toLowerCase() === normalizeSlashes(b).toLowerCase();
}

/** 是否是外部 URL（http/https/mailto/data/asset 等） */
export function isExternalUrl(src: string): boolean {
  return /^(https?:|mailto:|tel:|data:|asset:|blob:|#)/i.test(src.trim());
}

/** 是否是绝对本地路径（C:\ 或 \\server 或 /） */
export function isAbsoluteLocalPath(src: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("\\\\") || src.startsWith("/");
}

/** 拼接目录与相对路径 */
export function joinPath(dir: string, rel: string): string {
  if (!dir) return rel;
  const d = dir.replace(/[\\/]+$/, "");
  const r = rel.replace(/^[\\/]+/, "");
  return `${d}\\${r.replace(/\//g, "\\")}`;
}

/**
 * 把 Markdown 中的图片地址解析为本地绝对路径。
 * 已保存文档的相对路径基于文档目录解析；未保存文档返回 null（无法解析）。
 */
export function resolveLocalImagePath(
  docPath: string | null,
  src: string,
): string | null {
  const raw = src.trim();
  if (!raw || isExternalUrl(raw)) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  // 去掉查询串与锚点
  decoded = decoded.split("#")[0].split("?")[0];
  if (!decoded) return null;
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith("\\\\")) {
    return decoded.replace(/\//g, "\\");
  }
  if (!docPath) return null;
  const dir = dirName(docPath);
  if (!dir) return null;
  return joinPath(dir, decoded);
}

/** 相对路径（用于状态栏/提示展示） */
export function relativeToDoc(docPath: string | null, target: string): string {
  if (!docPath) return target;
  const dir = normalizeSlashes(dirName(docPath)).toLowerCase();
  const t = normalizeSlashes(target);
  if (dir && t.toLowerCase().startsWith(dir + "\\")) {
    return t.slice(dir.length + 1);
  }
  return target;
}

/** 读取用于展示的编码名 */
export function encodingLabel(): string {
  return "UTF-8";
}
