import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { APP_NAME, AUTHOR_NAME, AUTHOR_NAME_CN } from "../../utils/constants";
import { newDocument, openFileDialog, openPath, removeRecentFile } from "../../utils/fileActions";
import { fileName } from "../../utils/filePath";

/** 无文档时的欢迎页：快捷入口 + 最近文件 */
export function WelcomeScreen() {
  const recentFiles = useAppStore((s) => s.recentFiles);
  const limit = 10;

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-app">
      <div className="w-full max-w-[520px] px-8 py-10">
        <div className="mb-8 flex items-center gap-3">
          <img src="/app-icon.png" alt={APP_NAME} className="h-11 w-11 rounded-[10px]" />
          <div>
            <div className="text-[19px] font-semibold text-fg">{APP_NAME}</div>
            <div className="text-[12px] text-muted">
              Markdown 查看与简易编辑器 · 作者 {AUTHOR_NAME}（{AUTHOR_NAME_CN}）
            </div>
          </div>
        </div>

        <div className="mb-8 flex gap-2">
          <button
            type="button"
            onClick={() => void openFileDialog()}
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            <Icon name="folder-open" size={16} />
            打开文件
          </button>
          <button
            type="button"
            onClick={() => void newDocument()}
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border border-line bg-elevated px-4 py-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-hover"
          >
            <Icon name="file-plus" size={16} />
            新建文档
          </button>
        </div>

        {recentFiles.length > 0 ? (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-faint">
              <span>最近文件</span>
              <span>{Math.min(recentFiles.length, limit)} 项</span>
            </div>
            <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-elevated">
              {recentFiles.slice(0, limit).map((path) => (
                <div
                  key={path}
                  className="group flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 last:border-b-0 hover:bg-hover"
                  onClick={() => void openPath(path)}
                  title={path}
                >
                  <Icon name="file-text" size={14} className="shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-fg">{fileName(path)}</div>
                    <div className="truncate text-[11px] text-faint">{path}</div>
                  </div>
                  <button
                    type="button"
                    title="从列表移除"
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeRecentFile(path);
                    }}
                    className="rounded p-1 text-faint opacity-0 hover:bg-active hover:text-fg group-hover:opacity-100"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-[var(--radius)] border border-dashed border-line-strong px-4 py-3 text-[12px] leading-relaxed text-muted">
          <div className="mb-1 font-medium text-fg">提示</div>
          支持 Markdown（.md / .markdown）、纯文本（.txt / .log）与常见代码 / 配置文件
          （.json / .js / .ts / .py / .java / .sql / .yml 等，自动语法高亮）；
          <br />
          文件拖入窗口即可打开，也可用 <code className="rounded bg-panel px-1">Ctrl+O</code> 选择；
          <br />
          常用快捷键：Ctrl+S 保存 · Ctrl+E 切换视图 · Ctrl+F 查找 · F1 快捷键
        </div>

        <div className="mt-6 text-center text-[11px] text-faint">
          © 2026 {AUTHOR_NAME}（{AUTHOR_NAME_CN}）· Master 系列软件
        </div>
      </div>
    </div>
  );
}
