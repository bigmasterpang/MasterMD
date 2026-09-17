/**
 * 搜索匹配引擎：支持普通文本 / 正则 / 全字匹配 / 大小写 / .匹配换行。
 * 替换操作统一在源码文本上进行，保证与编辑器内容一致。
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  dotAll: boolean;
  /** 到达末尾后回到开头（仅影响“查找下一个/上一个”） */
  wrapAround: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  dotAll: false,
  wrapAround: true,
};

export interface MatchRange {
  from: number;
  to: number;
}

export interface SearchResult {
  ranges: MatchRange[];
  error: string | null;
}

export interface ReplacementChange extends MatchRange {
  insert: string;
}

const MAX_MATCHES = 20000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 构造正则；调用方需保证 flags 含 g */
export function buildRegex(
  query: string,
  options: SearchOptions,
): { regex: RegExp | null; error: string | null } {
  if (!query) return { regex: null, error: null };
  let pattern = options.regex ? query : escapeRegExp(query);
  // 全字匹配：仅对包含 ASCII 词字符的查询生效（中文无所谓词边界）
  if (options.wholeWord && /[A-Za-z0-9_]/.test(query)) {
    pattern = `\\b(?:${pattern})\\b`;
  }
  let flags = "g";
  if (!options.caseSensitive) flags += "i";
  if (options.dotAll) flags += "s";
  try {
    return { regex: new RegExp(pattern, flags), error: null };
  } catch (error) {
    return { regex: null, error: `正则表达式错误：${String(error)}` };
  }
}

/** 在文本中查找所有匹配 */
export function findMatches(
  text: string,
  query: string,
  options: SearchOptions,
): SearchResult {
  const { regex, error } = buildRegex(query, options);
  if (!regex || !text) return { ranges: [], error };
  const ranges: MatchRange[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1; // 零宽匹配防死循环
      continue;
    }
    ranges.push({ from: match.index, to: match.index + match[0].length });
    if (ranges.length >= MAX_MATCHES) break;
    if (regex.lastIndex <= match.index) regex.lastIndex = match.index + 1;
  }
  return { ranges, error: null };
}

/** 展开替换串中的 $1 / $& / $$ */
function expandTemplate(template: string, match: string, groups: string[]): string {
  return template.replace(/\$(\$|&|\d{1,2})/g, (_, token: string) => {
    if (token === "$") return "$";
    if (token === "&") return match;
    const index = Number(token);
    return groups[index - 1] ?? "";
  });
}

/** 生成“全部替换”的变更列表（按位置升序，互不重叠） */
export function buildReplaceAll(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions,
): { changes: ReplacementChange[]; count: number; error: string | null } {
  const { regex, error } = buildRegex(query, options);
  if (!regex || !text) return { changes: [], count: 0, error };

  const changes: ReplacementChange[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (value.length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    const groups = match.slice(1);
    changes.push({
      from: match.index,
      to: match.index + value.length,
      insert: options.regex ? expandTemplate(replacement, value, groups) : replacement,
    });
    if (changes.length >= MAX_MATCHES) break;
    if (regex.lastIndex <= match.index) regex.lastIndex = match.index + 1;
  }
  return { changes, count: changes.length, error: null };
}

/** 单个匹配的替换文本（正则会展开 $1 / $& 等） */
export function buildSingleReplacement(
  text: string,
  range: MatchRange,
  query: string,
  replacement: string,
  options: SearchOptions,
): string {
  if (!options.regex) return replacement;
  const { regex } = buildRegex(query, options);
  if (!regex) return replacement;
  // 用 sticky 正则精确匹配该区间，以取得捕获组
  const sticky = new RegExp(regex.source, regex.flags.replace("g", "y"));
  sticky.lastIndex = range.from;
  const match = sticky.exec(text);
  if (!match || match.index !== range.from) return replacement;
  return expandTemplate(replacement, match[0], match.slice(1));
}

/** 将变更应用到纯文本 */
export function applyChangesToString(
  text: string,
  changes: ReplacementChange[],
): string {
  if (changes.length === 0) return text;
  const parts: string[] = [];
  let cursor = 0;
  for (const change of changes) {
    if (change.from < cursor) continue;
    parts.push(text.slice(cursor, change.from), change.insert);
    cursor = change.to;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}
