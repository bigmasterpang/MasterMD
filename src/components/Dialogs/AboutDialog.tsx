import { useEffect, useState } from "react";
import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useDialogStore } from "../../stores/dialogStore";
import { useUpdateStore } from "../../stores/updateStore";
import { openReleasesPage } from "../../utils/updateCheck";
import {
  APP_NAME,
  AUTHOR_NAME,
  AUTHOR_NAME_CN,
  PROJECT_URL,
} from "../../utils/constants";
import { getVersion } from "@tauri-apps/api/app";

/** 关于 MasterMD：版本、作者与项目信息 */
export function AboutDialog() {
  const open = useDialogStore((s) => s.aboutVisible);
  const close = () => useDialogStore.getState().setAboutVisible(false);
  const info = useUpdateStore((s) => s.info);
  const checking = useUpdateStore((s) => s.checking);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!open) return;
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.0.0"));
  }, [open]);

  return (
    <Modal
      open={open}
      title={`关于 ${APP_NAME}`}
      onClose={close}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={() => void openReleasesPage(PROJECT_URL)}>
            项目主页
          </Button>
          <Button
            onClick={() => {
              void useUpdateStore.getState().check();
            }}
          >
            {checking ? "检查中…" : "检查更新"}
          </Button>
          <Button variant="primary" autoFocus onClick={close}>
            关闭
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
            <Icon name="file-text" size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-fg">{APP_NAME}</div>
            <div className="text-[12px] text-muted">Windows Markdown 查看与编辑器</div>
            <div className="mt-0.5 font-mono text-[11px] text-faint">
              版本 {version || "…"}
              {info?.hasUpdate ? ` · 有新版本 ${info.latest}` : ""}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-line bg-panel px-3 py-2.5 text-[12px]">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            作者
          </div>
          <div className="text-fg">
            {AUTHOR_NAME}（{AUTHOR_NAME_CN}）
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            Master 系列软件作者 · 本站所有软件均为其设计与开发
          </div>
        </div>

        <div className="space-y-1 text-[11px] leading-relaxed text-muted">
          <div>
            技术栈：Tauri 2 · Rust · React 19 · TypeScript · CodeMirror 6 ·
            markdown-it
          </div>
          <div>
            项目地址：
            <button
              type="button"
              className="ml-1 text-accent hover:underline"
              onClick={() => void openReleasesPage(PROJECT_URL)}
            >
              {PROJECT_URL.replace("https://", "")}
            </button>
          </div>
          <div>© 2026 {AUTHOR_NAME}（{AUTHOR_NAME_CN}）· 保留所有权利</div>
        </div>
      </div>
    </Modal>
  );
}
