import { useEffect, useRef } from "react";
import { Icon } from "../common/Icon";
import { useSearchStore } from "../../stores/searchStore";
import { useAppStore } from "../../stores/appStore";

/** Notepad++ 风格的查找 / 替换面板 */
export function SearchBar() {
  const visible = useSearchStore((s) => s.visible);
  const replaceVisible = useSearchStore((s) => s.replaceVisible);
  const query = useSearchStore((s) => s.query);
  const replacement = useSearchStore((s) => s.replacement);
  const options = useSearchStore((s) => s.options);
  const matches = useSearchStore((s) => s.matches);
  const current = useSearchStore((s) => s.current);
  const error = useSearchStore((s) => s.error);
  const viewMode = useAppStore((s) => s.viewMode);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  // 面板刚打开时把焦点放在输入框；切换文档时重新计算
  const activeId = useAppStore((s) => s.activeId);
  useEffect(() => {
    if (visible) useSearchStore.getState().recompute(true);
  }, [activeId, visible]);

  if (!visible) return null;

  const counter = error
    ? "正则错误"
    : matches.length > 0
      ? `${current + 1}/${matches.length}`
      : query
        ? "无结果"
        : "";

  const step = (direction: -1 | 1) => useSearchStore.getState().step(direction);

  const close = () => {
    useSearchStore.getState().close();
  };

  const toggleClass = (active: boolean) =>
    `flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors ${
      active
        ? "bg-accent-soft text-accent"
        : "text-muted hover:bg-hover hover:text-fg"
    }`;

  return (
    <div className="absolute right-6 top-3 z-30 w-[430px] rounded-[var(--radius)] border border-line bg-elevated p-2 shadow-[var(--shadow)]">
      {/* 查找行 */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={replaceVisible ? "隐藏替换" : "显示替换 (Ctrl+H)"}
          onClick={() =>
            useSearchStore.setState({ replaceVisible: !replaceVisible })
          }
          className={toggleClass(replaceVisible)}
        >
          <Icon name="chevron-down" size={13} className={replaceVisible ? "" : "-rotate-90"} />
        </button>
        <Icon name="search" size={14} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => useSearchStore.getState().setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          placeholder="查找内容…"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded border border-line bg-input px-2 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
        />
        <span className="min-w-[52px] shrink-0 text-center text-[11px] text-faint">
          {counter}
        </span>
        <button type="button" title="查找上一个 (Shift+Enter / Shift+F3)" onClick={() => step(-1)} className={toggleClass(false)}>
          <Icon name="arrow-up" size={14} />
        </button>
        <button type="button" title="查找下一个 (Enter / F3)" onClick={() => step(1)} className={toggleClass(false)}>
          <Icon name="arrow-down" size={14} />
        </button>
        <button type="button" title="关闭 (Esc)" onClick={close} className={toggleClass(false)}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* 选项行 */}
      <div className="mt-1.5 flex items-center gap-1 pl-6">
        <button
          type="button"
          title="区分大小写"
          onClick={() => useSearchStore.getState().toggleOption("caseSensitive")}
          className={toggleClass(options.caseSensitive)}
        >
          Aa
        </button>
        <button
          type="button"
          title="全字匹配"
          onClick={() => useSearchStore.getState().toggleOption("wholeWord")}
          className={toggleClass(options.wholeWord)}
        >
          <span className="underline decoration-dotted">W</span>
        </button>
        <button
          type="button"
          title="正则表达式"
          onClick={() => useSearchStore.getState().toggleOption("regex")}
          className={toggleClass(options.regex)}
        >
          .*
        </button>
        <button
          type="button"
          title=". 匹配换行"
          onClick={() => useSearchStore.getState().toggleOption("dotAll")}
          className={toggleClass(options.dotAll)}
        >
          .\n
        </button>
        <button
          type="button"
          title="循环查找（到达末尾后回到开头）"
          onClick={() => useSearchStore.getState().toggleOption("wrapAround")}
          className={toggleClass(options.wrapAround)}
        >
          <Icon name="refresh" size={13} />
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-faint">
          {viewMode === "preview" ? "预览模式（替换作用于源码）" : "源码模式"}
        </span>
      </div>

      {error ? (
        <div className="mt-1.5 flex items-start gap-1 rounded bg-danger-soft px-2 py-1 text-[11px] text-danger">
          <Icon name="alert-triangle" size={12} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      ) : null}

      {/* 替换行 */}
      {replaceVisible ? (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="w-6 shrink-0" />
          <Icon name="refresh" size={14} className="shrink-0 text-faint" />
          <input
            value={replacement}
            onChange={(event) =>
              useSearchStore.getState().setReplacement(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                useSearchStore.getState().replaceCurrent();
              } else if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
            placeholder="替换为…"
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded border border-line bg-input px-2 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
          />
          <button
            type="button"
            title="替换当前匹配"
            onClick={() => useSearchStore.getState().replaceCurrent()}
            className="h-7 shrink-0 rounded border border-line bg-elevated px-2.5 text-[11px] text-fg hover:bg-hover"
          >
            替换
          </button>
          <button
            type="button"
            title="替换全部匹配"
            onClick={() => useSearchStore.getState().replaceAll()}
            className="h-7 shrink-0 rounded border border-transparent bg-accent px-2.5 text-[11px] font-medium text-accent-fg hover:opacity-90"
          >
            全部替换
          </button>
        </div>
      ) : null}
    </div>
  );
}
