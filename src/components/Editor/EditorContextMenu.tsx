import { useMemo } from "react";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { showMessage } from "../../stores/dialogStore";
import { useAppStore } from "../../stores/appStore";
import { isMarkdownDoc } from "../../utils/filePath";
import {
  clearFormatting,
  copySelection,
  cutSelection,
  insertCallout,
  insertCodeBlock,
  insertDateTime,
  insertHorizontalRule,
  insertMath,
  insertMermaid,
  insertTable,
  insertToc,
  pasteFromClipboard,
  selectAllText,
  setHeading,
  shiftHeading,
  toggleBold,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleList,
  toggleQuote,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
  toggleUnderline,
  transformCase,
} from "../../utils/editorCommands";
import {
  goToSymbolDefinition,
  navigateHistoryBack,
  navigateHistoryForward,
  openSymbolReferences,
  peekSymbolDefinition,
  useCodeNavStore,
} from "../../utils/codeNavigation";
import { promptInsert } from "../Toolbar/Toolbar";

interface Props {
  x: number;
  y: number;
  docId: string;
  symbol?: string | null;
  hasSelection: boolean;
  onClose: () => void;
}

/** 编辑器右键菜单：支持代码符号转到定义/速览/查找引用与 Markdown 编辑分组 */
export function EditorContextMenu({
  x,
  y,
  docId,
  symbol,
  hasSelection,
  onClose,
}: Props) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const isMd = isMarkdownDoc(doc);
  const backCount = useCodeNavStore((s) => s.backStack.length);
  const forwardCount = useCodeNavStore((s) => s.forwardStack.length);

  const groups = useMemo<ContextMenuItem[][]>(() => {
    const clipboard: ContextMenuItem[] = [
      { label: "剪切", hint: "Ctrl+X", onClick: () => void cutSelection() },
      {
        label: "复制",
        hint: "Ctrl+C",
        onClick: async () => {
          const ok = await copySelection();
          if (!ok) await showMessage("复制失败", "没有可复制的内容。");
        },
      },
      {
        label: "粘贴",
        hint: "Ctrl+V",
        onClick: async () => {
          const ok = await pasteFromClipboard();
          if (!ok) {
            await showMessage(
              "无法读取剪贴板",
              "当前环境不允许读取剪贴板，请直接使用 Ctrl+V 粘贴（支持图片）。",
            );
          }
        },
      },
      { label: "全选", hint: "Ctrl+A", onClick: selectAllText },
    ];

    const formatSubmenu: ContextMenuItem[][] = [
      [
        { label: "加粗", hint: "Ctrl+B", icon: "bold", onClick: toggleBold },
        { label: "斜体", hint: "Ctrl+I", icon: "italic", onClick: toggleItalic },
        { label: "删除线", hint: "Alt+Shift+5", onClick: toggleStrikethrough },
        { label: "高亮", hint: "Ctrl+Shift+M", onClick: toggleHighlight },
        { label: "下划线", hint: "Alt+Shift+U", onClick: toggleUnderline },
      ],
      [
        { label: "行内代码", hint: "Ctrl+`", icon: "code", onClick: toggleInlineCode },
        { label: "上标", hint: "Alt+Shift+=", onClick: toggleSuperscript },
        { label: "下标", hint: "Alt+Shift+-", onClick: toggleSubscript },
      ],
      [{ label: "清除格式", icon: "x", onClick: clearFormatting }],
    ];

    const insertSubmenu: ContextMenuItem[][] = [
      [
        {
          label: "链接…",
          hint: "Ctrl+K",
          icon: "link",
          onClick: () => void promptInsert("link"),
        },
        {
          label: "图片…",
          hint: "Ctrl+Shift+I",
          icon: "image",
          onClick: () => void promptInsert("image"),
        },
      ],
      [
        { label: "表格 3×3", hint: "Ctrl+Shift+T", icon: "columns", onClick: () => insertTable(3, 3) },
        { label: "代码块", hint: "Ctrl+Shift+C", icon: "code", onClick: () => insertCodeBlock() },
        { label: "分割线", hint: "Ctrl+Shift+H", icon: "minus", onClick: insertHorizontalRule },
      ],
      [
        { label: "行内公式 $…$", onClick: () => insertMath(false) },
        { label: "块级公式 $$…$$", onClick: () => insertMath(true) },
        { label: "Mermaid 图表", icon: "columns", onClick: insertMermaid },
      ],
      [
        { label: "日期时间", icon: "clock", onClick: insertDateTime },
        { label: "目录 (TOC)", hint: "Ctrl+Shift+O", icon: "list", onClick: insertToc },
      ],
    ];

    const paragraphSubmenu: ContextMenuItem[][] = [
      [
        { label: "标题 H1", hint: "Ctrl+1", onClick: () => setHeading(1) },
        { label: "标题 H2", hint: "Ctrl+2", onClick: () => setHeading(2) },
        { label: "标题 H3", hint: "Ctrl+3", onClick: () => setHeading(3) },
        { label: "标题 H4", hint: "Ctrl+4", onClick: () => setHeading(4) },
        { label: "正文", hint: "Ctrl+0", onClick: () => setHeading(0) },
        { label: "提升一级", hint: "Ctrl+Alt+↑", onClick: () => shiftHeading(-1) },
        { label: "降低一级", hint: "Ctrl+Alt+↓", onClick: () => shiftHeading(1) },
      ],
      [
        { label: "无序列表", hint: "Ctrl+Shift+8", icon: "list", onClick: () => toggleList("bullet") },
        { label: "有序列表", hint: "Ctrl+Shift+7", icon: "list", onClick: () => toggleList("ordered") },
        { label: "任务列表", hint: "Ctrl+Shift+9", icon: "check", onClick: () => toggleList("task") },
      ],
      [
        { label: "引用块", hint: "Ctrl+Shift+Q", onClick: toggleQuote },
        { label: "提示块", hint: "Ctrl+Shift+L", onClick: () => insertCallout("note") },
      ],
    ];

    const calloutSubmenu: ContextMenuItem[][] = [
      [
        { label: "提示 NOTE", onClick: () => insertCallout("note") },
        { label: "技巧 TIP", onClick: () => insertCallout("tip") },
        { label: "重要 IMPORTANT", onClick: () => insertCallout("important") },
        { label: "警告 WARNING", onClick: () => insertCallout("warning") },
        { label: "注意 CAUTION", onClick: () => insertCallout("caution") },
      ],
    ];

    const transformSubmenu: ContextMenuItem[][] = [
      [
        { label: "转为大写", onClick: () => transformCase("upper") },
        { label: "转为小写", onClick: () => transformCase("lower") },
      ],
    ];

    // 非 Markdown 文档（代码、纯文本）：提供代码符号导航（转到定义/速览原函数/分栏定义/查找引用）与历史回退
    if (!isMd) {
      const codeGroups: ContextMenuItem[][] = [];

      if (symbol) {
        const displaySym = symbol.length > 22 ? `${symbol.slice(0, 22)}…` : symbol;
        const isRightPane = (doc?.pane ?? 0) === 1;
        const splitLabel = isRightPane
          ? `在左侧分栏打开定义「${displaySym}」`
          : `在右侧分栏打开定义「${displaySym}」`;
        codeGroups.push([
          {
            label: `转到原函数 / 定义「${displaySym}」`,
            hint: "F12",
            icon: "code",
            onClick: () => void goToSymbolDefinition(docId, symbol),
          },
          {
            label: `速览原函数实现「${displaySym}」`,
            hint: "Alt+F12",
            icon: "eye",
            onClick: () => void peekSymbolDefinition(docId, symbol),
          },
          {
            label: splitLabel,
            hint: "Ctrl+Alt+单击",
            icon: "columns",
            onClick: () => void goToSymbolDefinition(docId, symbol, { openInSplit: true }),
          },
          {
            label: `查找所有引用「${displaySym}」`,
            hint: "Shift+F12",
            icon: "search",
            onClick: () => void openSymbolReferences(docId, symbol),
          },
        ]);
      }

      if (backCount > 0 || forwardCount > 0) {
        const navItems: ContextMenuItem[] = [];
        if (backCount > 0) {
          navItems.push({
            label: "返回上一位置",
            hint: "Alt+←",
            icon: "arrow-left",
            onClick: () => void navigateHistoryBack(),
          });
        }
        if (forwardCount > 0) {
          navItems.push({
            label: "前进下一位置",
            hint: "Alt+→",
            icon: "arrow-right",
            onClick: () => void navigateHistoryForward(),
          });
        }
        codeGroups.push(navItems);
      }

      codeGroups.push(clipboard);

      if (hasSelection) {
        codeGroups.push([{ label: "大小写转换", submenu: transformSubmenu }]);
      }
      return codeGroups;
    }

    if (hasSelection) {
      return [
        clipboard,
        [
          { label: "格式", icon: "bold", submenu: formatSubmenu },
          { label: "段落与列表", icon: "list", submenu: paragraphSubmenu },
          { label: "提示块", submenu: calloutSubmenu },
          { label: "插入", icon: "plus", submenu: insertSubmenu },
          { label: "大小写转换", submenu: transformSubmenu },
        ],
      ];
    }

    return [
      clipboard,
      [
        { label: "插入", icon: "plus", submenu: insertSubmenu },
        { label: "段落与列表", icon: "list", submenu: paragraphSubmenu },
        { label: "提示块", submenu: calloutSubmenu },
      ],
    ];
  }, [hasSelection, isMd, symbol, docId, doc?.pane, backCount, forwardCount]);

  return <ContextMenu x={x} y={y} groups={groups} onClose={onClose} />;
}
