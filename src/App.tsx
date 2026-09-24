import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { TabBar } from "./components/Tabs/TabBar";
import { SidebarContainer } from "./components/Sidebar/SidebarContainer";
import { DocView } from "./components/Layout/DocView";
import { SettingsModal } from "./components/Settings/SettingsModal";
import {
  ConfirmDialog,
  ConflictDialog,
  FormDialog,
  MessageDialog,
  UnsavedDialog,
} from "./components/Dialogs/Dialogs";
import { useMarkdown } from "./hooks/useMarkdown";
import { useTheme } from "./hooks/useTheme";
import {
  useDirtyFlagSync,
  useKeyboardShortcuts,
  useWindowTitle,
} from "./hooks/useKeyboardShortcuts";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { useAutoSave } from "./hooks/useAutoSave";
import { useAppStore } from "./stores/appStore";
import { useSearchStore } from "./stores/searchStore";
import { useUpdateStore } from "./stores/updateStore";
import { useExplorerStore } from "./stores/explorerStore";
import { askUnsaved } from "./stores/dialogStore";
import { UpdateDialog } from "./components/Dialogs/UpdateDialog";
import { ShortcutsDialog } from "./components/Dialogs/ShortcutsDialog";
import { AboutDialog } from "./components/Dialogs/AboutDialog";
import { DungeonDialog } from "./components/Dialogs/DungeonDialog";
// 江湖玩法体积不小，按需加载（不打开就不下载）
const WuxiaPanel = lazy(() =>
  import("./wuxia/ui/WuxiaPanel").then((m) => ({ default: m.WuxiaPanel })),
);
import { useSettingsStore } from "./stores/settingsStore";
import { displayName, loadRecentFiles, openDroppedPaths, openPath, saveDoc } from "./utils/fileActions";
import { isMarkdownPath } from "./utils/filePath";
import { flushUiState, isTauri, restoreSession, startSessionTracking } from "./utils/persist";

let startupHandled = false;

export default function App() {
  const isDark = useTheme();
  useKeyboardShortcuts();
  useWindowTitle();
  useDirtyFlagSync();
  useFileWatcher();
  useAutoSave();

  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);
  const outlineVisible = useAppStore((s) => s.outlineVisible);
  const gameOpen = useAppStore((s) => s.gameOpen);
  const content = doc?.content ?? "";
  /** 非 Markdown 文件（代码/纯文本）只提供源码编辑 */
  const isMarkdown = !doc?.filePath || isMarkdownPath(doc.filePath);
  const rendered = useMarkdown(isMarkdown ? content : "", viewMode);

  const previewRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const layout = useAppStore((s) => s.layout);
  const activeIds = useAppStore((s) => s.activeIds);
  const activeId = useAppStore((s) => s.activeId);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const handleSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const width = rect.width;
      if (width <= 0) return;
      const ratio = (moveEvent.clientX - rect.left) / width;
      useAppStore.getState().setPaneRatio(ratio);
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  /* ------------------ 大纲与元数据同步到 store ------------------ */
  const headings = rendered.headings;
  useEffect(() => {
    if (!doc) return;
    useAppStore.getState().setHeadings(headings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headings, doc?.id]);

  /* ------------------ 搜索匹配随内容变化重算 ------------------ */
  useEffect(() => {
    if (!useSearchStore.getState().visible) return;
    useSearchStore.getState().recompute(false);
  }, [content, doc?.id]);

  const frontMatter = rendered.frontMatter;
  const frontMatterRaw = rendered.frontMatterRaw;
  useEffect(() => {
    if (!doc) return;
    useAppStore.getState().patchActive({ frontMatter, frontMatterRaw });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontMatter, frontMatterRaw, doc?.id]);

  // 文档切换时同步所在目录（或绑定的工作区）到文件树
  useEffect(() => {
    if (doc) {
      void useExplorerStore.getState().syncToDoc(doc);
    }
  }, [doc?.id, doc?.filePath]);

  /* ------------------ 启动流程 ------------------ */
  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      await loadRecentFiles();

      if (!startupHandled) {
        startupHandled = true;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const openParam = urlParams.get("open");
          if (openParam) {
            await openPath(openParam);
          } else {
            const startup = await invoke<string | null>("get_startup_file");
            if (startup) {
              await openPath(startup);
            } else {
              // 无启动文件时恢复上次会话（防止意外重载丢失内容）
              await restoreSession();
            }
            startSessionTracking();
          }
        } catch (error) {
          console.error("打开启动文件失败", error);
        }
      }

      // 拖放打开
      try {
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setDragOver(true);
          } else if (payload.type === "drop") {
            setDragOver(false);
            void openDroppedPaths(payload.paths);
          } else {
            setDragOver(false);
          }
        });
        cleanups.push(unlisten);
      } catch (error) {
        console.error("注册拖放监听失败", error);
      }

      // 关闭窗口前的未保存确认
      try {
        const unlisten = await listen("close-requested", () => {
          void handleCloseRequest();
        });
        cleanups.push(unlisten);
      } catch (error) {
        console.error("注册关闭监听失败", error);
      }

      // 启动后自动检查更新（可在设置中关闭）
      if (useSettingsStore.getState().autoCheckUpdate) {
        window.setTimeout(() => {
          void useUpdateStore.getState().check({ silent: true });
        }, 2500);
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      void disposed;
    };
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-app text-fg">
      <Toolbar previewRef={previewRef} isDark={isDark} />

      <div className="flex min-h-0 flex-1">
        {outlineVisible && !gameOpen ? (
          <SidebarContainer previewRef={previewRef} />
        ) : null}

        <div className="relative min-w-0 flex-1 overflow-hidden">
          {gameOpen ? (
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
              <TabBar pane={0} />
              <div className="min-h-0 flex-1 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-[12px] text-muted">
                      正在展开江湖……
                    </div>
                  }
                >
                  <WuxiaPanel />
                </Suspense>
              </div>
            </div>
          ) : layout.split ? (
            <div ref={splitContainerRef} className="flex h-full min-w-0 flex-1 overflow-hidden">
              <div style={{ width: `${Math.round(layout.ratio * 100)}%` }} className="h-full min-w-0 overflow-hidden">
                <DocView docId={activeIds[0]} pane={0} isDark={isDark} previewRef={previewRef} />
              </div>
              <div
                onMouseDown={handleSplitResize}
                className="group relative flex w-1.5 cursor-col-resize shrink-0 items-center justify-center border-x border-line/60 bg-app hover:bg-accent/40"
              >
                <div className="h-8 w-0.5 rounded-full bg-line group-hover:bg-accent" />
              </div>
              <div style={{ width: `${100 - Math.round(layout.ratio * 100)}%` }} className="h-full min-w-0 overflow-hidden">
                <DocView docId={activeIds[1]} pane={1} isDark={isDark} previewRef={previewRef} />
              </div>
            </div>
          ) : (
            <DocView docId={activeIds[0] ?? activeId} pane={0} isDark={isDark} previewRef={previewRef} />
          )}
        </div>
      </div>

      <StatusBar />

      {dragOver ? (
        <div className="drop-overlay">
          <div className="rounded-[var(--radius)] bg-elevated px-6 py-4 shadow-[var(--shadow)]">
            松开以打开 Markdown 文件
          </div>
        </div>
      ) : null}

      <SettingsModal />
      <UnsavedDialog />
      <ConflictDialog />
      <ConfirmDialog />
      <MessageDialog />
      <FormDialog />
      <UpdateDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <DungeonDialog />
    </div>
  );
}

/** 关闭窗口前的确认流程：整理未保存文档后再销毁窗口 */
async function handleCloseRequest(): Promise<void> {
  const docs = [...useAppStore.getState().docs];
  for (const doc of docs) {
    if (!doc.isDirty) continue;
    const choice = await askUnsaved(displayName(doc));
    if (choice === "cancel") return;
    if (choice === "save") {
      const ok = await saveDoc(doc.id);
      if (!ok) return;
    }
  }
  await flushUiState();
  try {
    await invoke("confirm_close");
  } catch (error) {
    console.error("关闭窗口失败", error);
  }
}
