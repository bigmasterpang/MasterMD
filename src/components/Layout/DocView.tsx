import { useState, useRef } from "react";
import { TabBar } from "../Tabs/TabBar";
import { MarkdownPreview } from "../Preview/MarkdownPreview";
import { CodeMirrorEditor } from "../Editor/CodeMirrorEditor";
import { SplitView } from "./SplitView";
import { WelcomeScreen } from "../Welcome/WelcomeScreen";
import { SearchBar } from "../SearchBar/SearchBar";
import { Icon } from "../common/Icon";
import { useMarkdown, type MarkdownResult } from "../../hooks/useMarkdown";
import { useAppStore } from "../../stores/appStore";
import { isMarkdownDoc } from "../../utils/filePath";
import { REALTIME_PREVIEW_LIMIT } from "../../utils/constants";
import { useTabDragStore } from "../../stores/tabDragStore";

interface DocViewProps {
  docId: string | null;
  pane: 0 | 1;
  isDark: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
}

export function DocView({ docId, pane, isDark, previewRef }: DocViewProps) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);
  const layout = useAppStore((s) => s.layout);
  const activePane = layout.activePane;
  const dragStore = useTabDragStore();

  const content = doc?.content ?? "";
  const isMarkdown = isMarkdownDoc(doc);
  const rendered = useMarkdown(isMarkdown ? content : "", viewMode);
  const lineCount = doc ? doc.content.split("\n").length : 0;
  const livePreview = content.length <= REALTIME_PREVIEW_LIMIT;

  const [snapshot, setSnapshot] = useState<MarkdownResult | null>(null);
  const effective: MarkdownResult = livePreview && !snapshot ? rendered : snapshot ?? rendered;

  // 拖动标签放置区状态
  const viewRef = useRef<HTMLDivElement>(null);
  const [dropZone, setDropZone] = useState<"left" | "right" | null>(null);

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

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/mastermd-tab")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (layout.split) {
      // 双栏开启时，拖入当前栏即代表移动到当前栏
      setDropZone(pane === 0 ? "left" : "right");
    } else {
      // 单栏模式：拖到右半屏触发分栏
      const node = viewRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      if (relX > rect.width * 0.5) {
        setDropZone("right");
      } else {
        setDropZone(null);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropZone(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    const zone = dropZone;
    setDropZone(null);
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/mastermd-tab");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { docId: string; fromPane: 0 | 1 };
      const targetPane = layout.split ? pane : (zone === "right" ? 1 : 0);
      useAppStore.getState().moveDocToPane(data.docId, targetPane);
    } catch {
      /* ignore */
    }
  };

  const previewNode = (
    <MarkdownPreview
      html={effective.html}
      hasMath={effective.hasMath}
      hasMermaid={effective.hasMermaid}
      isDark={isDark}
      scrollRef={previewRef}
    />
  );

  return (
    <div
      ref={viewRef}
      data-pane-viewport={pane}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (activePane !== pane) {
          useAppStore.getState().setActivePane(pane);
        }
      }}
      className={`relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-app ${
        activePane === pane && layout.split ? "ring-1 ring-inset ring-accent/30" : ""
      }`}
    >
      {/* 标签栏 */}
      <TabBar pane={pane} />

      {/* 文档视口内容 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!doc ? (
          pane === 0 ? (
            <WelcomeScreen />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted">
              <Icon name="columns" size={32} className="opacity-40" />
              <div className="text-[13px] font-medium text-fg/80">右侧分栏</div>
              <div className="max-w-[280px] text-[12px] leading-relaxed text-faint">
                拖拽标签到此区域形成双栏，或在左栏标签右键选择「移到右栏」。
              </div>
            </div>
          )
        ) : !isMarkdown ? (
          <CodeMirrorEditor key={doc.id} docId={doc.id} isDark={isDark} />
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

        {/* 查找替换浮层（仅在当前获得焦点的分栏中激活） */}
        {doc && activePane === pane ? <SearchBar /> : null}
      </div>

      {/* 拖动标签分栏提示区 */}
      {(dropZone || (dragStore.isDragging && dragStore.targetPane === pane && dragStore.fromPane !== pane)) ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 inset-0 z-50 flex items-center justify-center border-2 border-dashed border-accent bg-accent/15 backdrop-blur-[1px] transition-all"
        >
          <div className="flex items-center gap-2 rounded-lg bg-elevated/95 px-4 py-2 text-[13px] font-semibold text-accent shadow-lg border border-accent/40">
            <Icon name="columns" size={16} />
            <span>
              {layout.split
                ? pane === 0 ? "移到左栏" : "移到右栏"
                : "移到右栏 (双栏并排)"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
