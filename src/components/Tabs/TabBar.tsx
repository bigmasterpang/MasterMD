import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir, openPath as openWithSystem } from "@tauri-apps/plugin-opener";
import { Icon, type IconName } from "../common/Icon";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { useAppStore } from "../../stores/appStore";
import {
  closeDocWithConfirm,
  newDocument,
  reloadDocFromDisk,
  saveDoc,
  saveDocAs,
} from "../../utils/fileActions";
import { fileName } from "../../utils/filePath";
import type { DocState } from "../../types";

interface Props {
  pane?: 0 | 1;
}

interface ContextMenuState {
  x: number;
  y: number;
  doc: DocState;
}

/** 多标签页栏：按分栏渲染标签 + 右键菜单 + 拖拽移动/分栏 */
export function TabBar({ pane = 0 }: Props) {
  const docs = useAppStore((s) => s.docs);
  const activeIds = useAppStore((s) => s.activeIds);
  const activeId = useAppStore((s) => s.activeId);
  const layout = useAppStore((s) => s.layout);
  const gameOpen = useAppStore((s) => s.gameOpen);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [plusMenu, setPlusMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isBarDragOver, setIsBarDragOver] = useState(false);

  // 本栏中的文档
  const paneDocs = docs.filter((d) => (d.pane ?? 0) === pane);
  const paneActiveId = activeIds[pane] ?? (pane === layout.activePane ? activeId : null);

  // 单栏且文档 <= 1 且未开启江湖时隐藏标签栏以保持极简
  if (!layout.split && docs.length <= 1 && !gameOpen) return null;

  const getContextMenuGroups = (doc: DocState): ContextMenuItem[][] => {
    return [
      // 1. 关闭操作
      [
        {
          label: "关闭",
          hint: "Ctrl+W",
          onClick: () => void closeDocWithConfirm(doc.id),
        },
        {
          label: "关闭其他标签页",
          disabled: paneDocs.length <= 1,
          onClick: () => useAppStore.getState().closeOtherDocs(doc.id),
        },
        {
          label: "关闭右侧标签页",
          disabled: paneDocs[paneDocs.length - 1]?.id === doc.id,
          onClick: () => useAppStore.getState().closeRightDocs(doc.id),
        },
        {
          label: "关闭全部标签页",
          onClick: () => {
            const hasDirty = useAppStore.getState().docs.some((d) => d.isDirty);
            if (hasDirty) {
              void closeDocWithConfirm(doc.id);
            } else {
              useAppStore.getState().closeAllDocs();
            }
          },
        },
      ],
      // 2. 磁盘与复制
      [
        ...(doc.filePath
          ? [
              {
                label: "从磁盘重新加载",
                icon: "refresh" as IconName,
                onClick: () => void reloadDocFromDisk(doc.id),
              },
              {
                label: "复制完整路径",
                icon: "copy" as IconName,
                onClick: () => void navigator.clipboard.writeText(doc.filePath!),
              },
            ]
          : []),
        {
          label: "复制文件名",
          icon: "file-text" as IconName,
          onClick: () =>
            void navigator.clipboard.writeText(doc.filePath ? fileName(doc.filePath) : "未命名"),
        },
      ],
      // 3. 操作系统相关
      ...(doc.filePath
        ? [
            [
              {
                label: "在文件资源管理器中显示",
                icon: "folder-open" as IconName,
                onClick: () => void revealItemInDir(doc.filePath!),
              },
              {
                label: "用系统默认程序打开",
                icon: "external-link" as IconName,
                onClick: () => void openWithSystem(doc.filePath!),
              },
            ],
          ]
        : []),
      // 4. 分栏与新窗口
      [
        ...(pane === 0
          ? [
              {
                label: "移到右栏",
                icon: "columns" as IconName,
                onClick: () => useAppStore.getState().moveDocToPane(doc.id, 1),
              },
            ]
          : [
              {
                label: "移到左栏",
                icon: "columns" as IconName,
                onClick: () => useAppStore.getState().moveDocToPane(doc.id, 0),
              },
            ]),
        ...(doc.filePath
          ? [
              {
                label: "在新窗口中打开",
                icon: "external-link" as IconName,
                onClick: () => void invoke("open_in_new_window", { path: doc.filePath }),
              },
            ]
          : []),
      ],
      // 5. 保存
      ...(doc.isDirty || !doc.filePath
        ? [
            [
              {
                label: "保存",
                icon: "save" as IconName,
                hint: "Ctrl+S",
                onClick: () => void saveDoc(doc.id),
              },
              {
                label: "另存为…",
                icon: "save-as" as IconName,
                hint: "Ctrl+Shift+S",
                onClick: () => void saveDocAs(doc.id),
              },
            ],
          ]
        : [
            [
              {
                label: "另存为…",
                icon: "save-as" as IconName,
                hint: "Ctrl+Shift+S",
                onClick: () => void saveDocAs(doc.id),
              },
            ],
          ]),
    ];
  };

  const handleDragOverBar = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/mastermd-tab")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsBarDragOver(true);
    }
  };

  const handleDropOnBar = (e: React.DragEvent) => {
    setIsBarDragOver(false);
    setDragOverIndex(null);
    const raw = e.dataTransfer.getData("application/mastermd-tab");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { docId: string; fromPane: 0 | 1; fromIndex: number };
      if (data.fromPane !== pane) {
        useAppStore.getState().moveDocToPane(data.docId, pane);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="tablist"
      onDragOver={handleDragOverBar}
      onDragLeave={() => setIsBarDragOver(false)}
      onDrop={handleDropOnBar}
      className={`flex h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-app px-1.5 pt-0.5 transition-colors ${
        isBarDragOver ? "bg-accent/10" : ""
      }`}
    >
      {paneDocs.map((doc, index) => {
        const active = doc.id === paneActiveId && !gameOpen;
        const isDraggedOver = dragOverIndex === index;

        return (
          <div
            key={doc.id}
            role="tab"
            aria-selected={active}
            draggable
            title={doc.filePath ?? "未保存文档"}
            onClick={() => useAppStore.getState().activateDoc(doc.id, pane)}
            onAuxClick={(event) => {
              if (event.button === 1) void closeDocWithConfirm(doc.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ x: event.clientX, y: event.clientY, doc });
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/mastermd-tab",
                JSON.stringify({ docId: doc.id, fromPane: pane, fromIndex: index }),
              );
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setDragOverIndex(index);
            }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragOverIndex(null);
              const raw = event.dataTransfer.getData("application/mastermd-tab");
              if (!raw) return;
              try {
                const data = JSON.parse(raw) as {
                  docId: string;
                  fromPane: 0 | 1;
                  fromIndex: number;
                };
                if (data.fromPane === pane) {
                  useAppStore.getState().reorderDocs(pane, data.fromIndex, index);
                } else {
                  useAppStore.getState().moveDocToPane(data.docId, pane);
                }
              } catch {
                /* ignore */
              }
            }}
            className={`group relative flex max-w-[170px] shrink-0 cursor-pointer items-center gap-1 self-end rounded-t-md border border-b-0 px-2 py-1 text-[11.5px] transition-colors ${
              active
                ? "border-line bg-panel font-medium text-fg"
                : "border-line-strong/60 bg-hover text-fg/75 hover:bg-active hover:text-fg"
            } ${isDraggedOver ? "border-l-2 border-l-accent" : ""}`}
            style={active ? { boxShadow: "inset 0 2px 0 0 var(--accent)" } : undefined}
          >
            <Icon
              name={doc.filePath ? "file-text" : "file-plus"}
              size={12}
              className={active ? "text-accent" : "text-muted"}
            />
            <span className="truncate">{doc.filePath ? fileName(doc.filePath) : "未命名"}</span>
            {doc.isDirty ? (
              <span className="text-[10px] text-accent" title="有未保存的更改">
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
              <Icon name="x" size={11} />
            </button>
          </div>
        );
      })}

      {/* 江湖独立标签（固定挂在左栏） */}
      {pane === 0 && gameOpen ? (
        <div
          role="tab"
          aria-selected
          title="Markdown 江湖"
          className="group flex max-w-[170px] shrink-0 cursor-pointer items-center gap-1 self-end rounded-t-md border border-line border-b-0 bg-panel px-2 py-1 text-[11.5px] font-medium text-fg"
          style={{ boxShadow: "inset 0 2px 0 0 var(--accent)" }}
        >
          <Icon name="sword" size={12} className="text-accent" />
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
            <Icon name="x" size={11} />
          </button>
        </div>
      ) : null}

      {/* 新建标签按钮 */}
      <button
        type="button"
        title="新建文档 (点击选择类型)"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPlusMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
        className="ml-0.5 shrink-0 self-center rounded p-1 text-muted hover:bg-hover hover:text-fg"
      >
        <Icon name="plus" size={13} />
      </button>

      {/* 新建文档下拉菜单 */}
      {plusMenu ? (
        <ContextMenu
          x={plusMenu.x}
          y={plusMenu.y}
          groups={[
            [
              {
                label: "新建 Markdown 文档 (.md)",
                icon: "file-text",
                hint: "Ctrl+N",
                onClick: () => void newDocument("markdown"),
              },
              {
                label: "新建空白文档",
                icon: "file-plus",
                onClick: () => void newDocument("blank"),
              },
            ],
          ]}
          onClose={() => setPlusMenu(null)}
        />
      ) : null}

      {/* 右侧：双栏分屏切换按钮（在主栏或标签栏末尾展示） */}
      {pane === 0 ? (
        <button
          type="button"
          title={layout.split ? "关闭双栏 (Ctrl+\\)" : "双栏分屏 (Ctrl+\\)"}
          onClick={() => useAppStore.getState().toggleSplit()}
          className={`ml-auto shrink-0 self-center rounded-md p-1 transition-colors ${
            layout.split ? "bg-hover text-accent" : "text-muted hover:bg-hover hover:text-fg"
          }`}
        >
          <Icon name="columns" size={14} />
        </button>
      ) : null}

      {/* 右键菜单 */}
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={getContextMenuGroups(contextMenu.doc)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
