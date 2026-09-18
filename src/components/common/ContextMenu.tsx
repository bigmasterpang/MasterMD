import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export interface ContextMenuItem {
  label: string;
  icon?: IconName;
  hint?: string;
  disabled?: boolean;
  /** 在该项之前插入分隔线 */
  divider?: boolean;
  onClick: () => void | Promise<void>;
}

interface Props {
  x: number;
  y: number;
  groups: ContextMenuItem[][];
  onClose: () => void;
}

/** 通用右键菜单：自动避开窗口边缘，点击外部 / Esc / 滚动即关闭 */
export function ContextMenu({ x, y, groups, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    const maxTop = window.innerHeight - rect.height - 8;
    setPos({
      left: Math.max(8, Math.min(x, maxLeft)),
      top: Math.max(8, Math.min(y, maxTop)),
    });
  }, [x, y, groups]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
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
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  let rendered = 0;
  return (
    <div
      ref={ref}
      className="fixed z-[200] max-h-[70vh] w-[228px] overflow-y-auto rounded-[var(--radius)] border border-line bg-elevated py-1 shadow-[var(--shadow)]"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {groupIndex > 0 ? <div className="my-1 h-px bg-line" /> : null}
          {group.map((item) => {
            rendered += 1;
            return (
              <button
                key={`${item.label}-${rendered}`}
                type="button"
                disabled={item.disabled}
                title={item.hint}
                onClick={() => {
                  onClose();
                  void item.onClick();
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
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
