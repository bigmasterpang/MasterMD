import type { ReactNode } from "react";
import { Icon, type IconName } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { useDialogStore } from "../../stores/dialogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ThemeMode, ViewMode } from "../../types";
import {
  getEditor,
} from "../../utils/editorBridge";
import {
  exportHtmlFile,
} from "../../utils/exportHtml";
import {
  newDocument,
  openFileDialog,
  saveActive,
  saveActiveAs,
} from "../../utils/fileActions";
import { fileName } from "../../utils/filePath";
import { showMessage } from "../../stores/dialogStore";

interface ToolbarProps {
  previewRef: React.RefObject<HTMLDivElement | null>;
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  icon?: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-accent-soft text-accent"
          : "text-muted hover:bg-hover hover:text-fg"
      }`}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
    </button>
  );
}

const VIEW_ITEMS: Array<{ mode: ViewMode; icon: IconName; label: string }> = [
  { mode: "preview", icon: "eye", label: "预览模式 (Ctrl+E)" },
  { mode: "source", icon: "code", label: "源码模式 (Ctrl+E)" },
  { mode: "split", icon: "columns", label: "分屏模式 (Ctrl+E)" },
];

const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];
const THEME_META: Record<ThemeMode, { icon: IconName; label: string }> = {
  light: { icon: "sun", label: "浅色主题" },
  dark: { icon: "moon", label: "深色主题" },
  system: { icon: "monitor", label: "跟随系统" },
};

export function Toolbar({ previewRef }: ToolbarProps) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
  const viewMode = useAppStore((s) => s.viewMode);
  const outlineVisible = useAppStore((s) => s.outlineVisible);
  const syncScroll = useAppStore((s) => s.syncScroll);
  const searchVisible = useAppStore((s) => s.searchVisible);
  const theme = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.set);

  const hasDoc = Boolean(doc);
  const editable = viewMode !== "preview" && Boolean(doc) && !doc?.readOnly;

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setSetting("theme", THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  const handleExport = async () => {
    if (!previewRef.current) {
      await showMessage(
        "无法导出",
        "导出 HTML 需要预览内容，请切换到预览或分屏模式后重试。",
      );
      return;
    }
    const name = doc?.filePath ? fileName(doc.filePath) : "未命名";
    await exportHtmlFile({
      title: name.replace(/\.(md|markdown|mdown|txt)$/i, ""),
      source: previewRef.current,
      inlineImages: true,
    });
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <ToolButton icon="file-plus" label="新建 (Ctrl+N)" onClick={() => void newDocument()} />
      <ToolButton icon="folder-open" label="打开 (Ctrl+O)" onClick={() => void openFileDialog()} />
      <ToolButton
        icon="save"
        label="保存 (Ctrl+S)"
        disabled={!hasDoc}
        onClick={() => void saveActive()}
      />
      <ToolButton
        icon="save-as"
        label="另存为 (Ctrl+Shift+S)"
        disabled={!hasDoc}
        onClick={() => void saveActiveAs()}
      />

      <Divider />

      <div className="flex items-center gap-0.5 rounded-md bg-app p-0.5">
        {VIEW_ITEMS.map((item) => (
          <ToolButton
            key={item.mode}
            icon={item.icon}
            label={item.label}
            active={viewMode === item.mode}
            disabled={!hasDoc}
            onClick={() => useAppStore.getState().setViewMode(item.mode)}
          />
        ))}
      </div>

      <Divider />

      <ToolButton
        icon="bold"
        label="粗体 (Ctrl+B)"
        disabled={!editable}
        onClick={() => getEditor()?.wrapSelection("**", "**", "粗体")}
      />
      <ToolButton
        icon="italic"
        label="斜体 (Ctrl+I)"
        disabled={!editable}
        onClick={() => getEditor()?.wrapSelection("*", "*", "斜体")}
      />
      <ToolButton
        icon="link"
        label="插入链接 (Ctrl+K)"
        disabled={!editable}
        onClick={() => getEditor()?.wrapSelection("[", "](https://)", "链接文字")}
      />

      <Divider />

      <ToolButton
        icon="search"
        label="搜索 (Ctrl+F)"
        disabled={!hasDoc}
        active={searchVisible}
        onClick={() => useAppStore.getState().setSearchVisible(true)}
      />
      <ToolButton
        icon="list"
        label="大纲侧栏"
        active={outlineVisible}
        onClick={() => useAppStore.getState().toggleOutline()}
      />
      {viewMode === "split" ? (
        <ToolButton
          icon="refresh"
          label={syncScroll ? "滚动同步：开" : "滚动同步：关"}
          active={syncScroll}
          onClick={() => useAppStore.getState().toggleSyncScroll()}
        />
      ) : null}

      <div className="flex-1" />

      <ToolButton icon="download" label="导出 HTML" disabled={!hasDoc} onClick={() => void handleExport()} />
      <ToolButton
        icon={THEME_META[theme].icon}
        label={`${THEME_META[theme].label}（点击切换）`}
        onClick={cycleTheme}
      />
      <ToolButton
        icon="settings"
        label="设置 (Ctrl+,)"
        onClick={() => useDialogStore.getState().setSettingsVisible(true)}
      />
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-line" />;
}
