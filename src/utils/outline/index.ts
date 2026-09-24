import { extName, isMarkdownPath } from "../filePath";
import { analyzePython } from "./python";
import { analyzeBraced } from "./braced";
import { analyzeConfig } from "./config";
import { analyzeSql } from "./sql";
import { analyzeCss } from "./css";
import type { NavItem } from "./types";

export * from "./types";

const MAX_CONTENT_BYTES = 4 * 1024 * 1024; // 4MB 保护

const PYTHON_EXTS = ["py"];
const BRACED_EXTS = [
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "java", "c", "h", "cc", "cpp", "cxx",
  "hpp", "hh", "cs", "go", "rs", "php", "swift", "kt", "kts", "dart", "scala", "rb",
];
const CONFIG_EXTS = [
  "json", "jsonc", "json5", "yml", "yaml", "toml", "ini", "cfg", "conf", "properties",
];
const SQL_EXTS = ["sql"];
const CSS_EXTS = ["css", "scss", "less"];

export function navSupported(filePath: string): boolean {
  if (!filePath) return false;
  if (isMarkdownPath(filePath)) return false;
  const ext = extName(filePath);
  return (
    PYTHON_EXTS.includes(ext) ||
    BRACED_EXTS.includes(ext) ||
    CONFIG_EXTS.includes(ext) ||
    SQL_EXTS.includes(ext) ||
    CSS_EXTS.includes(ext)
  );
}

export function analyzeSymbols(filePath: string, content: string): NavItem[] {
  if (!filePath || !content) return [];
  if (isMarkdownPath(filePath)) return [];
  if (content.length > MAX_CONTENT_BYTES) return [];

  const ext = extName(filePath);
  const lines = content.split(/\r?\n/);

  if (PYTHON_EXTS.includes(ext)) {
    return analyzePython(lines);
  }
  if (BRACED_EXTS.includes(ext)) {
    return analyzeBraced(lines, ext);
  }
  if (CONFIG_EXTS.includes(ext)) {
    return analyzeConfig(lines, ext);
  }
  if (SQL_EXTS.includes(ext)) {
    return analyzeSql(lines);
  }
  if (CSS_EXTS.includes(ext)) {
    return analyzeCss(lines);
  }

  return [];
}
