import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openPath as openWithSystem } from "@tauri-apps/plugin-opener";
import { Icon, type IconName } from "../common/Icon";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { useExplorerStore, parentPath, type DirEntry } from "../../stores/explorerStore";
import { useAppStore } from "../../stores/appStore";
import { openPath } from "../../utils/fileActions";
import { fileName, isOpenablePath, isMarkdownPath, samePath } from "../../utils/filePath";

interface ContextMenuState {
  x: number;
  y: number;
  entry: DirEntry;
}

export function FileTree() {
  const rootPath = useExplorerStore((s) => s.rootPath);
  const children = useExplorerStore((s) => s.children);
  const loading = useExplorerStore((s) => s.loading);
  const expanded = useExplorerStore((s) => s.expanded);
  const filter = useExplorerStore((s) => s.filter);
  const showHidden = useExplorerStore((s) => s.showHidden);

  const toggleDir = useExplorerStore((s) => s.toggleDir);
  const expandTo = useExplorerStore((s) => s.expandTo);
  const refresh = useExplorerStore((s) => s.refresh);
  const setRoot = useExplorerStore((s) => s.setRoot);
  const setFilter = useExplorerStore((s) => s.setFilter);
  const setShowHidden = useExplorerStore((s) => s.setShowHidden);

  const activeFilePath = useAppStore(
    (s) => s.docs.find((d) => d.id === s.activeId)?.filePath ?? null,
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handlePickRoot = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        const activeId = useAppStore.getState().activeId;
        if (activeId) {
          useExplorerStore.getState().bindDocRoot(activeId, selected);
        }
        await setRoot(selected);
      }
    } catch (error) {
      console.error("选择根目录失败", error);
    }
  };

  const handleGoParent = async () => {
    if (!rootPath) return;
    try {
      const parent = await invoke<string | null>("parent_dir_of", { path: rootPath });
      if (parent) {
        const activeId = useAppStore.getState().activeId;
        if (activeId) {
          useExplorerStore.getState().bindDocRoot(activeId, parent);
        }
        await setRoot(parent);
      }
    } catch (error) {
      console.error("取上级目录失败", error);
    }
  };

  const handleLocateCurrent = async () => {
    if (!activeFilePath) return;
    await expandTo(activeFilePath);
  };

  const handleReturnToDocFolder = async () => {
    if (!activeFilePath) return;
    const dir = parentPath(activeFilePath);
    if (!dir) return;
    const activeId = useAppStore.getState().activeId;
    if (activeId) {
      useExplorerStore.getState().bindDocRoot(activeId, dir);
    }
    await setRoot(dir);
    await expandTo(activeFilePath);
  };

  const getFileIcon = (entry: DirEntry): IconName => {
    if (entry.isDir) {
      return expanded[entry.path] ? "folder-open" : "folder";
    }
    if (isMarkdownPath(entry.path)) return "file-text";
    return "code";
  };

  const getContextMenuGroups = (entry: DirEntry): ContextMenuItem[][] => {
    return [
      [
        {
          label: entry.isDir ? "在资源管理器中打开" : "定位文件所在位置",
          icon: "folder-open",
          onClick: () => void revealItemInDir(entry.path),
        },
        ...(!entry.isDir
          ? [
              {
                label: "用系统默认程序打开",
                icon: "external-link" as IconName,
                onClick: () => void openWithSystem(entry.path),
              },
            ]
          : []),
      ],
      [
        {
          label: "复制完整路径",
          icon: "copy",
          onClick: () => void navigator.clipboard.writeText(entry.path),
        },
        {
          label: "复制名称",
          icon: "file-text",
          onClick: () => void navigator.clipboard.writeText(entry.name),
        },
      ],
      ...(entry.isDir
        ? [
            [
              {
                label: "设为文件树根目录",
                icon: "folder" as IconName,
                onClick: () => {
                  const activeId = useAppStore.getState().activeId;
                  if (activeId) {
                    useExplorerStore.getState().bindDocRoot(activeId, entry.path);
                  }
                  void setRoot(entry.path);
                },
              },
            ],
          ]
        : []),
    ];
  };

  const renderEntries = (dirPath: string, depth = 0) => {
    const list = children[dirPath];
    if (loading[dirPath]) {
      return (
        <div
          className="flex items-center gap-1.5 py-1 text-[11px] text-faint"
          style={{ paddingLeft: depth * 14 + 18 }}
        >
          <Icon name="loader" size={12} className="animate-spin" />
          <span>正在加载…</span>
        </div>
      );
    }

    if (!list || list.length === 0) {
      return (
        <div
          className="py-1 text-[11px] text-faint"
          style={{ paddingLeft: depth * 14 + 18 }}
        >
          （空目录）
        </div>
      );
    }

    // 过滤项
    const visibleEntries =
      filter === "openable"
        ? list.filter((e) => e.isDir || isOpenablePath(e.path))
        : list;

    return visibleEntries.map((entry) => {
      const isDir = entry.isDir;
      const isExpanded = Boolean(expanded[entry.path]);
      const isActive = !isDir && Boolean(activeFilePath && samePath(entry.path, activeFilePath));

      return (
        <div key={entry.path} className="select-none">
          <div
            className={`group flex cursor-pointer items-center gap-1 rounded py-[2px] pr-1.5 text-[12px] transition-colors ${
              isActive
                ? "bg-accent-soft-strong font-medium text-accent"
                : "text-muted hover:bg-hover hover:text-fg"
            }`}
            style={{ paddingLeft: depth * 14 + 6 }}
            title={entry.path}
            onClick={() => {
              if (isDir) {
                void toggleDir(entry.path);
              } else {
                void openPath(entry.path);
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && !isDir) void openPath(entry.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, entry });
            }}
          >
            {isDir ? (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-faint group-hover:text-muted">
                <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={11} />
              </span>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <Icon
              name={getFileIcon(entry)}
              size={13}
              className={`shrink-0 ${
                isDir
                  ? "text-amber-500/80"
                  : isMarkdownPath(entry.path)
                    ? "text-accent"
                    : "text-muted"
              }`}
            />
            <span className="truncate">{entry.name}</span>
          </div>

          {isDir && isExpanded ? renderEntries(entry.path, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
      {/* 顶部工具栏 */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2 text-[11px] text-faint">
        <span className="truncate font-medium uppercase tracking-wide text-fg/80" title={rootPath ?? ""}>
          {rootPath ? fileName(rootPath) : "文件"}
        </span>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="回到标签所在文件夹"
            disabled={!activeFilePath}
            onClick={() => void handleReturnToDocFolder()}
            className="rounded p-1 hover:bg-hover hover:text-fg disabled:opacity-30"
          >
            <Icon name="folder-symlink" size={12} />
          </button>
          <button
            type="button"
            title="定位当前文档"
            disabled={!activeFilePath}
            onClick={() => void handleLocateCurrent()}
            className="rounded p-1 hover:bg-hover hover:text-fg disabled:opacity-30"
          >
            <Icon name="search" size={12} />
          </button>
          <button
            type="button"
            title="上一级目录"
            onClick={() => void handleGoParent()}
            className="rounded p-1 hover:bg-hover hover:text-fg"
          >
            <Icon name="arrow-up" size={12} />
          </button>
          <button
            type="button"
            title="选择工作区文件夹"
            onClick={() => void handlePickRoot()}
            className="rounded p-1 hover:bg-hover hover:text-fg"
          >
            <Icon name="folder-open" size={12} />
          </button>
          <button
            type="button"
            title="刷新目录"
            onClick={() => void refresh()}
            className="rounded p-1 hover:bg-hover hover:text-fg"
          >
            <Icon name="refresh" size={12} />
          </button>
          <button
            type="button"
            title={filter === "openable" ? "显示全部文件" : "仅显示可打开文档"}
            onClick={() => setFilter(filter === "openable" ? "all" : "openable")}
            className={`rounded p-1 hover:bg-hover ${
              filter === "openable" ? "text-accent" : "hover:text-fg"
            }`}
          >
            <Icon name="filter" size={12} />
          </button>
          <button
            type="button"
            title={showHidden ? "隐藏点文件" : "显示隐藏文件"}
            onClick={() => setShowHidden(!showHidden)}
            className={`rounded p-1 hover:bg-hover ${
              showHidden ? "text-accent" : "hover:text-fg"
            }`}
          >
            <Icon name="eye" size={12} />
          </button>
        </div>
      </div>

      {/* 文件列表区域 */}
      <div className="min-h-0 flex-1 overflow-auto px-1 py-1 font-sans">
        {rootPath ? (
          renderEntries(rootPath, 0)
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-muted">
            <div>尚未打开文件夹</div>
            <button
              type="button"
              onClick={() => void handlePickRoot()}
              className="rounded-md border border-line bg-elevated px-2.5 py-1 text-fg hover:bg-hover"
            >
              打开文件夹…
            </button>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={getContextMenuGroups(contextMenu.entry)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
