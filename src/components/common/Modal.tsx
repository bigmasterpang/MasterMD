import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** 点击遮罩是否关闭 */
  closeOnOverlay?: boolean;
}

/** 通用弹窗：支持 Esc 关闭、焦点圈定在内部 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 420,
  closeOnOverlay = false,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-6"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-elevated shadow-[var(--shadow)]"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-[13px] font-semibold text-fg">{title}</div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13px] leading-relaxed text-fg">
          {children}
        </div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-panel px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "default" | "danger" | "ghost";
  autoFocus?: boolean;
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "default",
  autoFocus,
  disabled,
}: ButtonProps) {
  const cls =
    variant === "primary"
      ? "bg-accent text-accent-fg border-transparent hover:opacity-90"
      : variant === "danger"
        ? "bg-danger text-white border-transparent hover:opacity-90"
        : variant === "ghost"
          ? "bg-transparent border-transparent text-muted hover:bg-hover hover:text-fg"
          : "bg-elevated border-line text-fg hover:bg-hover";
  return (
    <button
      type="button"
      data-autofocus={autoFocus ? "" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[76px] rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
