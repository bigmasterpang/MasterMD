import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useUpdateStore } from "../../stores/updateStore";
import { openReleasesPage } from "../../utils/updateCheck";
import { formatTime } from "../../utils/timing";

/** 检查更新结果弹窗 */
export function UpdateDialog() {
  const { dialogVisible, info, checking, error } = useUpdateStore();
  const close = () => useUpdateStore.getState().hideDialog();

  const title = error
    ? "检查更新失败"
    : info?.hasUpdate
      ? "发现新版本"
      : info
        ? "检查更新"
        : "检查更新";

  return (
    <Modal
      open={dialogVisible}
      title={title}
      onClose={close}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={() => void useUpdateStore.getState().check()}>
            {checking ? "检查中…" : "重新检查"}
          </Button>
          {info?.hasUpdate ? (
            <Button variant="primary" onClick={() => void openReleasesPage(info.url)}>
              打开发布页面
            </Button>
          ) : (
            <Button variant="primary" autoFocus onClick={close}>
              关闭
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <div className="flex gap-2 text-danger">
          <Icon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
          <div className="break-all">{error}</div>
        </div>
      ) : !info ? (
        <div>正在检查更新…</div>
      ) : info.hasUpdate ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="download" size={18} className="text-accent" />
            <div>
              新版本 <b>{info.latest}</b>（当前 {info.current}）
            </div>
          </div>
          {info.publishedAt ? (
            <div className="text-[12px] text-muted">
              发布时间：{formatTime(new Date(info.publishedAt).getTime())}
            </div>
          ) : null}
          {info.notes ? (
            <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel p-3 font-sans text-[12px] leading-relaxed text-fg">
              {info.notes}
            </pre>
          ) : (
            <div className="text-[12px] text-muted">该版本没有提供更新说明。</div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="check" size={18} className="text-success" />
            <div>
              已是最新版本（当前 <b>{info.current}</b>）
            </div>
          </div>
          <div className="text-[12px] text-muted">
            版本来源：github.com/bigmasterpang/MasterMD
          </div>
        </div>
      )}
    </Modal>
  );
}
