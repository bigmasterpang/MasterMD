import type { NavItem } from "./types";

const MAX_ITEMS = 3000;

export function analyzeCss(lines: string[]): NavItem[] {
  const items: NavItem[] = [];
  let inMedia = false;

  for (let i = 0; i < lines.length; i++) {
    if (items.length >= MAX_ITEMS) break;
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("//")) {
      continue;
    }

    if (trimmed.startsWith("@media") || trimmed.startsWith("@keyframes") || trimmed.startsWith("@supports")) {
      inMedia = true;
      const atRule = trimmed.split("{")[0].trim();
      items.push({
        id: `css-at-${i + 1}`,
        level: 1,
        text: atRule,
        line: i + 1,
        kind: "section",
      });
      continue;
    }

    if (trimmed.endsWith("{")) {
      const selector = trimmed.slice(0, -1).trim();
      if (selector && !selector.startsWith("@")) {
        items.push({
          id: `css-sel-${i + 1}`,
          level: inMedia ? 2 : 1,
          text: selector,
          line: i + 1,
          kind: "selector",
        });
      }
    }

    if (inMedia && trimmed.includes("}") && !trimmed.includes("{")) {
      inMedia = false;
    }
  }

  return items;
}
