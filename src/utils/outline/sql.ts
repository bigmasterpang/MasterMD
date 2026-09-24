import type { NavItem } from "./types";

const MAX_ITEMS = 3000;

const SQL_CREATE_REGEX =
  /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`]+)/i;

export function analyzeSql(lines: string[]): NavItem[] {
  const items: NavItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (items.length >= MAX_ITEMS) break;
    const line = lines[i];
    const match = line.match(SQL_CREATE_REGEX);
    if (match) {
      const type = match[1].toUpperCase();
      const rawName = match[2].replace(/["`]/g, "");
      const isFn = type === "FUNCTION" || type === "PROCEDURE" || type === "TRIGGER";
      items.push({
        id: `sql-${i + 1}-${rawName}`,
        level: 1,
        text: `${type} ${rawName}`,
        line: i + 1,
        kind: isFn ? "function" : "table",
      });
    }
  }

  return items;
}
