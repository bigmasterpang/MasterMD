import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useDialogStore } from "../../stores/dialogStore";
import type { ConflictChoice, UnsavedChoice } from "../../types";

/** 未保存变更确认：保存 / 不保存 / 取消 */
export function UnsavedDialog() {
  const { open, name, resolve } = useDialogStore((s) => s.unsaved);
  const done = (choice: UnsavedChoice) => {
    useDialogStore.getState().setUnsaved({ open: false, resolve: null });
    resolve?.(choice);
  };

  return (
    <Modal
      open={open}
      title="未保存的更改"
      onClose={() => done("cancel")}
      footer={
        <>
          <Button variant="ghost" onClick={() => done("cancel")}>
            取消
          </Button>
          <Button onClick={() => done("discard")}>不保存</Button>
          <Button variant="primary" autoFocus onClick={() => done("save")}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <Icon name="alert-triangle" size={20} className="mt-0.5 shrink-0 text-warning" />
        <div>
          「{name}」有未保存的更改。
          <br />
          是否在继续之前保存？
        </div>
      </div>
    </Modal>
  );
}

/** 外部修改冲突：保留本地 / 加载外部 / 另存为 */
export function ConflictDialog() {
  const { open, name, resolve } = useDialogStore((s) => s.conflict);
  const done = (choice: ConflictChoice) => {
    useDialogStore.getState().setConflict({ open: false, resolve: null });
    resolve?.(choice);
  };

  return (
    <Modal
      open={open}
      title="文件已被外部修改"
      onClose={() => done("local")}
      width={480}
      footer={
        <>
          <Button onClick={() => done("saveas")}>另存为…</Button>
          <Button onClick={() => done("external")}>加载外部版本</Button>
          <Button variant="primary" autoFocus onClick={() => done("local")}>
            保留本地
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <Icon name="refresh" size={20} className="mt-0.5 shrink-0 text-warning" />
        <div>
          「{name}」在磁盘上被其它程序修改，而当前文档还有未保存的更改。
          <br />
          <br />
          <b>保留本地</b>：忽略外部修改（下次保存会覆盖外部内容）
          <br />
          <b>加载外部版本</b>：放弃本地未保存内容
          <br />
          <b>另存为</b>：把本地内容保存到新文件
        </div>
      </div>
    </Modal>
  );
}

/** 通用确认框 */
export function ConfirmDialog() {
  const { open, request, resolve } = useDialogStore((s) => s.confirm);
  const done = (ok: boolean) => {
    useDialogStore.getState().setConfirm({ open: false, resolve: null });
    resolve?.(ok);
  };

  return (
    <Modal
      open={open}
      title={request?.title ?? ""}
      onClose={() => done(false)}
      footer={
        <>
          <Button onClick={() => done(false)}>{request?.cancelText ?? "取消"}</Button>
          <Button
            variant={request?.danger ? "danger" : "primary"}
            autoFocus
            onClick={() => done(true)}
          >
            {request?.confirmText ?? "确定"}
          </Button>
        </>
      }
    >
      <div className="whitespace-pre-wrap">{request?.message}</div>
    </Modal>
  );
}

/** 通用提示框 */
export function MessageDialog() {
  const { open, title, text, resolve } = useDialogStore((s) => s.message);
  const done = () => {
    useDialogStore.getState().setMessage({ open: false, resolve: null });
    resolve?.();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={done}
      width={440}
      footer={
        <Button variant="primary" autoFocus onClick={done}>
          知道了
        </Button>
      }
    >
      <div className="whitespace-pre-wrap break-words">{text}</div>
    </Modal>
  );
}
