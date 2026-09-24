import type { NavItem } from "./types";

const MAX_ITEMS = 3000;

export function analyzePython(lines: string[]): NavItem[] {
  const items: NavItem[] = [];
  let inTripleDouble = false;
  let inTripleSingle = false;

  for (let i = 0; i < lines.length; i++) {
    if (items.length >= MAX_ITEMS) break;
    const line = lines[i];
    const trimmed = line.trim();

    // 检查三引号多行注释/字符串边界
    let cursor = 0;
    while (cursor < line.length) {
      if (!inTripleSingle && line.startsWith('"""', cursor)) {
        inTripleDouble = !inTripleDouble;
        cursor += 3;
        continue;
      }
      if (!inTripleDouble && line.startsWith("'''", cursor)) {
        inTripleSingle = !inTripleSingle;
        cursor += 3;
        continue;
      }
      cursor++;
    }

    if (inTripleDouble || inTripleSingle) continue;
    if (!trimmed || trimmed.startsWith("#")) continue;

    // 计算缩进格数（Tab 按 4 个空格折算）
    const leadingWhitespace = line.match(/^[ \t]*/)?.[0] ?? "";
    let indent = 0;
    for (let c = 0; c < leadingWhitespace.length; c++) {
      indent += leadingWhitespace[c] === "\t" ? 4 : 1;
    }
    const level = Math.floor(indent / 4) + 1;

    // 匹配 class
    const classMatch = trimmed.match(/^class\s+([A-Za-z_]\w*)(?:\s*\([^)]*\))?\s*:/);
    if (classMatch) {
      const name = classMatch[1];
      items.push({
        id: `py-class-${i + 1}-${name}`,
        level,
        text: `class ${name}`,
        line: i + 1,
        kind: "class",
      });
      continue;
    }

    // 匹配 def / async def
    const defMatch = trimmed.match(/^(async\s+)?def\s+([A-Za-z_]\w*)\s*(\([^)]*\))?/);
    if (defMatch) {
      const isAsync = Boolean(defMatch[1]);
      const name = defMatch[2];
      const kind = level > 1 ? "method" : "function";
      const prefix = isAsync ? "async " : "";
      items.push({
        id: `py-fn-${i + 1}-${name}`,
        level,
        text: `${prefix}${name}()`,
        line: i + 1,
        kind,
      });
    }
  }

  return items;
}
