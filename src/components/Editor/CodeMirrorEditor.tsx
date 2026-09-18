import { useEffect, useRef, useState } from "react";
import {
  EditorState,
  Compartment,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, dropCursor, placeholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentUnit,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { search } from "@codemirror/search";
import { useAppStore, getDocById, getActiveDoc } from "../../stores/appStore";
import { useSearchStore } from "../../stores/searchStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { registerEditor } from "../../utils/editorBridge";
import { showMessage } from "../../stores/dialogStore";
import { invoke } from "@tauri-apps/api/core";
import { createEditorTheme } from "./editorTheme";
import { searchHighlightField, setSearchHighlight } from "./searchHighlight";
import { EditorContextMenu } from "./EditorContextMenu";

interface Props {
  docId: string;
  isDark: boolean;
}

const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();
const lineNumberCompartment = new Compartment();
const tabCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

function buildExtensions(isDark: boolean): Extension[] {
  const settings = useSettingsStore.getState();
  const doc = getActiveDoc();
  return [
    lineNumberCompartment.of(settings.showLineNumbers ? lineNumbers() : []),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    history(),
    foldGutter(),
    bracketMatching(),
    closeBrackets(),
    search({ top: true }),
    searchHighlightField,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorState.allowMultipleSelections.of(true),
    indentUnit.of(" ".repeat(settings.tabSize)),
    tabCompartment.of(EditorState.tabSize.of(settings.tabSize)),
    wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
    readOnlyCompartment.of(EditorState.readOnly.of(Boolean(doc?.readOnly))),
    placeholder("在此输入 Markdown 内容……"),
    themeCompartment.of(createEditorTheme(isDark)),
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),
  ];
}

/**
 * CodeMirror 6 编辑器。
 * 由父级以 key={docId} 渲染，切换标签页时重建实例，避免状态串扰。
 */
export function CodeMirrorEditor({ docId, isDark }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const syncingRef = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(
    null,
  );
  const content = useAppStore((s) => s.docs.find((d) => d.id === s.activeId)?.content ?? "");
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const tabSize = useSettingsStore((s) => s.tabSize);

  /* ------------------------------ 初始化 ------------------------------ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        ...buildExtensions(isDark),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            useAppStore.getState().setContent(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            useAppStore.getState().setCursor(line.number, pos - line.from + 1);
            useAppStore.getState().setSelectionLength(
              update.state.selection.ranges.reduce(
                (sum, range) => sum + (range.to - range.from),
                0,
              ),
            );
          }
        }),
        EditorView.domEventHandlers({
          paste: (event) => {
            const hasImage = Array.from(event.clipboardData?.items ?? []).some(
              (item) => item.type.startsWith("image/"),
            );
            if (!hasImage) return false; // 普通文本粘贴交给 CodeMirror 处理
            void handleImagePaste(event, viewRef.current);
            return true;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    // 恢复滚动位置
    const saved = getDocById(docId)?.scrollTop ?? 0;
    if (saved > 0) {
      requestAnimationFrame(() => {
        const scroller = view.scrollDOM;
        scroller.scrollTop = saved;
      });
    }
    view.focus();

    // 向全局暴露编辑器实例（编辑器命令 / 搜索 / 大纲共用）
    registerEditor(view);

    // 记录滚动位置（节流）
    let scrollTimer: number | null = null;
    const onScroll = () => {
      if (scrollTimer !== null) return;
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null;
        useAppStore.getState().setDocScrollTop(docId, view.scrollDOM.scrollTop);
      }, 300);
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener("scroll", onScroll);
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      registerEditor(null);
      view.destroy();
      viewRef.current = null;
    };
    // 仅在文档切换时重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  /* ------------------------ 外部内容变化同步 ------------------------ */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    syncingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
    syncingRef.current = false;
  }, [content]);

  /* ------------------------ 搜索高亮同步 ------------------------ */
  const searchMatches = useSearchStore((s) => s.matches);
  const searchCurrent = useSearchStore((s) => s.current);
  const searchVisible = useSearchStore((s) => s.visible);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setSearchHighlight.of({
        ranges: searchVisible ? searchMatches : [],
        current: searchCurrent,
      }),
    });
  }, [searchMatches, searchCurrent, searchVisible]);

  /* ------------------------------ 设置联动 ------------------------------ */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumberCompartment.reconfigure(
        showLineNumbers ? lineNumbers() : [],
      ),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: tabCompartment.reconfigure([
        indentUnit.of(" ".repeat(tabSize)),
        EditorState.tabSize.of(tabSize),
      ]),
    });
  }, [tabSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(createEditorTheme(isDark)) });
  }, [isDark]);

  // 只读状态变化（例如文件重新加载后判定为大文件）
  const readOnly = useAppStore(
    (s) => s.docs.find((d) => d.id === s.activeId)?.readOnly ?? false,
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  /* ------------------------ 右键菜单 ------------------------ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onContextMenu = (event: MouseEvent) => {
      const view = viewRef.current;
      if (!view) return;
      // 只在编辑器区域内响应，且不覆盖浏览器原生菜单以外的行为
      if (!host.contains(event.target as Node)) return;
      event.preventDefault();
      const sel = view.state.selection.main;
      // 右键位置若在选区外，把光标移动到该处（与常见编辑器一致）
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) {
        const insideSelection = pos >= sel.from && pos <= sel.to;
        if (!insideSelection) {
          view.dispatch({ selection: { anchor: pos } });
        }
      }
      const current = view.state.selection.main;
      setMenu({
        x: event.clientX,
        y: event.clientY,
        hasSelection: !current.empty,
      });
    };
    host.addEventListener("contextmenu", onContextMenu);
    return () => host.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return (
    <>
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {menu ? (
        <EditorContextMenu
          x={menu.x}
          y={menu.y}
          hasSelection={menu.hasSelection}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

/** 从剪贴板粘贴图片：保存到 assets/ 并插入相对路径 */
async function handleImagePaste(
  event: ClipboardEvent,
  view: EditorView | null,
): Promise<void> {
  if (!view) return;
  event.preventDefault();
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  const doc = getActiveDoc();
  if (!doc?.filePath) {
    await showMessage(
      "请先保存文档",
      "粘贴图片需要先保存文档，图片将存放在文档同目录的 assets 文件夹中。",
    );
    return;
  }
  if (doc.readOnly) return;
  const file = imageItem.getAsFile();
  if (!file) return;

  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  try {
    const buffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(buffer));
    const relative = await invoke<string>("save_pasted_image", {
      docPath: doc.filePath,
      data,
      ext,
    });
    const alt = relative.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "image";
    const current = view.state.doc.toString();
    const range = view.state.selection.main;
    const prefix = range.from === 0 || current[range.from - 1] === "\n" ? "" : "\n";
    const markdownText = `${prefix}![${alt}](${relative})\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: markdownText },
      selection: { anchor: range.from + markdownText.length },
    });
    view.focus();
  } catch (error) {
    await showMessage("图片保存失败", String(error));
  }
}
