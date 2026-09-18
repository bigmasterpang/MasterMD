import { useState } from "react";
import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useUpdateStore } from "../../stores/updateStore";
import { formatSize, openReleasesPage } from "../../utils/updateCheck";
import { formatTime } from "../../utils/timing";

/** 检查更新 / 下载安装弹窗 */
export function UpdateDialog() {
  const {
    dialogVisible,
    info,
    checking,
    error,
    downloading,
    progress,
    received,
    total,
    downloadedPath,
    installed,
  } = useUpdateStore();
  const [showNotes, setShowNotes] = useState(true);
  const close = () => useUpdateStore.getState().hideDialog();

  const canInstall = Boolean(info?.downloadUrl);
  const percent = Math.round(progress * 100);

  const title = error
    ? "更新失败"
    : downloading
      ? "正在下载更新"
      : info?.hasUpdate
        ? "发现新版本"
        : "检查更新";

  const footer = error ? (
    <>
      <Button variant="ghost" onClick={close}>
        关闭
      </Button>
      {canInstall ? (
        <Button
          variant="primary"
          onClick={() => {
            useUpdateStore.getState().resetDownload();
            void useUpdateStore.getState().downloadAndInstall();
          }}
        >
          重试下载
        </Button>
      ) : null}
    </>
  ) : downloading ? (
    <Button variant="ghost" onClick={close}>
      后台下载中…
    </Button>
  ) : downloadedPath ? (
    <>
      <Button
        onClick={() => void openReleasesPage("https://github.com/bigmasterpang/MasterMD/releases")}
      >
        打开发布页面
      </Button>
      <Button variant="primary" onClick={() => void useUpdateStore.getState().runInstaller()}>
        {installed ? "再次运行安装包" : "运行安装包"}
      </Button>
    </>
  ) : info?.hasUpdate ? (
    <>
      <Button variant="ghost" onClick={close}>
        稍后提醒
      </Button>
      {canInstall ? (
        <Button
          variant="primary"
          autoFocus
          onClick={() => void useUpdateStore.getState().downloadAndInstall()}
        >
          立即更新
        </Button>
      ) : (
        <Button variant="primary" autoFocus onClick={() => void openReleasesPage(info.url)}>
          打开发布页面
        </Button>
      )}
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => void useUpdateStore.getState().check()}>
        {checking ? "检查中…" : "重新检查"}
      </Button>
      <Button variant="primary" autoFocus onClick={close}>
        关闭
      </Button>
    </>
  );

  return (
    <Modal open={dialogVisible} title={title} onClose={close} width={540} footer={footer}>
      {error ? (
        <div className="flex gap-2 text-danger">
          <Icon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
          <div className="whitespace-pre-wrap break-all">{error}</div>
        </div>
      ) : downloading ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-fg">
            <Icon name="download" size={18} className="text-accent" />
            <span>
              正在下载 {info?.filename}（{formatSize(total, info?.humanSize)}）
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>{percent}%</span>
            <span>
              {formatSize(received)} / {formatSize(total, info?.humanSize)}
            </span>
          </div>
          <div className="text-[11px] text-faint">下载完成后会自动校验 SHA-256 并启动安装程序</div>
        </div>
      ) : downloadedPath ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="check" size={18} className="text-success" />
            <div>
              安装包已下载并通过 SHA-256 校验
              {installed ? "，安装程序已启动" : ""}
            </div>
          </div>
          <div className="break-all rounded-md border border-line bg-panel p-2 text-[11px] text-muted">
            {downloadedPath}
          </div>
          <div className="text-[12px] text-muted">
            请在弹出的安装向导中完成安装；安装程序会自动关闭 mastermd，完成后可重新打开。
          </div>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {info.humanSize || info.size ? <span>安装包大小：{formatSize(info.size, info.humanSize)}</span> : null}
            {info.publishedAt ? (
              <span>
                发布时间：
                {/^\d{4}-\d{2}-\d{2}/.test(info.publishedAt)
                  ? info.publishedAt
                  : formatTime(new Date(info.publishedAt).getTime())}
              </span>
            ) : null}
            <span>来源：{info.source === "portal" ? "软件中心" : "GitHub"}</span>
          </div>
          {info.notes ? (
            <div>
              <button
                type="button"
                onClick={() => setShowNotes((value) => !value)}
                className="mb-1 flex items-center gap-1 text-[11px] text-muted hover:text-fg"
              >
                <Icon name={showNotes ? "chevron-down" : "chevron-right"} size={12} />
                更新说明
              </button>
              {showNotes ? (
                <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel p-3 font-sans text-[12px] leading-relaxed text-fg">
                  {info.notes}
                </pre>
              ) : null}
            </div>
          ) : (
            <div className="text-[12px] text-muted">该版本没有提供更新说明。</div>
          )}
          {!canInstall ? (
            <div className="text-[11px] text-warning">
              当前更新源不支持应用内下载，点击「打开发布页面」手动下载。
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="check" size={18} className="text-success" />
            <div>
              已是最新版本（当前 <b>{info.current}</b>）
            </div>
          </div>
          <div className="text-[12px] text-muted">版本来源：软件中心 · bigmasterpang/MasterMD</div>
        </div>
      )}
    </Modal>
  );
}
