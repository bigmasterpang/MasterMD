import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { scrollToLine } from "../../utils/editorCommands";
import { isMarkdownPath } from "../../utils/filePath";
import { analyzeSymbols, navSupported, type NavItem, type NavKind } from "../../utils/outline";
import type { HeadingItem } from "../../types";

interface Props {
  previewRef?: React.RefObject<HTMLDivElement | null>;
  standalone?: boolean;
}

type NavMode = "auto" | "heading" | "symbols";

interface DisplayItem extends NavItem {
  hasChildren: boolean;
}

const KIND_ICONS: Record<NavKind, IconName> = {
  heading: "file-text",
  class: "box",
  function: "code",
  method: "code",
  key: "key",
  table: "columns",
  selector: "hash",
  section: "list",
};

export function OutlineSidebar({ previewRef, standalone = false }: Props) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);
  const maxLevel = useSettingsStore((s) => s.outlineMaxLevel);

  const [mode, setMode] = useState<NavMode>("auto");
  const [filterText, setFilterText] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isMarkdown = !doc?.filePath || isMarkdownPath(doc.filePath);
  const hasSymbolSupport = Boolean(doc?.filePath && navSupported(doc.filePath));

  // 当前实际采用的导航类型
  const effectiveMode =
    mode === "auto"
      ? isMarkdown
        ? "heading"
        : hasSymbolSupport
          ? "symbols"
          : "heading"
      : mode;

  // 1. Markdown 标题列表转换为通用 NavItem
  const headingItems = useMemo<NavItem[]>(() => {
    if (!doc?.headings) return [];
    return doc.headings.map((h: HeadingItem) => ({
      id: h.id,
      level: h.level,
      text: h.text,
      line: h.line, // 0 索引
      kind: "heading",
    }));
  }, [doc?.headings]);

  // 2. 符号列表分析
  const symbolItems = useMemo<NavItem[]>(() => {
    if (!doc?.filePath || !doc?.content) return [];
    return analyzeSymbols(doc.filePath, doc.content);
  }, [doc?.filePath, doc?.content]);

  // 原始项
  const rawItems = effectiveMode === "symbols" ? symbolItems : headingItems;

  // 折叠与筛选计算
  const flatItems = useMemo<DisplayItem[]>(() => {
    const rows: DisplayItem[] = [];
    const query = filterText.trim().toLowerCase();
    let skipLevel: number | null = null;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const next = rawItems[i + 1];

      // 标题等级过滤（仅对 heading 生效）
      if (item.kind === "heading" && item.level > maxLevel) continue;

      // 文本搜索过滤
      if (query && !item.text.toLowerCase().includes(query)) continue;

      if (skipLevel !== null) {
        if (item.level > skipLevel) continue;
        skipLevel = null;
      }

      rows.push({
        ...item,
        hasChildren: Boolean(next && next.level > item.level),
      });

      if (collapsed.has(item.id)) skipLevel = item.level;
    }
    return rows;
  }, [rawItems, maxLevel, filterText, collapsed]);

  /* ---------------- 滚动时高亮当前章节（Markdown 预览） ---------------- */
  useEffect(() => {
    if (viewMode === "source" || effectiveMode !== "heading" || !previewRef?.current) return;
    const scroller = previewRef.current;
    if (headingItems.length === 0) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const containerTop = scroller.getBoundingClientRect().top;
        let current: string | null = null;
        for (const heading of headingItems) {
          const el = scroller.querySelector<HTMLElement>(`[id="${CSS.escape(heading.id)}"]`);
          if (!el) continue;
          if (el.getBoundingClientRect().top - containerTop <= 80) current = heading.id;
          else break;
        }
        setActiveId(current ?? headingItems[0]?.id ?? null);
      });
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [previewRef, headingItems, viewMode, effectiveMode]);

  /* ---------------- 光标行所在项目高亮（源码模式） ---------------- */
  const cursorLine = doc?.cursorLine ?? 1;
  useEffect(() => {
    if (rawItems.length === 0) return;
    let current: string | null = null;
    for (const item of rawItems) {
      // heading 的 line 是 0 索引，symbol 的 line 是 1 索引
      const targetLine = item.kind === "heading" ? item.line + 1 : item.line;
      if (targetLine <= cursorLine) current = item.id;
      else break;
    }
    setActiveId(current ?? rawItems[0]?.id ?? null);
  }, [cursorLine, rawItems]);

  // 自动滚动侧栏到当前高亮项
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const jumpTo = (item: DisplayItem) => {
    if (item.kind === "heading" && viewMode !== "source" && previewRef?.current) {
      const el = previewRef.current.querySelector<HTMLElement>(`[id="${CSS.escape(item.id)}"]`);
      if (el) {
        previewRef.current.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
      }
    } else {
      // 统一跳转到编辑行
      const line0 = item.kind === "heading" ? item.line : item.line - 1;
      scrollToLine(Math.max(0, line0));
    }
    setActiveId(item.id);
  };

  const containerClass = standalone
    ? "print-hide flex w-[260px] shrink-0 flex-col border-r border-line bg-sidebar"
    : "flex h-full min-h-0 flex-col overflow-hidden bg-sidebar";

  return (
    <div className={containerClass}>
      {/* 顶部工具栏 */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2 text-[11px] font-medium text-faint">
        <div className="flex items-center gap-1.5">
          <span className="font-medium uppercase tracking-wide text-fg/80">
            {effectiveMode === "symbols" ? "符号导航" : "文档大纲"}
          </span>
          <span className="rounded bg-hover px-1 py-0.5 text-[10px] text-faint">
            {flatItems.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 模式切换：自动 / 标题 / 符号 */}
          <select
            value={mode}
            title="导航模式"
            onChange={(e) => setMode(e.target.value as NavMode)}
            className="h-5 rounded border border-line bg-input px-1 text-[10px] text-fg outline-none"
          >
            <option value="auto">自动</option>
            <option value="heading">大纲</option>
            <option value="symbols">符号</option>
          </select>

          {effectiveMode === "heading" ? (
            <select
              value={maxLevel}
              title="筛选标题等级"
              onChange={(e) =>
                useSettingsStore.getState().set("outlineMaxLevel", Number(e.target.value))
              }
              className="h-5 rounded border border-line bg-input px-1 text-[10px] text-fg outline-none"
            >
              <option value={6}>全部</option>
              <option value={1}>H1</option>
              <option value={2}>≤ H2</option>
              <option value={3}>≤ H3</option>
              <option value={4}>≤ H4</option>
            </select>
          ) : null}

          {standalone ? (
            <button
              type="button"
              title="隐藏侧栏"
              onClick={() => useAppStore.getState().setOutlineVisible(false)}
              className="rounded p-0.5 hover:bg-hover hover:text-fg"
            >
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 搜索/过滤输入框 */}
      <div className="border-b border-line/60 px-2 py-1">
        <div className="flex items-center gap-1 rounded border border-line/80 bg-input px-1.5 py-0.5 text-[11px]">
          <Icon name="search" size={11} className="text-faint" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="过滤大纲与符号…"
            className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-faint"
          />
          {filterText ? (
            <button
              type="button"
              onClick={() => setFilterText("")}
              className="text-faint hover:text-fg"
            >
              <Icon name="x" size={10} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 列表渲染 */}
      {flatItems.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] leading-relaxed text-faint">
          {filterText
            ? "没有匹配的项。"
            : effectiveMode === "symbols"
              ? "未在当前文件中识别出符号。"
              : "当前文档没有标题。"}
        </div>
      ) : (
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-1 py-1 font-sans">
          {flatItems.map((item) => {
            const isCollapsed = collapsed.has(item.id);
            const active = activeId === item.id;
            const iconName = KIND_ICONS[item.kind] ?? "file-text";

            return (
              <div
                key={item.id}
                data-id={item.id}
                className={`group flex cursor-pointer items-center gap-1 rounded py-[2px] pr-1.5 text-[12px] transition-colors ${
                  active
                    ? "bg-accent-soft-strong font-medium text-accent"
                    : "text-muted hover:bg-hover hover:text-fg"
                }`}
                style={{ paddingLeft: 4 + Math.max(0, item.level - 1) * 12 }}
                onClick={() => jumpTo(item)}
                title={`${item.text} (行 ${item.kind === "heading" ? item.line + 1 : item.line})`}
              >
                {item.hasChildren ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-faint hover:bg-active"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                  >
                    <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} size={11} />
                  </button>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}

                <Icon
                  name={iconName}
                  size={12}
                  className={`shrink-0 ${active ? "text-accent" : "text-faint group-hover:text-muted"}`}
                />
                <span className="truncate">{item.text || "(未命名)"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
