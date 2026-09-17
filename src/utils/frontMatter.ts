import type { HeadingItem } from "../types";

/**
 * 解析 YAML front matter。
 * 只支持常见的扁平结构（key: value / key: 列表 / 引号字符串）。
 * 解析失败（嵌套对象等）时返回 data=null，正文保持原样，降级为普通文本渲染。
 */

export interface FrontMatterResult {
  /** 解析出的键值对，null 表示没有或解析失败 */
  data: Record<string, unknown> | null;
  /** 去掉 front matter 之后的正文 */
  body: string;
  /** front matter 原始文本（不含 --- 分隔行） */
  raw: string | null;
}

const FM_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function parseScalar(value: string): unknown {
  const v = value.trim();
  if (!v) return "";
  // 行内数组 [a, b, c]
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => parseScalar(s));
  }
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
    (v.startsWith("'") && v.endsWith("'") && v.length > 1)
  ) {
    return v.slice(1, -1);
  }
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v)) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseYamlLite(text: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indented = /^[ \t]/.test(raw);
    const line = raw.trim();

    if (line.startsWith("- ")) {
      if (currentKey === null) return null;
      const arr = Array.isArray(out[currentKey]) ? (out[currentKey] as unknown[]) : [];
      arr.push(parseScalar(line.slice(2)));
      out[currentKey] = arr;
      continue;
    }
    if (indented) {
      // 嵌套结构暂不支持，降级处理
      return null;
    }
    const m = /^([^:]+):(.*)$/.exec(line);
    if (!m) return null;
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    if (!key) return null;
    currentKey = key;
    const value = m[2].trim();
    out[key] = value === "" ? "" : parseScalar(value);
  }
  return out;
}

export function extractFrontMatter(source: string): FrontMatterResult {
  const m = FM_RE.exec(source);
  if (!m) return { data: null, body: source, raw: null };
  try {
    const data = parseYamlLite(m[1]);
    if (!data) return { data: null, body: source, raw: null };
    return { data, body: source.slice(m[0].length), raw: m[1] };
  } catch {
    return { data: null, body: source, raw: null };
  }
}

/** 标题转 slug（保留中英文与数字） */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

/** 生成唯一 slug */
export function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let i = 1;
  while (used.has(slug)) {
    slug = `${base}-${i++}`;
  }
  used.add(slug);
  return slug;
}

/** 供大纲/预览共用的标题收集容器 */
export class HeadingCollector {
  public headings: HeadingItem[] = [];
  private used = new Set<string>();

  add(level: number, text: string, line: number): HeadingItem {
    const id = uniqueSlug(slugify(text), this.used);
    const item: HeadingItem = { level, text, id, line };
    this.headings.push(item);
    return item;
  }

  reset(): void {
    this.headings = [];
    this.used.clear();
  }
}
