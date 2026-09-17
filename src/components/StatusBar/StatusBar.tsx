import { useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { countWords, formatBytes } from "../../utils/timing";
import { fileName } from "../../utils/filePath";

const VIEW_LABEL = {
  preview: "预览",
  source: "源码",
  split: "分屏",
} as const;

export function StatusBar() {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);

  const words = useMemo(() => countWords(doc?.content ?? ""), [doc?.content]);
  const lines = useMemo(() => (doc?.content ? doc.content.split("\n").length : 0), [doc?.content]);

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11px] text-muted">
      <span className="flex min-w-0 items-center gap-1">
        {doc?.isDirty ? <span className="text-accent">●</span> : null}
        <span className="truncate" title={doc?.filePath ?? "未保存"}>
          {doc ? (doc.filePath ? fileName(doc.filePath) : "未命名文档") : "mdview"}
        </span>
      </span>

      <div className="flex-1" />

      {doc ? (
        <>
          <span title="光标位置">行 {doc.cursorLine}, 列 {doc.cursorCol}</span>
          {doc.selectionLength > 0 ? (
            <span title="已选中字符数">选中 {doc.selectionLength}</span>
          ) : null}
          <span title="字数统计">{words} 字</span>
          <span className="hidden sm:inline" title="总行数">
            {lines} 行
          </span>
          <span title="文件大小">
            {doc.size > 0 ? formatBytes(doc.size) : formatBytes(new TextEncoder().encode(doc.content).length)}
          </span>
        </>
      ) : (
        <span>就绪</span>
      )}

      <span title="编码">UTF-8</span>
      {doc?.readOnly ? <span className="text-warning">只读</span> : null}
      <span title="当前视图模式">{VIEW_LABEL[viewMode]}</span>
    </div>
  );
}
