import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { closeDocWithConfirm, newDocument } from "../../utils/fileActions";
import { fileName } from "../../utils/filePath";

/** 多标签页栏：仅在打开多个文档时显示（单文档时隐藏以保持界面简洁） */
export function TabBar() {
  const docs = useAppStore((s) => s.docs);
  const activeId = useAppStore((s) => s.activeId);

  if (docs.length <= 1) return null;

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-app px-1">
      {docs.map((doc) => {
        const active = doc.id === activeId;
        return (
          <div
            key={doc.id}
            role="tab"
            aria-selected={active}
            title={doc.filePath ?? "未保存文档"}
            onClick={() => useAppStore.getState().activateDoc(doc.id)}
            onAuxClick={(event) => {
              if (event.button === 1) void closeDocWithConfirm(doc.id);
            }}
            className={`group flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 self-center rounded-md px-2.5 py-1 text-[12px] transition-colors ${
              active
                ? "bg-panel text-fg shadow-[var(--shadow-sm)]"
                : "text-muted hover:bg-hover"
            }`}
          >
            <Icon
              name={doc.filePath ? "file-text" : "file-plus"}
              size={13}
              className={active ? "text-accent" : "text-faint"}
            />
            <span className="truncate">{doc.filePath ? fileName(doc.filePath) : "未命名"}</span>
            {doc.isDirty ? <span className="text-accent">●</span> : null}
            <button
              type="button"
              title="关闭标签 (Ctrl+W)"
              onClick={(event) => {
                event.stopPropagation();
                void closeDocWithConfirm(doc.id);
              }}
              className="rounded p-0.5 text-faint opacity-0 transition-opacity hover:bg-active hover:text-fg group-hover:opacity-100"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        title="新建文档 (Ctrl+N)"
        onClick={() => void newDocument()}
        className="ml-1 shrink-0 self-center rounded-md p-1 text-muted hover:bg-hover hover:text-fg"
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
