import { useEffect, useRef } from "react";
import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { getEditor } from "../../utils/editorBridge";

interface Props {
  previewRef: React.RefObject<HTMLDivElement | null>;
  /** 预览内容标识，内容变化后需要重新高亮 */
  contentKey: string;
}

/**
 * 文件内搜索。
 * - 源码模式：使用 CodeMirror search 扩展
 * - 预览模式：在渲染后的 DOM 中包装 <mark> 并滚动到第一个结果
 */
export function SearchBar({ previewRef, contentKey }: Props) {
  const visible = useAppStore((s) => s.searchVisible);
  const query = useAppStore((s) => s.searchQuery);
  const caseSensitive = useAppStore((s) => s.searchCaseSensitive);
  const viewMode = useAppStore((s) => s.viewMode);
  const inputRef = useRef<HTMLInputElement>(null);
  const hitRef = useRef<{ index: number; total: number }>({ index: 0, total: 0 });

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  // 源码模式：同步查询串给 CodeMirror
  useEffect(() => {
    if (!visible || viewMode === "preview") return;
    getEditor()?.applySearch(query, caseSensitive);
  }, [visible, query, caseSensitive, viewMode]);

  // 预览模式：高亮匹配
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    clearMarks(root);
    if (!visible || !query.trim() || viewMode === "source") {
      hitRef.current = { index: 0, total: 0 };
      return;
    }
    const total = highlightMatches(root, query, caseSensitive);
    hitRef.current = { index: total > 0 ? 1 : 0, total };
    if (total > 0) {
      root.querySelector<HTMLElement>("mark.search-hit")?.scrollIntoView({
        block: "center",
      });
    }
  }, [visible, query, caseSensitive, contentKey, viewMode, previewRef]);

  if (!visible) return null;

  const step = (delta: number) => {
    if (viewMode === "source") {
      if (delta > 0) getEditor()?.findNext();
      else getEditor()?.findPrevious();
      return;
    }
    const root = previewRef.current;
    if (!root) return;
    const marks = Array.from(root.querySelectorAll<HTMLElement>("mark.search-hit"));
    if (marks.length === 0) return;
    const current = marks.findIndex((m) => m.classList.contains("current"));
    const next = (current + delta + marks.length) % marks.length;
    marks.forEach((m) => m.classList.remove("current"));
    marks[next].classList.add("current");
    marks[next].scrollIntoView({ block: "center", behavior: "smooth" });
    hitRef.current = { index: next + 1, total: marks.length };
  };

  const close = () => {
    useAppStore.getState().setSearchVisible(false);
    getEditor()?.clearSearch();
    const root = previewRef.current;
    if (root) clearMarks(root);
  };

  const counter =
    viewMode === "source"
      ? ""
      : hitRef.current.total > 0
        ? `${hitRef.current.index}/${hitRef.current.total}`
        : query.trim()
          ? "无结果"
          : "";

  return (
    <div className="absolute right-4 top-3 z-30 flex items-center gap-1 rounded-[var(--radius)] border border-line bg-elevated px-2 py-1 shadow-[var(--shadow)]">
      <Icon name="search" size={14} className="text-faint" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => useAppStore.getState().setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        placeholder="查找…"
        spellCheck={false}
        className="h-6 w-48 bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
      />
      <span className="min-w-[42px] text-center text-[11px] text-faint">{counter}</span>
      <button
        type="button"
        title="区分大小写"
        onClick={() => useAppStore.getState().setSearchCaseSensitive(!caseSensitive)}
        className={`rounded p-1 ${caseSensitive ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover"}`}
      >
        <Icon name="case-sensitive" size={14} />
      </button>
      <button
        type="button"
        title="上一个 (Shift+Enter)"
        onClick={() => step(-1)}
        className="rounded p-1 text-muted hover:bg-hover"
      >
        <Icon name="arrow-up" size={14} />
      </button>
      <button
        type="button"
        title="下一个 (Enter)"
        onClick={() => step(1)}
        className="rounded p-1 text-muted hover:bg-hover"
      >
        <Icon name="arrow-down" size={14} />
      </button>
      <button
        type="button"
        title="关闭 (Esc)"
        onClick={close}
        className="rounded p-1 text-muted hover:bg-hover"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** 清除预览中的搜索高亮 */
function clearMarks(root: HTMLElement): void {
  root.querySelectorAll("mark.search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

/** 在预览 DOM 中高亮匹配文本，返回匹配数量 */
function highlightMatches(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): number {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    targets.push(node as Text);
    node = walker.nextNode();
  }

  let count = 0;
  for (const textNode of targets) {
    const text = textNode.nodeValue ?? "";
    const haystack = caseSensitive ? text : text.toLowerCase();
    let index = haystack.indexOf(needle);
    if (index < 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (index >= 0) {
      if (index > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, index)));
      }
      const mark = document.createElement("mark");
      mark.className = count === 0 ? "search-hit current" : "search-hit";
      mark.textContent = text.slice(index, index + needle.length);
      fragment.appendChild(mark);
      count += 1;
      cursor = index + needle.length;
      index = haystack.indexOf(needle, cursor);
    }
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
  return count;
}
