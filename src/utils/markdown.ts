import MarkdownIt from "markdown-it";
import type {
  Env,
  MarkdownIt as MarkdownItType,
  MarkdownItOptions,
  Renderer,
  Token,
} from "markdown-it";
import hljs from "highlight.js/lib/core";
import type { HeadingItem } from "../types";
import { extractFrontMatter, HeadingCollector, uniqueSlug, slugify } from "./frontMatter";

/* ------------------------------------------------------------------ */
/* highlight.js：只注册常用语言，其余按需动态加载                       */
/* ------------------------------------------------------------------ */

import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import rust from "highlight.js/lib/languages/rust";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import bash from "highlight.js/lib/languages/bash";
import powershell from "highlight.js/lib/languages/powershell";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";

const CORE_LANGUAGES: Array<[string, unknown]> = [
  ["javascript", javascript],
  ["typescript", typescript],
  ["xml", xml],
  ["css", css],
  ["json", json],
  ["rust", rust],
  ["python", python],
  ["go", go],
  ["java", java],
  ["c", c],
  ["cpp", cpp],
  ["bash", bash],
  ["powershell", powershell],
  ["sql", sql],
  ["yaml", yaml],
  // highlight.js 没有独立的 TOML 语法，使用 ini 语法近似（键值对/分节）
  ["toml", ini],
  ["ini", ini],
  ["markdown", markdown],
  ["plaintext", plaintext],
];

for (const [name, def] of CORE_LANGUAGES) {
  hljs.registerLanguage(name, def as never);
}

/** 语言别名 -> 已注册语言名 */
const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "xml",
  xhtml: "xml",
  svg: "xml",
  vue: "xml",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  ps: "powershell",
  ps1: "powershell",
  pwsh: "powershell",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  cc: "cpp",
  hpp: "cpp",
  h: "c",
  golang: "go",
  py: "python",
  rb: "ruby",
  rs: "rust",
  text: "plaintext",
  txt: "plaintext",
};

/** 非核心语言：检测到代码块语言时按需加载（独立 chunk） */
const LAZY_LANGUAGES: Record<string, () => Promise<unknown>> = {
  csharp: () => import("highlight.js/lib/languages/csharp"),
  "c#": () => import("highlight.js/lib/languages/csharp"),
  php: () => import("highlight.js/lib/languages/php"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  swift: () => import("highlight.js/lib/languages/swift"),
  dart: () => import("highlight.js/lib/languages/dart"),
  lua: () => import("highlight.js/lib/languages/lua"),
  r: () => import("highlight.js/lib/languages/r"),
  scala: () => import("highlight.js/lib/languages/scala"),
  perl: () => import("highlight.js/lib/languages/perl"),
  scss: () => import("highlight.js/lib/languages/scss"),
  less: () => import("highlight.js/lib/languages/less"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
  diff: () => import("highlight.js/lib/languages/diff"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  http: () => import("highlight.js/lib/languages/http"),
  latex: () => import("highlight.js/lib/languages/latex"),
  nginx: () => import("highlight.js/lib/languages/nginx"),
  protobuf: () => import("highlight.js/lib/languages/protobuf"),
  vim: () => import("highlight.js/lib/languages/vim"),
  cmake: () => import("highlight.js/lib/languages/cmake"),
  groovy: () => import("highlight.js/lib/languages/groovy"),
  objectivec: () => import("highlight.js/lib/languages/objectivec"),
  vbnet: () => import("highlight.js/lib/languages/vbnet"),
  wasm: () => import("highlight.js/lib/languages/wasm"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  erlang: () => import("highlight.js/lib/languages/erlang"),
  haskell: () => import("highlight.js/lib/languages/haskell"),
  clojure: () => import("highlight.js/lib/languages/clojure"),
  julia: () => import("highlight.js/lib/languages/julia"),
  fortran: () => import("highlight.js/lib/languages/fortran"),
  asm: () => import("highlight.js/lib/languages/x86asm"),
  x86asm: () => import("highlight.js/lib/languages/x86asm"),
  nim: () => import("highlight.js/lib/languages/nim"),
  crystal: () => import("highlight.js/lib/languages/crystal"),
  pgsql: () => import("highlight.js/lib/languages/pgsql"),
  properties: () => import("highlight.js/lib/languages/properties"),
  dos: () => import("highlight.js/lib/languages/dos"),
  tcl: () => import("highlight.js/lib/languages/tcl"),
  vhdl: () => import("highlight.js/lib/languages/vhdl"),
  matlab: () => import("highlight.js/lib/languages/matlab"),
  stata: () => import("highlight.js/lib/languages/stata"),
  dns: () => import("highlight.js/lib/languages/dns"),
  arduino: () => import("highlight.js/lib/languages/arduino"),
  basic: () => import("highlight.js/lib/languages/basic"),
  scheme: () => import("highlight.js/lib/languages/scheme"),
  lisp: () => import("highlight.js/lib/languages/lisp"),
};

function normalizeLang(lang: string): string {
  const l = lang.trim().toLowerCase();
  return ALIASES[l] ?? l;
}

export function isLanguageRegistered(lang: string): boolean {
  const name = normalizeLang(lang);
  return Boolean(name) && hljs.getLanguage(name) !== undefined;
}

/** 扫描源码中出现的代码块语言 */
function scanFenceLanguages(source: string): Set<string> {
  const langs = new Set<string>();
  const re = /^[ \t]*(?:```|~~~)[ \t]*([^\s`~]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = normalizeLang(m[1] ?? "");
    if (name && name !== "mermaid" && name !== "math") langs.add(name);
  }
  return langs;
}

/** 已尝试过加载的语言，避免重复加载与无限重渲染 */
const attemptedLangs = new Set<string>();

/** 按需加载代码块语言；有新语言注册成功时返回 true（调用方据此重新渲染） */
export async function ensureLanguages(source: string): Promise<boolean> {
  const need: string[] = [];
  for (const name of scanFenceLanguages(source)) {
    if (isLanguageRegistered(name) || attemptedLangs.has(name)) continue;
    if (!LAZY_LANGUAGES[name]) continue;
    attemptedLangs.add(name);
    need.push(name);
  }
  if (need.length === 0) return false;

  const results = await Promise.allSettled(
    need.map((name) => LAZY_LANGUAGES[name]()),
  );
  let registered = false;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") continue;
    const mod = result.value as { default?: unknown };
    const def = mod?.default ?? mod;
    const regName = normalizeLang(need[i]);
    if (typeof def === "function" && hljs.getLanguage(regName) === undefined) {
      hljs.registerLanguage(regName, def as never);
      registered = true;
    }
  }
  return registered;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** markdown-it 的 highlight 回调（同步）。未注册语言保持原样。 */
function highlightCode(code: string, lang: string): string {
  const name = normalizeLang(lang);
  const cls = name ? ` class="language-${escapeHtml(name)}"` : "";
  if (name && hljs.getLanguage(name)) {
    try {
      const value = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
      return `<pre class="hljs"><code${cls}>${value}</code></pre>`;
    } catch {
      /* 高亮失败时降级为纯文本 */
    }
  }
  return `<pre class="hljs"><code${cls}>${escapeHtml(code)}</code></pre>`;
}

/* ------------------------------------------------------------------ */
/* markdown-it 插件：任务列表 / 标题锚点 / 数学公式占位                 */
/* ------------------------------------------------------------------ */

/** GFM 任务列表：- [x] / - [ ] */
function taskListPlugin(md: MarkdownItType): void {
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== "inline") continue;
      const open = tokens[i - 1];
      if (!open || open.type !== "paragraph_open") continue;
      const li = tokens[i - 2];
      if (!li || li.type !== "list_item_open") continue;

      const m = /^\[([ xX])\][ \t]+/.exec(token.content);
      if (!m) continue;

      const checked = m[1].toLowerCase() === "x";
      open.attrJoin("class", "task-item");
      token.content = token.content.replace(/^\[([ xX])\][ \t]+/, "");
      const first = token.children?.[0];
      if (first && first.type === "text") {
        first.content = first.content.replace(/^\[([ xX])\][ \t]+/, "");
      }
      const box = new state.Token("html_inline", "", 0);
      box.content = `<input type="checkbox" disabled${checked ? " checked" : ""}> `;
      token.children?.unshift(box);
    }
    return true;
  });
}

/** 标题锚点 + 收集大纲 */
function headingPlugin(md: MarkdownItType, collector: HeadingCollector): void {
  md.renderer.rules.heading_open = (
    tokens: Token[],
    idx: number,
    options: Required<MarkdownItOptions>,
    env: Env | undefined,
    self: Renderer,
  ) => {
    const token = tokens[idx];
    const inline = tokens[idx + 1];
    const rawText = inline && inline.type === "inline" ? inline.content : "";
    const text = rawText.replace(/[*_`~\[\]]/g, "").trim();
    const level = Number(token.tag.slice(1)) || 1;
    const line = token.map ? token.map[0] : 0;

    // front matter 已被剥离，行号需要加上其占用的行数
    const offset = Number((env as { lineOffset?: number }).lineOffset ?? 0);
    const item = collector.add(level, text, line + offset);
    token.attrSet("id", item.id);
    token.attrSet("data-line", String(line + offset));
    return self.renderToken(tokens, idx, options);
  };
}

/** $$...$$ 块级公式（渲染为占位 div，稍后由 KaTeX 异步填充） */
function mathPlugin(md: MarkdownItType): void {
  const blockRule = (
    state: import("markdown-it").StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ): boolean => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineText = state.src.slice(startPos, max);
    if (!lineText.startsWith("$$")) return false;
    if (silent) return true;

    let content = lineText.slice(2);
    let end = startLine;
    const trimmed = content.trimEnd();
    if (trimmed.endsWith("$$") && trimmed.length >= 2 && content.trim().length >= 2) {
      content = trimmed.slice(0, -2);
    } else {
      let found = false;
      let buf = content;
      for (let i = startLine + 1; i < endLine; i++) {
        const pos = state.bMarks[i] + state.tShift[i];
        const current = state.src.slice(pos, state.eMarks[i]);
        const idx = current.indexOf("$$");
        if (idx >= 0) {
          buf += "\n" + current.slice(0, idx);
          end = i;
          found = true;
          break;
        }
        buf += "\n" + current;
        end = i;
      }
      if (!found) return false;
      content = buf;
    }

    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, end + 1];
    state.line = end + 1;
    return true;
  };

  const inlineRule = (state: import("markdown-it").StateInline, silent: boolean): boolean => {
    if (state.src[state.pos] !== "$") return false;
    const start = state.pos;
    const max = state.posMax;
    let pos = start + 1;
    let found = false;
    while (pos < max) {
      const ch = state.src[pos];
      if (ch === "\\") {
        pos += 2;
        continue;
      }
      if (ch === "\n") return false;
      if (ch === "$") {
        found = true;
        break;
      }
      pos++;
    }
    if (!found || pos === start + 1) return false;
    const content = state.src.slice(start + 1, pos);
    if (!content.trim()) return false;
    // $1,000 这类金额误判保护
    if (/^[\d,.\s]+$/.test(content)) return false;
    if (silent) return true;
    const token = state.push("math_inline", "math", 0);
    token.content = content;
    state.pos = pos + 1;
    return true;
  };

  md.block.ruler.before("fence", "math_block", blockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.inline.ruler.after("escape", "math_inline", inlineRule);

  md.renderer.rules.math_block = (tokens: Token[], idx: number) =>
    `<div class="math-block" data-tex="${escapeHtml(tokens[idx].content)}"></div>\n`;
  md.renderer.rules.math_inline = (tokens: Token[], idx: number) =>
    `<span class="math-inline" data-tex="${escapeHtml(tokens[idx].content)}"></span>`;
}

/* ------------------------------------------------------------------ */
/* 渲染入口                                                            */
/* ------------------------------------------------------------------ */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (code, lang) => highlightCode(code, lang),
});

let currentCollector = new HeadingCollector();

md.use(taskListPlugin);
md.use((instance) => headingPlugin(instance, currentCollector));
md.use(mathPlugin);

// 外链统一在应用外打开（由预览层拦截），这里补上 rel 保证安全
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((
    tokens: Token[],
    idx: number,
    options: Required<MarkdownItOptions>,
    _env: Env | undefined,
    self: Renderer,
  ) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (
  tokens: Token[],
  idx: number,
  options: Required<MarkdownItOptions>,
  env: Env | undefined,
  self: Renderer,
) => {
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export interface RenderResult {
  html: string;
  headings: HeadingItem[];
  frontMatter: Record<string, unknown> | null;
  frontMatterRaw: string | null;
  hasMath: boolean;
  hasMermaid: boolean;
}

/** 同步渲染 Markdown 为 HTML（未经 DOMPurify 清理，调用方需自行 sanitize） */
export function renderMarkdown(source: string): RenderResult {
  const { data, body, raw } = extractFrontMatter(source);
  const lineOffset = raw === null ? 0 : raw.split(/\r?\n/).length + 2;

  currentCollector.reset();
  const env = { lineOffset };
  const html = md.render(body, env);

  const headings = [...currentCollector.headings];
  const finalHtml = data ? buildFrontMatterHtml(data) + html : html;

  return {
    html: finalHtml,
    headings,
    frontMatter: data,
    frontMatterRaw: raw,
    hasMath: /class="math-(inline|block)"/.test(html),
    hasMermaid: /class="language-mermaid"/.test(html),
  };
}

/** 只解析标题结构（源码模式下无需生成 HTML，避免大文档浪费） */
export function parseHeadings(source: string): HeadingItem[] {
  const { body, raw } = extractFrontMatter(source);
  const offset = raw === null ? 0 : raw.split(/\r?\n/).length + 2;
  const tokens = md.parse(body, {});
  const collector = new HeadingCollector();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "heading_open") continue;
    const inline = tokens[i + 1];
    const text = (inline?.content ?? "").replace(/[*_`~\[\]]/g, "").trim();
    const level = Number(token.tag.slice(1)) || 1;
    collector.add(level, text, (token.map?.[0] ?? 0) + offset);
  }
  return collector.headings;
}

/** front matter 元数据卡片 */
export function buildFrontMatterHtml(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.join(", ")
        : value === null
          ? ""
          : String(value);
      return `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(text)}</dd>`;
    })
    .join("");
  if (!rows) return "";
  return `<div class="front-matter"><div class="front-matter-title">Front Matter</div><dl>${rows}</dl></div>`;
}

/* ------------------------------------------------------------------ */
/* P2：KaTeX / Mermaid 延迟加载                                        */
/* ------------------------------------------------------------------ */

type KatexModule = typeof import("katex");
let katexPromise: Promise<KatexModule> | null = null;
export function loadKatex(): Promise<KatexModule> {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import("katex"),
      // 字体与样式只在确实出现公式时才加载
      import("katex/dist/katex.min.css"),
    ]).then(([mod]) => (mod.default ?? mod) as KatexModule);
  }
  return katexPromise;
}

type MermaidInstance = (typeof import("mermaid"))["default"];
let mermaidPromise: Promise<MermaidInstance> | null = null;
export function loadMermaid(dark: boolean): Promise<MermaidInstance> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "default",
        fontFamily: "var(--font-ui)",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export { hljs, escapeHtml, slugify, uniqueSlug };
