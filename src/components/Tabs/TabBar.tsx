import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { closeDocWithConfirm, newDocument } from "../../utils/fileActions";
import { fileName } from "../../utils/filePath";

/** 多标签页栏：文档标签 + 可选的「江湖」标签（游戏以独立标签页打开） */
export function TabBar() {
  const docs = useAppStore((s) => s.docs);
  const activeId = useAppStore((s) => s.activeId);
  const gameOpen = useAppStore((s) => s.gameOpen);

  if (docs.length <= 1 && !gameOpen) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-line bg-app px-2 pt-1">
      {docs.map((doc) => {
        const active = doc.id === activeId && !gameOpen;
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
            className={`group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 self-end rounded-t-md border border-b-0 px-2.5 py-1.5 text-[12px] transition-colors ${
              active
                ? "border-line bg-panel font-medium text-fg"
                : "border-line-strong/60 bg-hover text-fg/75 hover:bg-active hover:text-fg"
            }`}
            style={
              active
                ? { boxShadow: "inset 0 2px 0 0 var(--accent)" }
                : undefined
            }
          >
            <Icon
              name={doc.filePath ? "file-text" : "file-plus"}
              size={13}
              className={active ? "text-accent" : "text-muted"}
            />
            <span className="truncate">{doc.filePath ? fileName(doc.filePath) : "未命名"}</span>
            {doc.isDirty ? (
              <span className="text-accent" title="有未保存的更改">
                ●
              </span>
            ) : null}
            <button
              type="button"
              title="关闭标签 (Ctrl+W)"
              onClick={(event) => {
                event.stopPropagation();
                void closeDocWithConfirm(doc.id);
              }}
              className={`rounded p-0.5 transition-colors hover:bg-active hover:text-fg ${
                active ? "text-muted" : "text-muted/70"
              }`}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}

      {gameOpen ? (
        <div
          role="tab"
          aria-selected
          title="Markdown 江湖"
          className="group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 self-end rounded-t-md border border-line border-b-0 bg-panel px-2.5 py-1.5 text-[12px] font-medium text-fg"
          style={{ boxShadow: "inset 0 2px 0 0 var(--accent)" }}
        >
          <Icon name="sword" size={13} className="text-accent" />
          <span className="truncate">江湖</span>
          <button
            type="button"
            title="关闭标签"
            onClick={(event) => {
              event.stopPropagation();
              useAppStore.getState().closeGame();
            }}
            className="rounded p-0.5 text-muted transition-colors hover:bg-active hover:text-fg"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : null}

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
