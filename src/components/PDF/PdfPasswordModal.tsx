import { useState, useEffect, useRef } from "react";
import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useDialogStore } from "../../stores/dialogStore";

export function PdfPasswordModal() {
  const { open, name, error, resolve } = useDialogStore((s) => s.pdfPassword);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleClose = () => {
    useDialogStore.getState().setPdfPassword({ open: false, resolve: null });
    resolve?.(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    useDialogStore.getState().setPdfPassword({ open: false, resolve: null });
    resolve?.(password);
  };

  return (
    <Modal
      open={open}
      title="输入 PDF 密码"
      onClose={handleClose}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()}>
            解锁
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Icon name="key" size={16} className="text-accent" />
          <span className="truncate">文件「{name}」已受密码保护，请输入密码以解锁：</span>
        </div>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded-md border border-line bg-app px-3 py-2 pr-10 text-[13px] text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 text-muted hover:text-fg"
            title={showPassword ? "隐藏密码" : "显示密码"}
          >
            <Icon name={showPassword ? "eye" : "lock"} size={16} />
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-1.5 text-[12px] text-danger">
            <Icon name="alert-triangle" size={14} />
            <span>{error}</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
