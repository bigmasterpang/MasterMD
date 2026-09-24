import { useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { useUpdateStore } from "../../stores/updateStore";
import { Icon } from "../common/Icon";
import { countWords, formatBytes } from "../../utils/timing";
import { APP_NAME } from "../../utils/constants";
import { fileName } from "../../utils/filePath";
import { extractFrontMatter } from "../../utils/frontMatter";

const VIEW_LABEL = {
  preview: "预览",
  source: "源码",
  split: "分屏",
} as const;

/** 原始字数：源码中的字符数（不含空白），预览字数：渲染后可见字符数 */
function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function StatusBar() {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);
  const updateInfo = useUpdateStore((s) => s.info);

  const stats = useMemo(() => {
    const content = doc?.content ?? "";
    const rawChars = countChars(content);
    const words = countWords(content);
    const lines = content ? content.split("\n").length : 0;
    // 预览字数：去掉 front matter 与 Markdown 语法标记后的可见字符数
    const { body } = extractFrontMatter(content);
    const previewText = body
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, ""))
      .replace(/`[^`\n]*`/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/^[ \t]*[-*+][ \t]+/gm, "")
      .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
      .replace(/[*_~^]/g, "")
      .replace(/!\[[^\]]*\]/g, "");
    return {
      rawChars,
      previewChars: countChars(previewText),
      words,
      lines,
    };
  }, [doc?.content]);

  const bytes = useMemo(
    () => (doc ? new TextEncoder().encode(doc.content).length : 0),
    [doc?.content],
  );

  return (
    <div className="print-hide flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11px] text-muted">
      <span className="flex min-w-0 items-center gap-1">
        {doc?.isDirty ? <span className="text-accent">●</span> : null}
        <span className="truncate" title={doc?.filePath ?? "未保存"}>
          {doc ? (doc.filePath ? fileName(doc.filePath) : "未命名文档") : APP_NAME}
        </span>
      </span>

      <div className="flex-1" />

      {updateInfo?.hasUpdate ? (
        <button
          type="button"
          onClick={() => useUpdateStore.getState().showDialog()}
          className="flex items-center gap-1 text-accent hover:underline"
          title="发现新版本，点击查看详情"
        >
          <Icon name="download" size={12} />
          发现新版本 {updateInfo.latest}
        </button>
      ) : null}

      {doc ? (
        <>
          <span title="光标位置">
            行 {doc.cursorLine}, 列 {doc.cursorCol}
          </span>
          {doc.selectionLength > 0 ? (
            <span title="已选中字符数">选中 {doc.selectionLength}</span>
          ) : null}
          <span title="原始字数：Markdown 源码字符数（不含空白）">
            原始字数 {stats.rawChars}
          </span>
          <span title="预览字数：渲染后可见字符数（不含空白）">
            预览字数 {stats.previewChars}
          </span>
          <span title="词数（中文按字、西文按词）">词数 {stats.words}</span>
          <span className="hidden sm:inline" title="总行数">
            {stats.lines} 行
          </span>
          <span title="文件大小">{doc.size > 0 ? formatBytes(doc.size) : formatBytes(bytes)}</span>
        </>
      ) : (
        <span>就绪</span>
      )}

      <span title="编码">UTF-8</span>
      {doc?.encrypted ? (
        <span
          className="flex items-center gap-1 text-accent"
          title="企业加密文档：已自动解密，保存时按原加密格式写回"
        >
          <Icon name="key" size={11} />
          已解密
        </span>
      ) : null}
      {doc?.readOnly ? <span className="text-warning">只读</span> : null}
      <span title="当前视图模式">{VIEW_LABEL[viewMode]}</span>
    </div>
  );
}
