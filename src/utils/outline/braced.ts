import type { NavItem, NavKind } from "./types";

const MAX_ITEMS = 3000;

const CLASS_LIKE_REGEX =
  /^(?:export\s+|public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+|default\s+)*(class|interface|struct|enum|trait|impl|namespace|type)\s+([A-Za-z_]\w*)/;

const RUST_FN_REGEX = /^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/;

const GO_FUNC_REGEX = /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)/;

const JS_FN_REGEX =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+([A-Za-z_]\w*)|\s*\()/;

const ARROW_FN_REGEX =
  /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/;

const GENERAL_METHOD_REGEX =
  /^(?:public|private|protected|static|final|abstract|override|virtual|synchronized|async)*\s*([A-Za-z_]\w*)\s*\([^)]*\)\s*(?::\s*[^;{]+)?\s*\{?$/;

export function analyzeBraced(lines: string[], ext: string): NavItem[] {
  const items: NavItem[] = [];
  let inBlockComment = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    if (items.length >= MAX_ITEMS) break;
    const line = lines[i];
    let sanitized = "";
    let inString: string | null = null;
    let escaped = false;

    // 简单状态机：剥除行内注释和字符串，同时统计大括号
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      const next = line[c + 1];

      if (inBlockComment) {
        if (char === "*" && next === "/") {
          inBlockComment = false;
          c++;
        }
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === "/" && next === "*") {
        inBlockComment = true;
        c++;
        continue;
      }

      if (char === "/" && next === "/") {
        break; // 单行注释直接忽略到行尾
      }

      if (char === '"' || char === "'" || char === "`") {
        inString = char;
        continue;
      }

      sanitized += char;
    }

    const trimmed = sanitized.trim();
    if (!trimmed) {
      // 依然需要维护大括号深度
      for (const ch of sanitized) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    const currentLevel = Math.max(1, braceDepth + 1);

    // 1. 类型定义（class / struct / interface / enum / trait / impl）
    const classMatch = trimmed.match(CLASS_LIKE_REGEX);
    if (classMatch) {
      const kindStr = classMatch[1];
      const name = classMatch[2];
      items.push({
        id: `braced-${kindStr}-${i + 1}-${name}`,
        level: currentLevel,
        text: `${kindStr} ${name}`,
        line: i + 1,
        kind: "class",
      });
    }
    // 2. Rust 函数
    else if (ext === "rs" && RUST_FN_REGEX.test(trimmed)) {
      const match = trimmed.match(RUST_FN_REGEX);
      if (match) {
        const name = match[1];
        items.push({
          id: `rs-fn-${i + 1}-${name}`,
          level: currentLevel,
          text: `fn ${name}()`,
          line: i + 1,
          kind: braceDepth > 0 ? "method" : "function",
        });
      }
    }
    // 3. Go 函数
    else if (ext === "go" && GO_FUNC_REGEX.test(trimmed)) {
      const match = trimmed.match(GO_FUNC_REGEX);
      if (match) {
        const name = match[1];
        items.push({
          id: `go-fn-${i + 1}-${name}`,
          level: currentLevel,
          text: `func ${name}()`,
          line: i + 1,
          kind: trimmed.includes("(") && trimmed.indexOf("(") < trimmed.indexOf(name) ? "method" : "function",
        });
      }
    }
    // 4. JS/TS 显式 function
    else if (JS_FN_REGEX.test(trimmed)) {
      const match = trimmed.match(JS_FN_REGEX);
      if (match) {
        const name = match[1] || "(anonymous)";
        items.push({
          id: `js-fn-${i + 1}-${name}`,
          level: currentLevel,
          text: `${name}()`,
          line: i + 1,
          kind: braceDepth > 0 ? "method" : "function",
        });
      }
    }
    // 5. 箭头函数 / 函数变量
    else if (ARROW_FN_REGEX.test(trimmed)) {
      const match = trimmed.match(ARROW_FN_REGEX);
      if (match) {
        const name = match[1];
        items.push({
          id: `arrow-fn-${i + 1}-${name}`,
          level: currentLevel,
          text: `${name}()`,
          line: i + 1,
          kind: braceDepth > 0 ? "method" : "function",
        });
      }
    }
    // 6. 通用类方法 / C / Java 函数
    else {
      const methodMatch = trimmed.match(GENERAL_METHOD_REGEX);
      if (methodMatch) {
        const name = methodMatch[1];
        // 排除常见控制流关键字
        if (!/^(if|for|while|switch|catch|return|throw)$/.test(name)) {
          items.push({
            id: `fn-${i + 1}-${name}`,
            level: currentLevel,
            text: `${name}()`,
            line: i + 1,
            kind: (braceDepth > 0 ? "method" : "function") as NavKind,
          });
        }
      }
    }

    // 统计当前行末的大括号变化
    for (const ch of sanitized) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  return items;
}
