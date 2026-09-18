import { useMemo } from "react";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { showMessage } from "../../stores/dialogStore";
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
  setHeading,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleList,
  toggleQuote,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
  transformCase,
} from "../../utils/editorCommands";
import { promptInsert } from "../Toolbar/Toolbar";

interface Props {
  x: number;
  y: number;
  hasSelection: boolean;
  onClose: () => void;
}

/** 编辑器右键菜单：有选区时提供格式/转换操作，空白处提供插入操作 */
export function EditorContextMenu({ x, y, hasSelection, onClose }: Props) {
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
    ];

    if (hasSelection) {
      return [
        clipboard,
        [
          { label: "加粗", hint: "Ctrl+B", icon: "bold", onClick: toggleBold },
          { label: "斜体", hint: "Ctrl+I", icon: "italic", onClick: toggleItalic },
          { label: "删除线", hint: "Alt+Shift+5", onClick: toggleStrikethrough },
          { label: "行内代码", hint: "Ctrl+`", icon: "code", onClick: toggleInlineCode },
          { label: "上标", onClick: toggleSuperscript },
          { label: "下标", onClick: toggleSubscript },
          { label: "清除格式", icon: "x", onClick: clearFormatting },
        ],
        [
          {
            label: "插入链接…",
            hint: "Ctrl+K",
            icon: "link",
            onClick: () => void promptInsert("link"),
          },
          {
            label: "插入图片…",
            hint: "Ctrl+Shift+I",
            icon: "image",
            onClick: () => void promptInsert("image"),
          },
        ],
        [
          { label: "标题 H1", hint: "Ctrl+1", onClick: () => setHeading(1) },
          { label: "标题 H2", hint: "Ctrl+2", onClick: () => setHeading(2) },
          { label: "标题 H3", hint: "Ctrl+3", onClick: () => setHeading(3) },
          { label: "正文", hint: "Ctrl+0", onClick: () => setHeading(0) },
        ],
        [
          { label: "无序列表", hint: "Ctrl+Shift+8", icon: "list", onClick: () => toggleList("bullet") },
          { label: "有序列表", hint: "Ctrl+Shift+7", icon: "list", onClick: () => toggleList("ordered") },
          { label: "任务列表", hint: "Ctrl+Shift+9", icon: "check", onClick: () => toggleList("task") },
          { label: "引用块", hint: "Ctrl+Shift+Q", onClick: toggleQuote },
          { label: "提示块", hint: "Ctrl+Shift+L", onClick: () => insertCallout("note") },
          { label: "代码块", hint: "Ctrl+Shift+C", icon: "code", onClick: () => insertCodeBlock() },
        ],
        [
          { label: "转为大写", onClick: () => transformCase("upper") },
          { label: "转为小写", onClick: () => transformCase("lower") },
        ],
      ];
    }

    return [
      clipboard,
      [
        { label: "插入表格 3×3", hint: "Ctrl+Shift+T", icon: "columns", onClick: () => insertTable(3, 3) },
        { label: "插入代码块", hint: "Ctrl+Shift+C", icon: "code", onClick: () => insertCodeBlock() },
        { label: "插入分割线", hint: "Ctrl+Shift+H", icon: "minus", onClick: insertHorizontalRule },
      ],
      [
        { label: "插入行内公式 $…$", onClick: () => insertMath(false) },
        { label: "插入块级公式 $$…$$", onClick: () => insertMath(true) },
        { label: "插入 Mermaid 图表", icon: "columns", onClick: insertMermaid },
      ],
      [
        { label: "插入链接…", hint: "Ctrl+K", icon: "link", onClick: () => void promptInsert("link") },
        { label: "插入图片…", hint: "Ctrl+Shift+I", icon: "image", onClick: () => void promptInsert("image") },
        { label: "插入日期时间", icon: "clock", onClick: insertDateTime },
        { label: "插入目录 (TOC)", hint: "Ctrl+Shift+O", icon: "list", onClick: insertToc },
      ],
      [
        { label: "插入标题 H1", hint: "Ctrl+1", onClick: () => setHeading(1) },
        { label: "插入标题 H2", hint: "Ctrl+2", onClick: () => setHeading(2) },
        { label: "插入标题 H3", hint: "Ctrl+3", onClick: () => setHeading(3) },
        { label: "任务列表", hint: "Ctrl+Shift+9", icon: "check", onClick: () => toggleList("task") },
        { label: "提示块", hint: "Ctrl+Shift+L", onClick: () => insertCallout("note") },
        { label: "引用块", hint: "Ctrl+Shift+Q", onClick: toggleQuote },
      ],
    ];
  }, [hasSelection]);

  return <ContextMenu x={x} y={y} groups={groups} onClose={onClose} />;
}
