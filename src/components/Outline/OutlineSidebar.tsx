import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { getEditor } from "../../utils/editorBridge";
import type { HeadingItem } from "../../types";

interface Props {
  previewRef: React.RefObject<HTMLDivElement | null>;
}

interface FlatHeading extends HeadingItem {
  hasChildren: boolean;
}

const EMPTY_HEADINGS: HeadingItem[] = [];

/** 大纲侧栏：树形展示 h1-h6，可折叠，点击跳转，滚动时高亮当前章节 */
export function OutlineSidebar({ previewRef }: Props) {
  const headings = useAppStore(
    (s) => s.docs.find((d) => d.id === s.activeId)?.headings ?? EMPTY_HEADINGS,
  );
  const viewMode = useAppStore((s) => s.viewMode);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 计算层级与折叠后的可见行
  const flat = useMemo(() => {
    const rows: FlatHeading[] = [];
    let skipLevel: number | null = null;
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const next = headings[i + 1];
      if (skipLevel !== null) {
        if (heading.level > skipLevel) continue;
        skipLevel = null;
      }
      rows.push({
        ...heading,
        hasChildren: Boolean(next && next.level > heading.level),
      });
      if (collapsed.has(heading.id)) skipLevel = heading.level;
    }
    return rows;
  }, [headings, collapsed]);

  /* ---------------- 滚动时高亮当前章节 ---------------- */
  useEffect(() => {
    if (viewMode === "source") return;
    const scroller = previewRef.current;
    if (!scroller || headings.length === 0) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const containerTop = scroller.getBoundingClientRect().top;
        let current: string | null = null;
        for (const heading of headings) {
          const el = scroller.querySelector<HTMLElement>(
            `[id="${CSS.escape(heading.id)}"]`,
          );
          if (!el) continue;
          if (el.getBoundingClientRect().top - containerTop <= 80) current = heading.id;
          else break;
        }
        setActiveId(current ?? headings[0]?.id ?? null);
      });
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [previewRef, headings, viewMode]);

  // 光标行所在章节高亮（源码模式）
  const cursorLine = useAppStore(
    (s) => s.docs.find((d) => d.id === s.activeId)?.cursorLine ?? 1,
  );
  useEffect(() => {
    if (viewMode !== "source" || headings.length === 0) return;
    let current: string | null = null;
    for (const heading of headings) {
      if (heading.line + 1 <= cursorLine) current = heading.id;
      else break;
    }
    setActiveId(current ?? headings[0]?.id ?? null);
  }, [cursorLine, headings, viewMode]);

  // 自动滚动大纲到当前项
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const jumpTo = (heading: FlatHeading) => {
    if (viewMode === "source") {
      getEditor()?.scrollToLine(heading.line);
      return;
    }
    const preview = previewRef.current;
    const el = preview?.querySelector<HTMLElement>(
      `[id="${CSS.escape(heading.id)}"]`,
    );
    if (el && preview) {
      preview.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
    }
    setActiveId(heading.id);
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3 text-[11px] font-medium uppercase tracking-wide text-faint">
        大纲
        <button
          type="button"
          title="隐藏大纲"
          onClick={() => useAppStore.getState().setOutlineVisible(false)}
          className="rounded p-0.5 hover:bg-hover hover:text-fg"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {headings.length === 0 ? (
        <div className="px-4 py-6 text-[12px] leading-relaxed text-faint">
          当前文档没有标题。
        </div>
      ) : (
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {flat.map((heading) => {
            const isCollapsed = collapsed.has(heading.id);
            const active = activeId === heading.id;
            return (
              <div
                key={heading.id}
                data-id={heading.id}
                className={`flex cursor-pointer items-center gap-1 rounded-md py-[3px] pr-1 text-[12px] transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-hover hover:text-fg"
                }`}
                style={{ paddingLeft: 4 + (heading.level - 1) * 12 }}
                onClick={() => jumpTo(heading)}
                title={heading.text}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                    heading.hasChildren ? "text-faint hover:bg-active" : "invisible"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(heading.id)) next.delete(heading.id);
                      else next.add(heading.id);
                      return next;
                    });
                  }}
                >
                  <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} size={12} />
                </button>
                <span className="truncate">{heading.text || "(空标题)"}</span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
