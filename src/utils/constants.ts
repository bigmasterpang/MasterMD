export const APP_NAME = "mdview";

/** 可打开为 Markdown 的扩展名 */
export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd", "mkdn"];

/** 纯文本扩展名（以源码模式打开） */
export const TEXT_EXTENSIONS = ["txt"];

export const OPENABLE_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...TEXT_EXTENSIONS];

/** 打开对话框过滤器 */
export const OPEN_DIALOG_FILTERS = [
  { name: "Markdown 文件", extensions: MARKDOWN_EXTENSIONS },
  { name: "文本文件", extensions: TEXT_EXTENSIONS },
  { name: "所有文件", extensions: ["*"] },
];

/** 超过该大小提示只读打开 */
export const LARGE_FILE_BYTES = 10 * 1024 * 1024;

/** 超过该大小关闭实时预览（分屏改为手动刷新） */
export const REALTIME_PREVIEW_LIMIT = 1024 * 1024;

/** 超过该行数降低滚动同步频率 */
export const HEAVY_DOC_LINES = 5000;

/** 预览渲染防抖（毫秒） */
export const PREVIEW_DEBOUNCE = 150;

/** 大纲解析防抖（毫秒） */
export const OUTLINE_DEBOUNCE = 300;

/** 自动保存最短间隔（秒） */
export const MIN_AUTOSAVE_INTERVAL = 5;

export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 24;

/** 最近文件上限 */
export const RECENT_LIMIT = 10;

/** 空文档默认内容 */
export const EMPTY_DOC_PLACEHOLDER = `# 未命名文档

开始输入 Markdown 内容……

- 使用 \`Ctrl+S\` 保存
- 使用 \`Ctrl+E\` 切换视图模式
`;
