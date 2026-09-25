import { useMemo, useState, useRef, useEffect } from "react";
import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { analyzeSymbols, type NavItem } from "../../utils/outline";
import { fileName, isMarkdownDoc } from "../../utils/filePath";
import {
  goToSymbolDefinition,
  navigateHistoryBack,
  navigateHistoryForward,
  openSymbolReferences,
  peekSymbolDefinition,
  scrollEditorToLineAndFlash,
  useCodeNavStore,
} from "../../utils/codeNavigation";

interface Props {
  docId: string;
}

/**
 * 代码查看器顶部面包屑与符号导航栏：
 * - 历史后退 / 前进 (Alt+← / Alt+→)
 * - 文件名 › 所在类/结构体 › 当前函数 (点击可快速切换本文件任意函数)
 * - 光标下符号快捷操作：转到定义 (F12) · 速览定义 (Alt+F12) · 查找引用 (Shift+F12)
 * - 当前窗口文档独立缩放百分比指示器
 */
export function CodeBreadcrumbBar({ docId }: Props) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const defaultFontSize = useSettingsStore((s) => s.fontSize);
  const backStack = useCodeNavStore((s) => s.backStack);
  const forwardStack = useCodeNavStore((s) => s.forwardStack);
  const activeSymbol = useCodeNavStore((s) => s.activeSymbol);

  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!symbolMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSymbolMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [symbolMenuOpen]);

  const symbols = useMemo<NavItem[]>(() => {
    if (!doc?.filePath || !doc?.content) return [];
    return analyzeSymbols(doc.filePath, doc.content);
  }, [doc?.filePath, doc?.content]);

  // 根据当前光标行计算所属类/作用域与当前函数
  const cursorLine = doc?.cursorLine ?? 1;
  const { currentContainer, currentSymbol } = useMemo(() => {
    let container: NavItem | null = null;
    let active: NavItem | null = null;
    for (const item of symbols) {
      if (item.line <= cursorLine) {
        if (item.kind === "class" || item.kind === "section" || item.kind === "table") {
          container = item;
        }
        active = item;
      } else {
        break;
      }
    }
    if (active && container && active.id === container.id) {
      return { currentContainer: null, currentSymbol: active };
    }
    return { currentContainer: container, currentSymbol: active };
  }, [symbols, cursorLine]);

  if (!doc || isMarkdownDoc(doc)) return null;

  const docFontSize = doc.fontSize ?? defaultFontSize;
  const zoomPercent = Math.round((docFontSize / defaultFontSize) * 100);
  const lastBack = backStack[backStack.length - 1];
  const lastForward = forwardStack[forwardStack.length - 1];

  return (
    <div className="print-hide flex h-7 shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-panel/70 px-2.5 text-[11.5px] select-none">
      {/* 左侧：前进/后退 + 面包屑路径与当前函数选择器 */}
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          disabled={backStack.length === 0}
          onClick={() => void navigateHistoryBack()}
          title={
            lastBack
              ? `返回上一位置: ${lastBack.fileName}:${lastBack.line} (Alt+←)`
              : "返回上一位置 (Alt+←)"
          }
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg disabled:opacity-35 disabled:pointer-events-none"
        >
          <Icon name="arrow-left" size={12} />
        </button>
        <button
          type="button"
          disabled={forwardStack.length === 0}
          onClick={() => void navigateHistoryForward()}
          title={
            lastForward
              ? `前进下一位置: ${lastForward.fileName}:${lastForward.line} (Alt+→)`
              : "前进下一位置 (Alt+→)"
          }
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg disabled:opacity-35 disabled:pointer-events-none"
        >
          <Icon name="arrow-right" size={12} />
        </button>

        <div className="mx-1 h-3.5 w-px bg-line" />

        {/* 文件名 */}
        <span className="flex items-center gap-1 truncate text-muted">
          <Icon name="code" size={12} className="shrink-0 text-accent/80" />
          <span className="truncate font-medium text-fg/85">
            {doc.filePath ? fileName(doc.filePath) : "未命名代码"}
          </span>
        </span>

        {/* 所属类/模块 */}
        {currentContainer ? (
          <>
            <Icon name="chevron-right" size={11} className="shrink-0 text-faint" />
            <button
              type="button"
              onClick={() => scrollEditorToLineAndFlash(docId, currentContainer.line)}
              className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-muted hover:bg-hover hover:text-fg"
              title={`跳转到 ${currentContainer.text} (行 ${currentContainer.line})`}
            >
              <Icon name="box" size={11} className="shrink-0 text-amber-500" />
              <span className="truncate">{currentContainer.text}</span>
            </button>
          </>
        ) : null}

        {/* 当前函数/符号下拉选择器 */}
        {symbols.length > 0 ? (
          <div ref={menuRef} className="relative flex items-center">
            <Icon name="chevron-right" size={11} className="shrink-0 text-faint" />
            <button
              type="button"
              onClick={() => setSymbolMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-accent-soft"
              title="点击展开本文件全部函数与符号列表"
            >
              <span>
                {currentSymbol ? currentSymbol.text : `行 ${cursorLine}`}
              </span>
              <Icon name="chevron-down" size={10} />
            </button>

            {symbolMenuOpen ? (
              <div className=" absolute left-1 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-line bg-elevated p-1 shadow-lg">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  本文件函数与符号 ({symbols.length})
                </div>
                {symbols.map((sym) => {
                  const isCurrent = currentSymbol?.id === sym.id;
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      onClick={() => {
                        setSymbolMenuOpen(false);
                        scrollEditorToLineAndFlash(docId, sym.line);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11.5px] transition-colors ${
                        isCurrent
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-fg hover:bg-hover"
                      }`}
                      style={{ paddingLeft: `${8 + Math.max(0, sym.level - 1) * 10}px` }}
                    >
                      <span className="truncate font-mono">{sym.text}</span>
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        :{sym.line}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 右侧：当前光标下符号的快捷导航动作 + 窗口独立缩放比例 */}
      <div className="flex shrink-0 items-center gap-1.5">
        {activeSymbol ? (
          <div className="flex items-center gap-1 rounded border border-line/80 bg-elevated/80 px-1.5 py-0.5">
            <span
              className="max-w-[120px] truncate font-mono text-[11px] font-medium text-accent"
              title={`当前光标符号: ${activeSymbol}（按住 Ctrl 单击可直接跳转）`}
            >
              {activeSymbol}
            </span>
            <span className="text-line">|</span>
            <button
              type="button"
              onClick={() => void goToSymbolDefinition(docId, activeSymbol)}
              title="转到原函数定义 (F12 / Ctrl+单击)"
              className="rounded px-1 py-0.2 text-[10.5px] text-fg/85 hover:bg-accent-soft hover:text-accent"
            >
              转到定义
            </button>
            <button
              type="button"
              onClick={() => void peekSymbolDefinition(docId, activeSymbol)}
              title="内联速览原函数实现 (Alt+F12)"
              className="rounded px-1 py-0.2 text-[10.5px] text-muted hover:bg-hover hover:text-fg"
            >
              速览
            </button>
            <button
              type="button"
              onClick={() => void openSymbolReferences(docId, activeSymbol)}
              title="查找所有引用 (Shift+F12)"
              className="rounded px-1 py-0.2 text-[10.5px] text-muted hover:bg-hover hover:text-fg"
            >
              引用
            </button>
          </div>
        ) : (
          <span className="hidden md:inline text-[10.5px] text-faint">
            Ctrl+单击 或 右键符号可转到原函数定义
          </span>
        )}

        {zoomPercent !== 100 ? (
          <button
            type="button"
            onClick={() => useAppStore.getState().patchDoc(docId, { fontSize: undefined })}
            title="当前窗口文档独立缩放比例（点击恢复 100% 默认字号）"
            className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-accent hover:opacity-85"
          >
            {zoomPercent}%
          </button>
        ) : null}
      </div>
    </div>
  );
}
