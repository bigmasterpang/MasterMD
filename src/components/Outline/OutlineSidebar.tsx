import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { scrollToLine } from "../../utils/editorCommands";
import { isMarkdownDoc, isPdfDoc } from "../../utils/filePath";
import { analyzeSymbols, navSupported, type NavItem, type NavKind } from "../../utils/outline";
import type { HeadingItem } from "../../types";
import {
  deletePdfPage,
  jumpToPdfPage,
  PdfThumbnail,
  reorderPdfPages,
  rotatePdfPage,
  usePdfOutline,
  usePdfProxy,
} from "../PDF/pdfService";

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

  // 如果当前是 PDF 文档，渲染专用的 PDF 大纲书签与页面缩略图侧栏
  if (doc && isPdfDoc(doc)) {
    return <PdfOutlineSection doc={doc} standalone={standalone} />;
  }

  return <MarkdownOutlineSection doc={doc} previewRef={previewRef} standalone={standalone} />;
}

/** PDF 专用大纲与缩略图导航组件 */
function PdfOutlineSection({
  doc,
  standalone,
}: {
  doc: NonNullable<ReturnType<typeof useAppStore.getState>["docs"][0]>;
  standalone?: boolean;
}) {
  const pdfProxy = usePdfProxy(doc.id);
  const pdfOutline = usePdfOutline(doc.id);
  const [tab, setTab] = useState<"outline" | "thumbnails">("outline");
  const [filterText, setFilterText] = useState("");
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const numPages = doc.pdfTotalPages || pdfProxy?.numPages || 1;
  const currentPage = doc.pdfCurrentPage || 1;

  // 过滤大纲
  const filteredOutline = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return pdfOutline;
    return pdfOutline.filter((item) => item.title.toLowerCase().includes(q));
  }, [pdfOutline, filterText]);

  // 缩略图自动滚动跟随当前高亮页
  useEffect(() => {
    if (tab === "thumbnails" && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-page="${currentPage}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [tab, currentPage]);

  const containerClass = standalone
    ? "print-hide flex w-[260px] shrink-0 flex-col border-r border-line bg-sidebar"
    : "flex h-full min-h-0 flex-col overflow-hidden bg-sidebar";

  return (
    <div className={containerClass}>
      {/* 顶部工具栏 */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2 text-[11px] font-medium text-faint">
        <div className="flex items-center gap-1.5">
          <span className="font-medium uppercase tracking-wide text-fg/80">
            PDF 导航
          </span>
          <span className="rounded bg-hover px-1 py-0.5 text-[10px] text-faint">
            {numPages} 页
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 大纲 / 缩略图切换 */}
          <div className="flex rounded border border-line bg-input p-0.5">
            <button
              type="button"
              onClick={() => setTab("outline")}
              title="书签大纲"
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] transition-colors ${
                tab === "outline"
                  ? "bg-panel font-medium text-accent shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              <Icon name="book-open" size={11} />
              <span>大纲</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("thumbnails")}
              title="页面缩略图"
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] transition-colors ${
                tab === "thumbnails"
                  ? "bg-panel font-medium text-accent shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              <Icon name="grid" size={11} />
              <span>缩略图</span>
            </button>
          </div>

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

      {tab === "outline" ? (
        <>
          {/* 搜索/过滤输入框 */}
          <div className="border-b border-line/60 px-2 py-1">
            <div className="flex items-center gap-1 rounded border border-line/80 bg-input px-1.5 py-0.5 text-[11px]">
              <Icon name="search" size={11} className="text-faint" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="搜索书签大纲…"
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

          {/* 大纲书签列表 */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-1 font-sans">
            {filteredOutline.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-faint">
                {filterText ? "没有匹配的书签。" : "当前 PDF 未包含书签大纲。"}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filteredOutline.map((item, idx) => {
                  const active = item.pageIndex === currentPage;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (item.pageIndex) jumpToPdfPage(doc.id, item.pageIndex);
                      }}
                      className={`group flex cursor-pointer items-center justify-between gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors ${
                        active
                          ? "bg-accent-soft-strong font-medium text-accent"
                          : "text-muted hover:bg-hover hover:text-fg"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Icon
                          name="file-text"
                          size={12}
                          className={`shrink-0 ${
                            active ? "text-accent" : "text-faint group-hover:text-muted"
                          }`}
                        />
                        <span className="truncate" title={item.title}>
                          {item.title}
                        </span>
                      </div>
                      {item.pageIndex ? (
                        <span className="shrink-0 font-mono text-[10.5px] text-faint">
                          P.{item.pageIndex}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* 页面缩略图列表 */
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
          <div className="flex flex-col gap-3">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => (
              <div
                key={pNum}
                data-page={pNum}
                draggable
                onDragStart={() => setDraggedPageIndex(pNum - 1)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedPageIndex !== null) {
                    void reorderPdfPages(doc.id, draggedPageIndex, pNum - 1);
                    setDraggedPageIndex(null);
                  }
                }}
                onClick={() => jumpToPdfPage(doc.id, pNum)}
                className={`group relative flex cursor-pointer flex-col items-center rounded-lg border p-1.5 transition-all ${
                  currentPage === pNum
                    ? "border-accent bg-accent/10 shadow-xs"
                    : "border-line bg-panel hover:border-line-strong hover:bg-hover"
                }`}
              >
                <PdfThumbnail
                  pdfProxy={pdfProxy}
                  pageNum={pNum}
                  active={currentPage === pNum}
                />

                <div className="mt-1 flex w-full items-center justify-between px-1 text-[11px] text-muted">
                  <span className="font-mono">第 {pNum} 页</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="旋转此页"
                      onClick={(e) => {
                        e.stopPropagation();
                        void rotatePdfPage(doc.id, pNum, true);
                      }}
                      className="rounded p-0.5 hover:bg-accent/20 hover:text-accent"
                    >
                      <Icon name="rotate-cw" size={11} />
                    </button>
                    <button
                      type="button"
                      title="删除此页"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePdfPage(doc.id, pNum);
                      }}
                      className="rounded p-0.5 hover:bg-danger/20 hover:text-danger"
                    >
                      <Icon name="trash" size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Markdown 与源码符号大纲组件 */
function MarkdownOutlineSection({
  doc,
  previewRef,
  standalone,
}: {
  doc: ReturnType<typeof useAppStore.getState>["docs"][0] | null;
  previewRef?: React.RefObject<HTMLDivElement | null>;
  standalone?: boolean;
}) {
  const viewMode = useAppStore((s) => s.viewMode);
  const maxLevel = useSettingsStore((s) => s.outlineMaxLevel);

  const [mode, setMode] = useState<NavMode>("auto");
  const [filterText, setFilterText] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isMarkdown = isMarkdownDoc(doc);
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
      line: h.line,
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

      if (item.kind === "heading" && item.level > maxLevel) continue;
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

  // 滚动时高亮当前章节（Markdown 预览）
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

  // 光标行所在项目高亮（源码模式）
  const cursorLine = doc?.cursorLine ?? 1;
  useEffect(() => {
    if (rawItems.length === 0) return;
    let current: string | null = null;
    for (const item of rawItems) {
      const targetLine = item.kind === "heading" ? item.line + 1 : item.line;
      if (targetLine <= cursorLine) current = item.id;
      else break;
    }
    setActiveId(current ?? rawItems[0]?.id ?? null);
  }, [cursorLine, rawItems]);

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
