import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import {
  jumpToCodeLocation,
  openSymbolReferences,
  useCodeNavStore,
} from "../../utils/codeNavigation";

interface Props {
  docId: string;
}

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  function: { label: "函数 fn", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  method: { label: "方法 method", cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  class: { label: "类型 class", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  type: { label: "类型 type", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  variable: { label: "变量 const", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  reference: { label: "引用 ref", cls: "bg-slate-500/15 text-muted" },
};

/**
 * 代码速览定义 (Peek Definition) 与查找所有引用 (Find All References) 浮层面板
 */
export function CodePeekPanel({ docId }: Props) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const peekState = useCodeNavStore((s) => s.peekState);
  const closePeek = useCodeNavStore((s) => s.closePeek);
  const setPeekSelectedIndex = useCodeNavStore((s) => s.setPeekSelectedIndex);

  if (!peekState || !peekState.visible || peekState.docId !== docId) {
    return null;
  }

  const isRightPane = (doc?.pane ?? 0) === 1;
  const splitBtnLabel = isRightPane ? "在左栏打开" : "在右栏打开";
  const { mode, symbol, locations, selectedIndex, loading } = peekState;
  const activeLoc = locations[selectedIndex] ?? locations[0] ?? null;
  const displayLines =
    activeLoc && activeLoc.previewLines.length > 0
      ? activeLoc.previewLines
      : activeLoc
        ? [{ line: activeLoc.line, text: activeLoc.lineText }]
        : [];
  const firstLine = displayLines[0]?.line ?? activeLoc?.line ?? 1;
  const lastLine = displayLines[displayLines.length - 1]?.line ?? firstLine;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="print-hide absolute inset-x-4 bottom-3 z-30 flex flex-col overflow-hidden rounded-xl border border-accent/40 bg-elevated shadow-xl"
    >
      {/* 顶部标题栏 */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-3 text-[12px]">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            name={mode === "peek-def" ? "code" : "search"}
            size={14}
            className="shrink-0 text-accent"
          />
          <span className="font-semibold text-fg">
            {mode === "peek-def" ? "速览函数实现" : "查找所有引用"}:
          </span>
          <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-accent">
            {symbol}
          </code>
          {!loading ? (
            <span className="text-[11px] text-muted">
              ({locations.length} 处结果)
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {activeLoc ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void jumpToCodeLocation(activeLoc, {
                    openInSplit: false,
                    fromDocId: docId,
                    symbol,
                  })
                }
                className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg hover:opacity-90"
                title="在当前分栏直接跳转到该处源码"
              >
                <span>跳转到定义</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void jumpToCodeLocation(activeLoc, {
                    openInSplit: true,
                    fromDocId: docId,
                    symbol,
                  })
                }
                className="flex items-center gap-1 rounded border border-line bg-elevated px-2 py-0.5 text-[11px] text-fg hover:bg-hover"
                title={`保持当前栏不动，${splitBtnLabel}并定位到此函数`}
              >
                <Icon name="columns" size={11} />
                <span>{splitBtnLabel}</span>
              </button>
              {mode === "peek-def" ? (
                <button
                  type="button"
                  onClick={() => void openSymbolReferences(docId, symbol)}
                  className="rounded border border-line bg-elevated px-2 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-fg"
                >
                  查找全部引用
                </button>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={closePeek}
            title="关闭面板 (Esc)"
            className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

      {/* 主体区域 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted">
          <Icon name="loader" size={16} className="animate-spin text-accent" />
          <span>正在检索工程代码符号…</span>
        </div>
      ) : locations.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-muted">
          未在当前文件或工程目录中找到「{symbol}」的定义或引用。
        </div>
      ) : mode === "peek-def" && activeLoc ? (
        <div className="flex flex-col overflow-hidden">
          {/* 若存在多个同名定义，提供顶部切换标签 */}
          {locations.length > 1 ? (
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line/60 bg-sidebar px-2.5 py-1">
              {locations.map((loc, idx) => (
                <button
                  key={`${loc.path ?? loc.docId}-${loc.line}`}
                  type="button"
                  onClick={() => setPeekSelectedIndex(idx)}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                    idx === selectedIndex
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-hover hover:text-fg"
                  }`}
                >
                  <span>
                    {loc.fileName}:{loc.line}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex shrink-0 items-center justify-between border-b border-line/60 bg-sidebar/60 px-3 py-1 text-[11px] text-muted">
              <div className="flex items-center gap-2 truncate">
                <span
                  className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                    (KIND_BADGE[activeLoc.kind] ?? KIND_BADGE.function).cls
                  }`}
                >
                  {(KIND_BADGE[activeLoc.kind] ?? KIND_BADGE.function).label}
                </span>
                <span className="truncate font-mono text-fg/90">
                  {activeLoc.path || activeLoc.fileName}
                </span>
                <span className="font-mono text-faint">
                  第 {firstLine}–{lastLine} 行（共 {displayLines.length} 行）
                </span>
              </div>
              <span className="text-[10.5px] text-faint">可滚动查看完整函数 · 双击行可直接跳转</span>
            </div>
          )}

          {/* 原函数完整代码滚动预览区（仅显示当前函数，带垂直与水平滚动条） */}
          <div className="peek-code-scroll max-h-[280px] overflow-x-auto overflow-y-auto overscroll-contain bg-app font-mono text-[12px] leading-relaxed">
            <div className="inline-block min-w-full py-1.5">
              {displayLines.map((sl) => {
                const isDefLine = sl.line === activeLoc.line;
                return (
                  <div
                    key={sl.line}
                    onDoubleClick={() =>
                      void jumpToCodeLocation(
                        { ...activeLoc, line: sl.line },
                        { openInSplit: false, fromDocId: docId, symbol },
                      )
                    }
                    className={`flex cursor-pointer items-baseline px-2 py-0.5 ${
                      isDefLine
                        ? "border-l-2 border-accent bg-accent-soft/80 font-semibold text-fg"
                        : "text-fg/85 hover:bg-hover/60"
                    }`}
                  >
                    <span className="w-11 shrink-0 select-none pr-3 text-right text-[11px] text-faint">
                      {sl.line}
                    </span>
                    <span className="whitespace-pre pr-4">{sl.text || " "}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 引用列表视图 */
        <div className="peek-code-scroll max-h-[280px] divide-y divide-line/50 overflow-y-auto overscroll-contain bg-app">
          {locations.map((loc, idx) => {
            const badge = loc.isDefinition
              ? KIND_BADGE[loc.kind] ?? KIND_BADGE.function
              : KIND_BADGE.reference;
            return (
              <div
                key={`${loc.path ?? loc.docId}-${loc.line}-${idx}`}
                onClick={() =>
                  void jumpToCodeLocation(loc, {
                    openInSplit: false,
                    fromDocId: docId,
                    symbol,
                  })
                }
                className="group flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-[12px] transition-colors hover:bg-hover"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] font-medium ${badge.cls}`}
                  >
                    {loc.isDefinition ? `定义 · ${badge.label}` : "引用"}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[11.5px] font-medium text-accent"
                    title={loc.path ?? loc.fileName}
                  >
                    {loc.fileName}:{loc.line}
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-muted group-hover:text-fg">
                    {loc.lineText}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void jumpToCodeLocation(loc, {
                      openInSplit: true,
                      fromDocId: docId,
                      symbol,
                    });
                  }}
                  title={`保持当前栏不动，${splitBtnLabel}此位置`}
                  className="shrink-0 rounded border border-line bg-elevated px-1.5 py-0.5 text-[10.5px] text-muted opacity-0 hover:text-fg group-hover:opacity-100"
                >
                  {splitBtnLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
