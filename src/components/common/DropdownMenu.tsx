import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  icon?: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  /** 高亮显示为当前项 */
  active?: boolean;
}

export interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

interface Props {
  icon?: IconName;
  label?: string;
  title: string;
  groups: MenuGroup[];
  disabled?: boolean;
  active?: boolean;
  align?: "left" | "right";
  width?: number;
}

/** 工具栏下拉菜单：点击展开，点击外部 / Esc 关闭 */
export function DropdownMenu({
  icon,
  label,
  title,
  groups,
  disabled,
  active,
  align = "left",
  width = 210,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-7 items-center gap-1 rounded-md px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          open || active
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-hover hover:text-fg"
        }`}
      >
        {icon ? <Icon name={icon} size={15} /> : null}
        {label ? <span>{label}</span> : null}
        <Icon name="chevron-down" size={11} className="opacity-60" />
      </button>

      {open ? (
        <div
          className={`absolute top-[30px] z-40 max-h-[70vh] overflow-y-auto rounded-[var(--radius)] border border-line bg-elevated py-1 shadow-[var(--shadow)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ width }}
        >
          {groups.map((group, groupIndex) => (
            <div key={group.title ?? groupIndex}>
              {group.title ? (
                <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                  {group.title}
                </div>
              ) : null}
              {groupIndex > 0 ? <div className="my-1 h-px bg-line" /> : null}
              {group.items.map((item) => (
                <MenuRow key={item.label} item={item} onDone={() => setOpen(false)} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({ item, onDone }: { item: MenuItem; onDone: () => void }): ReactNode {
  return (
    <button
      type="button"
      disabled={item.disabled}
      title={item.hint}
      onClick={() => {
        onDone();
        item.onClick();
      }}
      className={`flex w-full items-center gap-2 px-3 py-[6px] text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        item.active ? "bg-accent-soft text-accent" : "text-fg hover:bg-hover"
      }`}
    >
      {item.icon ? <Icon name={item.icon} size={14} className="shrink-0 opacity-70" /> : <span className="w-[14px] shrink-0" />}
      <span className="flex-1 truncate">{item.label}</span>
      {item.hint ? (
        <span className="shrink-0 font-mono text-[10px] text-faint">{item.hint}</span>
      ) : null}
    </button>
  );
}
