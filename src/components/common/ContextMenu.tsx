import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export interface ContextMenuItem {
  label: string;
  icon?: IconName;
  hint?: string;
  disabled?: boolean;
  /** 二级菜单（设置了 submenu 时忽略 onClick） */
  submenu?: ContextMenuItem[][];
  onClick?: () => void | Promise<void>;
}

interface Props {
  x: number;
  y: number;
  groups: ContextMenuItem[][];
  onClose: () => void;
}

const PANEL_CLASS =
  "fixed z-[200] max-h-[72vh] w-[228px] overflow-y-auto rounded-[var(--radius)] border border-line bg-elevated py-1 shadow-[var(--shadow)]";

const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max));

/** 通用右键菜单：支持二级子菜单，自动避开窗口边缘 */
export function ContextMenu({ x, y, groups, onClose }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [submenu, setSubmenu] = useState<{
    key: string;
    left: number;
    top: number;
    groups: ContextMenuItem[][];
  } | null>(null);

  useLayoutEffect(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: clamp(x, window.innerWidth - rect.width - 8),
      top: clamp(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y, groups]);

  // 子菜单渲染后修正位置：右侧空间不足翻到左边，底部不足则上移
  useEffect(() => {
    const node = submenuRef.current;
    if (!node || !submenu) return;
    const rect = node.getBoundingClientRect();
    let { left, top } = submenu;
    if (rect.right > window.innerWidth - 8) left = Math.max(8, left - rect.width - 232);
    if (rect.bottom > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8);
    if (left !== submenu.left || top !== submenu.top) {
      setSubmenu({ ...submenu, left, top });
    }
  }, [submenu]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const renderGroups = (list: ContextMenuItem[][], isSub: boolean) => {
    let counter = 0;
    return list.map((group, groupIndex) => (
      <div key={groupIndex}>
        {groupIndex > 0 ? <div className="my-1 h-px bg-line" /> : null}
        {group.map((item) => {
          counter += 1;
          const key = `${isSub ? "sub" : "main"}-${counter}`;
          const hasSubmenu = Boolean(item.submenu?.length);
          const openSubmenu = (element: HTMLElement) => {
            if (isSub || !item.submenu) return;
            const rect = element.getBoundingClientRect();
            setSubmenu({
              key,
              left: rect.right + 2,
              top: rect.top - 6,
              groups: item.submenu,
            });
          };
          return (
            <button
              key={key}
              type="button"
              disabled={item.disabled}
              title={item.hint}
              onMouseEnter={(event) => {
                if (hasSubmenu) openSubmenu(event.currentTarget);
                else if (!isSub) setSubmenu(null);
              }}
              onClick={(event) => {
                if (hasSubmenu) {
                  openSubmenu(event.currentTarget);
                  return;
                }
                onClose();
                void item.onClick?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-[6px] text-left text-[12px] text-fg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.icon ? (
                <Icon name={item.icon} size={14} className="shrink-0 opacity-70" />
              ) : (
                <span className="w-[14px] shrink-0" />
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint ? (
                <span className="shrink-0 font-mono text-[10px] text-faint">{item.hint}</span>
              ) : null}
              {hasSubmenu ? (
                <Icon name="chevron-right" size={12} className="shrink-0 opacity-60" />
              ) : null}
            </button>
          );
        })}
      </div>
    ));
  };

  return (
    <div ref={wrapperRef} style={{ display: "contents" }}>
      <div
        ref={panelRef}
        className={PANEL_CLASS}
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {renderGroups(groups, false)}
      </div>
      {submenu ? (
        <div
          ref={submenuRef}
          className={PANEL_CLASS}
          style={{ left: submenu.left, top: submenu.top }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {renderGroups(submenu.groups, true)}
        </div>
      ) : null}
    </div>
  );
}
