/** 视图模式：预览 / 源码 / 分屏 */
export type ViewMode = "preview" | "source" | "split";

/** 主题模式 */
export type ThemeMode = "light" | "dark" | "system";

/** 配色方案 */
export type AccentName = "blue" | "violet" | "emerald" | "amber" | "rose";

/** 后端 read_markdown_file 返回 */
export interface FilePayload {
  path: string;
  content: string;
  modifiedAt: number;
  size: number;
}

/** 后端 file-changed 事件载荷 */
export interface FileChangedPayload {
  path: string;
  exists: boolean;
  modifiedAt: number;
  size: number;
}

/** 大纲条目 */
export interface HeadingItem {
  level: number;
  text: string;
  id: string;
  /** 在源码中的行号（0 起） */
  line: number;
}

/** 单个文档（标签页）状态 */
export interface DocState {
  id: string;
  filePath: string | null;
  content: string;
  savedContent: string;
  isDirty: boolean;
  /** 超过 10MB 的文件以只读方式打开 */
  readOnly: boolean;
  /** 磁盘上的最后修改时间基线（毫秒） */
  modifiedAt: number;
  size: number;
  cursorLine: number;
  cursorCol: number;
  selectionLength: number;
  headings: HeadingItem[];
  frontMatter: Record<string, unknown> | null;
  frontMatterRaw: string | null;
  /** 编辑器滚动位置（切换标签时恢复） */
  scrollTop: number;
}

/** 可自定义的快捷键 */
export type ShortcutId =
  | "open"
  | "save"
  | "saveAs"
  | "newDoc"
  | "viewMode"
  | "search"
  | "replace"
  | "closeTab"
  | "settings";

export type ShortcutMap = Record<ShortcutId, string>;

/** 应用设置 */
export interface Settings {
  theme: ThemeMode;
  accent: AccentName;
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  recentFilesLimit: number;
  shortcuts: ShortcutMap;
  autoCheckUpdate: boolean;
  /** 大纲显示的最大标题等级（1-6） */
  outlineMaxLevel: number;
}

/** 未保存变更弹窗结果 */
export type UnsavedChoice = "save" | "discard" | "cancel";

/** 外部修改冲突弹窗结果 */
export type ConflictChoice = "local" | "external" | "saveas";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
