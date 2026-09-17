import { useEffect, useMemo, useState } from "react";
import type { HeadingItem, ViewMode } from "../types";
import { OUTLINE_DEBOUNCE, PREVIEW_DEBOUNCE } from "../utils/constants";
import { ensureLanguages, parseHeadings, renderMarkdown } from "../utils/markdown";

/** 值防抖：delay 毫秒内无新值时才更新 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface MarkdownResult {
  html: string;
  headings: HeadingItem[];
  frontMatter: Record<string, unknown> | null;
  frontMatterRaw: string | null;
  hasMath: boolean;
  hasMermaid: boolean;
}

const EMPTY_RESULT: MarkdownResult = {
  html: "",
  headings: [],
  frontMatter: null,
  frontMatterRaw: null,
  hasMath: false,
  hasMermaid: false,
};

/**
 * 渲染管线：源码 ->（防抖）-> HTML + 大纲。
 * 预览/分屏 150ms 防抖；源码模式只解析标题，300ms 防抖。
 */
export function useMarkdown(source: string, viewMode: ViewMode): MarkdownResult {
  const delay = viewMode === "source" ? OUTLINE_DEBOUNCE : PREVIEW_DEBOUNCE;
  const debounced = useDebouncedValue(source, delay);
  const [langVersion, setLangVersion] = useState(0);

  // 动态加载未注册的代码高亮语言，加载完成后触发一次重渲染
  useEffect(() => {
    let alive = true;
    void ensureLanguages(debounced).then((changed) => {
      if (alive && changed) setLangVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [debounced]);

  return useMemo(() => {
    if (viewMode === "source") {
      return { ...EMPTY_RESULT, headings: parseHeadings(debounced) };
    }
    if (!debounced) return EMPTY_RESULT;
    return renderMarkdown(debounced);
    // langVersion 参与依赖：语言包加载完成后重新高亮
  }, [debounced, viewMode, langVersion]);
}
