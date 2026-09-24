import type { NavItem } from "./types";

const MAX_ITEMS = 3000;

export function analyzeConfig(lines: string[], ext: string): NavItem[] {
  const items: NavItem[] = [];

  if (ext === "json" || ext === "jsonc" || ext === "json5") {
    let braceDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      if (items.length >= MAX_ITEMS) break;
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

      const keyMatch = trimmed.match(/^"([^"]+)"\s*:\s*([{\[])?/);
      if (keyMatch) {
        const key = keyMatch[1];
        const isContainer = Boolean(keyMatch[2]);
        items.push({
          id: `json-key-${i + 1}-${key}`,
          level: Math.max(1, braceDepth + 1),
          text: isContainer ? `"${key}": {…}` : `"${key}"`,
          line: i + 1,
          kind: "key",
        });
      }

      for (const ch of trimmed) {
        if (ch === "{" || ch === "[") braceDepth++;
        else if (ch === "}" || ch === "]") braceDepth = Math.max(0, braceDepth - 1);
      }
    }
    return items;
  }

  if (ext === "yml" || ext === "yaml") {
    for (let i = 0; i < lines.length; i++) {
      if (items.length >= MAX_ITEMS) break;
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;

      const match = line.match(/^(\s*)([A-Za-z0-9_\-\.]+)\s*:/);
      if (match) {
        const indentStr = match[1];
        const key = match[2];
        const level = Math.floor(indentStr.length / 2) + 1;
        items.push({
          id: `yaml-key-${i + 1}-${key}`,
          level,
          text: key,
          line: i + 1,
          kind: "key",
        });
      }
    }
    return items;
  }

  if (ext === "toml" || ext === "ini" || ext === "cfg" || ext === "conf" || ext === "properties") {
    for (let i = 0; i < lines.length; i++) {
      if (items.length >= MAX_ITEMS) break;
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;

      // Section
      const secMatch = trimmed.match(/^(\[\[?)([^\]]+)(\]\]?)/);
      if (secMatch) {
        items.push({
          id: `sec-${i + 1}-${secMatch[2]}`,
          level: 1,
          text: secMatch[0],
          line: i + 1,
          kind: "section",
        });
        continue;
      }

      // Key
      const keyMatch = trimmed.match(/^([A-Za-z0-9_\-\.]+)\s*=/);
      if (keyMatch) {
        const key = keyMatch[1];
        items.push({
          id: `key-${i + 1}-${key}`,
          level: 2,
          text: key,
          line: i + 1,
          kind: "key",
        });
      }
    }
    return items;
  }

  return items;
}
