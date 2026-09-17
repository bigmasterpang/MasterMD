import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { TabBar } from "./components/Tabs/TabBar";
import { OutlineSidebar } from "./components/Outline/OutlineSidebar";
import { SearchBar } from "./components/SearchBar/SearchBar";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { SplitView } from "./components/Layout/SplitView";
import { MarkdownPreview } from "./components/Preview/MarkdownPreview";
import { CodeMirrorEditor } from "./components/Editor/CodeMirrorEditor";
import { SettingsModal } from "./components/Settings/SettingsModal";
import {
  ConfirmDialog,
  ConflictDialog,
  FormDialog,
  MessageDialog,
  UnsavedDialog,
} from "./components/Dialogs/Dialogs";
import { useMarkdown, type MarkdownResult } from "./hooks/useMarkdown";
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
import { askUnsaved } from "./stores/dialogStore";
import { UpdateDialog } from "./components/Dialogs/UpdateDialog";
import { useSettingsStore } from "./stores/settingsStore";
import {
  displayName,
  loadRecentFiles,
  openDroppedPaths,
  openPath,
  saveDoc,
} from "./utils/fileActions";
import { flushUiState, isTauri } from "./utils/persist";
import { REALTIME_PREVIEW_LIMIT } from "./utils/constants";

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
  const content = doc?.content ?? "";
  const rendered = useMarkdown(content, viewMode);

  const previewRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // 大文档手动刷新的快照
  const [snapshot, setSnapshot] = useState<MarkdownResult | null>(null);

  const lineCount = doc ? doc.content.split("\n").length : 0;
  const livePreview = content.length <= REALTIME_PREVIEW_LIMIT;
  const effective: MarkdownResult = livePreview && !snapshot ? rendered : snapshot ?? rendered;

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

  // 文档切换时清掉手动预览快照
  useEffect(() => {
    setSnapshot(null);
  }, [doc?.id]);

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
          const startup = await invoke<string | null>("get_startup_file");
          if (startup) await openPath(startup);
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

  const refreshPreview = () => {
    setSnapshot({
      html: rendered.html,
      headings: rendered.headings,
      frontMatter: rendered.frontMatter,
      frontMatterRaw: rendered.frontMatterRaw,
      hasMath: rendered.hasMath,
      hasMermaid: rendered.hasMermaid,
    });
  };

  const previewNode = (
    <MarkdownPreview      html={effective.html}
      hasMath={effective.hasMath}
      hasMermaid={effective.hasMermaid}
      isDark={isDark}
      scrollRef={previewRef}
    />
  );

  return (
    <div className="relative flex h-full flex-col bg-app text-fg">
      <Toolbar previewRef={previewRef} isDark={isDark} />
      <TabBar />

      <div className="flex min-h-0 flex-1">
        {doc && outlineVisible ? <OutlineSidebar previewRef={previewRef} /> : null}

        <div className="relative min-w-0 flex-1">
          {!doc ? (
            <WelcomeScreen />
          ) : viewMode === "preview" ? (
            livePreview ? (
              previewNode
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[12px] text-muted">
                <div>文档较大（{lineCount} 行），已关闭实时预览。</div>
                <button
                  type="button"
                  onClick={refreshPreview}
                  className="rounded-md border border-line bg-elevated px-3 py-1.5 text-fg hover:bg-hover"
                >
                  渲染预览
                </button>
              </div>
            )
          ) : viewMode === "source" ? (
            <CodeMirrorEditor key={doc.id} docId={doc.id} isDark={isDark} />
          ) : (
            <SplitView
              docId={doc.id}
              isDark={isDark}
              html={effective.html}
              hasMath={effective.hasMath}
              hasMermaid={effective.hasMermaid}
              lineCount={lineCount}
              previewRef={previewRef}
              livePreview={livePreview}
              onRefresh={refreshPreview}
            />
          )}

          {doc ? <SearchBar /> : null}
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
    </div>
  );
}

/** 关闭窗口前的确认流程：整理未保存文档后再销毁窗口 */async function handleCloseRequest(): Promise<void> {
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
