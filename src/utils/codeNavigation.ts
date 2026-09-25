import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  EditorSelection,
  StateEffect,
  StateField,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { useAppStore, getDocById } from "../stores/appStore";
import { useExplorerStore } from "../stores/explorerStore";
import { showMessage } from "../stores/dialogStore";
import { getEditorView } from "./editorBridge";
import { fileName, isMarkdownDoc, isPdfDoc, normalizePath } from "./filePath";
import { openPath } from "./fileActions";
import { isTauri } from "./persist";

/* ------------------------------------------------------------------ */
/* 数据模型                                                            */
/* ------------------------------------------------------------------ */

export interface SnippetLine {
  line: number;
  text: string;
}

export interface CodeSymbolLocation {
  docId?: string;
  path: string | null;
  fileName: string;
  /** 1-based 行号 */
  line: number;
  /** 1-based 列号 */
  col: number;
  lineText: string;
  kind: "function" | "method" | "class" | "type" | "variable" | "reference";
  isDefinition: boolean;
  previewLines: SnippetLine[];
}

export interface NavHistoryEntry {
  docId: string;
  filePath: string | null;
  fileName: string;
  line: number;
  col: number;
  symbol?: string;
}

export interface PeekState {
  visible: boolean;
  docId: string;
  mode: "peek-def" | "references";
  symbol: string;
  locations: CodeSymbolLocation[];
  selectedIndex: number;
  loading: boolean;
}

interface CodeNavStore {
  backStack: NavHistoryEntry[];
  forwardStack: NavHistoryEntry[];
  /** 当前编辑器光标下的标识符名称 */
  activeSymbol: string | null;
  /** 速览定义 / 引用列表浮层状态 */
  peekState: PeekState | null;

  setActiveSymbol: (symbol: string | null) => void;
  pushHistory: (entry: NavHistoryEntry) => void;
  setPeekState: (state: PeekState | null) => void;
  setPeekSelectedIndex: (index: number) => void;
  closePeek: () => void;
}

export const useCodeNavStore = create<CodeNavStore>((set) => ({
  backStack: [],
  forwardStack: [],
  activeSymbol: null,
  peekState: null,

  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),

  pushHistory: (entry) =>
    set((s) => {
      const last = s.backStack[s.backStack.length - 1];
      if (
        last &&
        last.docId === entry.docId &&
        last.filePath === entry.filePath &&
        Math.abs(last.line - entry.line) <= 1
      ) {
        return s;
      }
      const nextBack = [...s.backStack.slice(-49), entry];
      return { backStack: nextBack, forwardStack: [] };
    }),

  setPeekState: (peekState) => set({ peekState }),

  setPeekSelectedIndex: (index) =>
    set((s) =>
      s.peekState
        ? {
            peekState: {
              ...s.peekState,
              selectedIndex: Math.max(
                0,
                Math.min(index, Math.max(0, s.peekState.locations.length - 1)),
              ),
            },
          }
        : s,
    ),

  closePeek: () => set({ peekState: null }),
}));

/* ------------------------------------------------------------------ */
/* 语言关键字过滤与标识符提取                                          */
/* ------------------------------------------------------------------ */

const LANGUAGE_KEYWORDS = new Set([
  "if", "else", "elif", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "return", "try", "catch", "except", "finally", "throw", "raise",
  "function", "fn", "func", "def", "class", "struct", "interface", "enum", "trait",
  "impl", "type", "typedef", "namespace", "module", "mod", "package", "import",
  "export", "from", "as", "use", "pub", "private", "protected", "public", "internal",
  "static", "final", "const", "let", "var", "val", "mut", "ref", "readonly",
  "async", "await", "yield", "go", "defer", "chan", "select", "match", "where",
  "new", "delete", "typeof", "instanceof", "sizeof", "in", "of", "is", "not", "and", "or",
  "true", "false", "null", "undefined", "void", "None", "True", "False", "nil",
  "this", "self", "super", "crate", "pass", "with", "lambda", "virtual", "override",
  "abstract", "extends", "implements", " number", "string", "boolean", "any", "never",
  "int", "float", "double", "char", "bool", "usize", "isize", "u8", "u16", "u32", "u64",
  "i8", "i16", "i32", "i64", "f32", "f64", "str", "String", "Vec", "Option", "Result",
]);

function isIdentChar(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || // _
    code === 36 // $
  );
}

function isIdentStart(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 36
  );
}

/** 提取文档指定偏移处的标识符（排除纯数字与保留关键字） */
export function getSymbolAtOffset(
  text: string,
  offset: number,
): { name: string; from: number; to: number } | null {
  if (!text || offset < 0 || offset > text.length) return null;

  let start = offset;
  let end = offset;

  // 如果恰好处在词尾，向左退一格判断
  if (start > 0 && !isIdentChar(text[start]) && isIdentChar(text[start - 1])) {
    start -= 1;
    end = start;
  }

  if (!isIdentChar(text[start])) return null;

  while (start > 0 && isIdentChar(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && isIdentChar(text[end])) {
    end += 1;
  }

  const name = text.slice(start, end);
  if (name.length < 2 || !isIdentStart(name[0]) || LANGUAGE_KEYWORDS.has(name)) {
    return null;
  }

  return { name, from: start, to: end };
}

/** 从当前编辑器选区或光标处获取目标标识符 */
export function getSymbolFromEditor(view: EditorView | null): string | null {
  if (!view) return null;
  const sel = view.state.selection.main;
  const docText = view.state.doc.toString();
  if (!sel.empty && sel.to - sel.from <= 64) {
    const selected = docText.slice(sel.from, sel.to).trim();
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(selected) && !LANGUAGE_KEYWORDS.has(selected)) {
      return selected;
    }
  }
  return getSymbolAtOffset(docText, sel.head)?.name ?? null;
}

/* ------------------------------------------------------------------ */
/* 前端内存级代码定义与引用分类器（与 Rust 侧规则保持一致）            */
/* ------------------------------------------------------------------ */

function findWholeWordIndex(line: string, symbol: string): number {
  if (!symbol || line.length < symbol.length) return -1;
  let start = 0;
  while (start <= line.length - symbol.length) {
    const idx = line.indexOf(symbol, start);
    if (idx === -1) return -1;
    const prevOk = idx === 0 || !isIdentChar(line[idx - 1]);
    const nextOk =
      idx + symbol.length >= line.length || !isIdentChar(line[idx + symbol.length]);
    if (prevOk && nextOk) return idx;
    start = idx + 1;
  }
  return -1;
}

function classifyDefinitionLine(
  trimmed: string,
  symbol: string,
  posInTrimmed: number,
): CodeSymbolLocation["kind"] | null {
  if (
    trimmed.startsWith("//") ||
    (trimmed.startsWith("#") && !trimmed.startsWith("#define")) ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("--")
  ) {
    return null;
  }

  const before = trimmed.slice(0, posInTrimmed).trimEnd();
  const after = trimmed.slice(posInTrimmed + symbol.length).trimStart();

  if (before.endsWith(".") || before.endsWith("->")) return null;

  const tokens = before.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1] ?? "";

  if (["fn", "def", "func", "function", "sub"].includes(lastToken)) {
    return "function";
  }
  if (
    ["class", "struct", "interface", "trait", "impl", "enum", "record", "protocol"].includes(
      lastToken,
    )
  ) {
    return "class";
  }
  if (["type", "typedef", "namespace", "module", "mod"].includes(lastToken)) {
    return "type";
  }
  if (lastToken === "define" && before.startsWith("#")) {
    return "function";
  }
  if (["const", "let", "var", "static", "val"].includes(lastToken)) {
    if (after.startsWith("=") || after.startsWith(":")) {
      if (after.includes("=>") || after.includes("function")) {
        return "function";
      }
      return "variable";
    }
  }

  // Go 接收器方法：`func (r *Repo) Symbol(`
  if (trimmed.startsWith("func ") && before.endsWith(")") && after.startsWith("(")) {
    return "method";
  }

  // C/C++/Java/C#/TS/JS 类方法或函数声明
  if (after.startsWith("(") || after.startsWith("<")) {
    if (
      [
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "return",
        "throw",
        "new",
        "await",
        "yield",
        "else",
        "case",
        "sizeof",
        "typeof",
        "delete",
      ].includes(lastToken)
    ) {
      return null;
    }
    if (
      before.includes("=") ||
      before.includes("(") ||
      before.endsWith(",") ||
      before.endsWith("!")
    ) {
      return null;
    }
    const cleanLine = trimmed.split("//")[0].trimEnd();
    if (
      cleanLine.endsWith("{") ||
      cleanLine.endsWith(") {") ||
      cleanLine.endsWith("){")
    ) {
      if (before.length > 0 || after.includes(")")) {
        return before.length === 0 ? "method" : "function";
      }
    }
  }

  return null;
}

/** 扫描单个内存文档中的定义或全部引用 */
export function scanDocumentForSymbol(
  docId: string,
  filePath: string | null,
  content: string,
  symbol: string,
  onlyDefs: boolean,
): CodeSymbolLocation[] {
  if (!content || !symbol || !content.includes(symbol)) return [];
  const lines = content.split(/\r?\n/);
  const name = filePath ? fileName(filePath) : "未命名文档";
  const results: CodeSymbolLocation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const colIdx = findWholeWordIndex(rawLine, symbol);
    if (colIdx === -1) continue;

    const trimmed = rawLine.trim();
    const posInTrimmed = findWholeWordIndex(trimmed, symbol);
    const defKind =
      posInTrimmed !== -1 ? classifyDefinitionLine(trimmed, symbol, posInTrimmed) : null;
    const isDef = defKind !== null;

    if (onlyDefs && !isDef) continue;

    const previewLines: SnippetLine[] = [];
    if (isDef) {
      const startLine = Math.max(0, i - 3);
      const endLine = Math.min(lines.length, i + 14);
      for (let p = startLine; p < endLine; p++) {
        previewLines.push({
          line: p + 1,
          text: lines[p].slice(0, 180),
        });
      }
    }

    results.push({
      docId,
      path: filePath,
      fileName: name,
      line: i + 1,
      col: colIdx + 1,
      lineText: trimmed.slice(0, 180),
      kind: defKind ?? "reference",
      isDefinition: isDef,
      previewLines,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* 三级混合检索：当前文档 -> 已打开标签页 -> Rust 工作区跨文件扫描     */
/* ------------------------------------------------------------------ */

export async function findSymbolLocations(
  sourceDocId: string,
  symbol: string,
  mode: "defs" | "refs",
): Promise<CodeSymbolLocation[]> {
  const onlyDefs = mode === "defs";
  const state = useAppStore.getState();
  const currentDoc = state.docs.find((d) => d.id === sourceDocId) ?? null;
  const seen = new Set<string>();
  const results: CodeSymbolLocation[] = [];

  const addUnique = (loc: CodeSymbolLocation) => {
    const key = `${loc.path ? normalizePath(loc.path) : loc.docId ?? ""}:${loc.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(loc);
  };

  // Tier 1: 当前活动文档实时缓冲区（无需保存即可立即定位）
  if (currentDoc && !isPdfDoc(currentDoc)) {
    const localHits = scanDocumentForSymbol(
      currentDoc.id,
      currentDoc.filePath,
      currentDoc.content,
      symbol,
      onlyDefs,
    );
    localHits.forEach(addUnique);
  }

  // Tier 2: 已打开的其它代码标签页
  for (const doc of state.docs) {
    if (doc.id === sourceDocId || isPdfDoc(doc) || isMarkdownDoc(doc)) continue;
    const tabHits = scanDocumentForSymbol(
      doc.id,
      doc.filePath,
      doc.content,
      symbol,
      onlyDefs,
    );
    tabHits.forEach(addUnique);
  }

  // Tier 3: 若为桌面端且有工作区目录或文件路径，调用 Rust 原生高速跨文件扫描
  const scanDir =
    useExplorerStore.getState().rootPath || currentDoc?.filePath || null;
  if (isTauri && scanDir) {
    try {
      const workspaceHits = await invoke<CodeSymbolLocation[]>(
        "search_workspace_symbols",
        {
          dirPath: scanDir,
          symbol,
          mode,
        },
      );
      for (const hit of workspaceHits) {
        // 如果该文件已在标签页打开，关联其 docId
        const openDoc = state.docs.find(
          (d) => d.filePath && hit.path && normalizePath(d.filePath) === normalizePath(hit.path),
        );
        addUnique({
          ...hit,
          docId: openDoc?.id,
        });
      }
    } catch (err) {
      console.warn("[MasterEdit] 跨文件符号扫描异常:", err);
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* 编辑器目标行脉冲高亮动画（Jump Target Flash）                        */
/* ------------------------------------------------------------------ */

export const flashLineEffect = StateEffect.define<number | null>();

const jumpFlashDecoration = Decoration.line({ class: "cm-jump-flash" });

const jumpFlashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashLineEffect)) {
        if (e.value === null) {
          return Decoration.none;
        }
        const lineNum = Math.max(1, Math.min(e.value, tr.state.doc.lines));
        const line = tr.state.doc.line(lineNum);
        const builder = new RangeSetBuilder<Decoration>();
        builder.add(line.from, line.from, jumpFlashDecoration);
        return builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 滚动指定编辑器到目标行/列，并触发脉冲高亮动画 */
export function scrollEditorToLineAndFlash(
  docId: string,
  line1Based: number,
  col1Based = 1,
): void {
  const attempt = (retriesLeft: number) => {
    const view = getEditorView(docId) ?? getEditorView();
    if (!view) {
      if (retriesLeft > 0) {
        window.setTimeout(() => attempt(retriesLeft - 1), 60);
      }
      return;
    }
    const safeLine = Math.max(1, Math.min(line1Based, view.state.doc.lines));
    const lineInfo = view.state.doc.line(safeLine);
    const targetPos = Math.min(
      lineInfo.to,
      lineInfo.from + Math.max(0, col1Based - 1),
    );

    view.dispatch({
      selection: EditorSelection.cursor(targetPos),
      effects: [
        EditorView.scrollIntoView(targetPos, { y: "center" }),
        flashLineEffect.of(safeLine),
      ],
    });
    view.focus();

    window.setTimeout(() => {
      try {
        view.dispatch({ effects: flashLineEffect.of(null) });
      } catch {
        /* ignore destroyed view */
      }
    }, 1500);
  };

  attempt(6);
}

/* ------------------------------------------------------------------ */
/* 核心交互动作：转到定义 / 速览定义 / 查找引用 / 历史前进后退          */
/* ------------------------------------------------------------------ */

function recordCurrentPosition(docId: string, symbol?: string): void {
  const doc = getDocById(docId);
  if (!doc) return;
  useCodeNavStore.getState().pushHistory({
    docId: doc.id,
    filePath: doc.filePath,
    fileName: doc.filePath ? fileName(doc.filePath) : "未命名文档",
    line: doc.cursorLine || 1,
    col: doc.cursorCol || 1,
    symbol,
  });
}

/** 跳转到指定的符号位置（支持当前栏跳转或右侧分栏并排打开） */
export async function jumpToCodeLocation(
  loc: CodeSymbolLocation,
  options?: { openInSplit?: boolean; fromDocId?: string; symbol?: string },
): Promise<void> {
  const appState = useAppStore.getState();
  const fromDocId = options?.fromDocId ?? appState.activeId;
  if (fromDocId) {
    recordCurrentPosition(fromDocId, options?.symbol);
  }

  useCodeNavStore.getState().closePeek();

  const sourceDoc = fromDocId ? getDocById(fromDocId) : null;
  const sourcePane = (sourceDoc?.pane ?? appState.layout.activePane ?? 0) as 0 | 1;
  const targetPane: 0 | 1 = options?.openInSplit
    ? sourcePane === 0
      ? 1
      : 0
    : sourcePane;

  if (options?.openInSplit && !appState.layout.split) {
    appState.setLayout({ split: true });
  }

  // 1. 目标文件已经在标签页打开
  const existingDoc =
    (loc.docId ? getDocById(loc.docId) : null) ??
    (loc.path
      ? appState.docs.find(
          (d) => d.filePath && normalizePath(d.filePath) === normalizePath(loc.path!),
        ) ?? null
      : null);

  if (existingDoc) {
    appState.activateDoc(existingDoc.id, targetPane);
    window.setTimeout(() => {
      scrollEditorToLineAndFlash(existingDoc.id, loc.line, loc.col);
    }, 30);
    return;
  }

  // 2. 目标是磁盘上的其它工程文件：打开文件后再定位行号
  if (loc.path) {
    await openPath(loc.path, targetPane);
    const newlyOpened = useAppStore
      .getState()
      .docs.find(
        (d) => d.filePath && normalizePath(d.filePath) === normalizePath(loc.path!),
      );
    if (newlyOpened) {
      window.setTimeout(() => {
        scrollEditorToLineAndFlash(newlyOpened.id, loc.line, loc.col);
      }, 80);
    }
  }
}

/** 转到函数/类/符号的原定义（F12 / Ctrl+Click / 右键菜单） */
export async function goToSymbolDefinition(
  docId: string,
  explicitSymbol?: string,
  options?: { openInSplit?: boolean },
): Promise<void> {
  const view = getEditorView(docId) ?? getEditorView();
  const symbol = explicitSymbol || getSymbolFromEditor(view);
  if (!symbol) {
    await showMessage("未选中符号", "请先将光标停留在函数名、类名或变量名上。");
    return;
  }

  const defs = await findSymbolLocations(docId, symbol, "defs");
  const currentDoc = getDocById(docId);
  const currentLine = currentDoc?.cursorLine ?? 1;

  if (defs.length === 0) {
    // 若未识别出显式声明语法，自动回退展示该符号在工程中的所有出现位置
    const refs = await findSymbolLocations(docId, symbol, "refs");
    if (refs.length > 0) {
      const otherRef = refs.find((r) => !(r.docId === docId && r.line === currentLine));
      if (refs.length === 1 && otherRef) {
        await jumpToCodeLocation(otherRef, { ...options, fromDocId: docId, symbol });
        return;
      }
      useCodeNavStore.getState().setPeekState({
        visible: true,
        docId,
        mode: "references",
        symbol,
        locations: refs,
        selectedIndex: 0,
        loading: false,
      });
      return;
    }
    await showMessage(
      "未找到符号定义",
      `未在当前文件或工程目录中找到「${symbol}」的函数或类型定义（可能是内置 API 或第三方库符号）。`,
    );
    return;
  }

  // 如果光标正好已经在唯一的定义行上，直接弹出「查找所有引用」方便查看何处调用了此函数
  if (
    defs.length === 1 &&
    defs[0].docId === docId &&
    defs[0].line === currentLine &&
    !options?.openInSplit
  ) {
    await openSymbolReferences(docId, symbol);
    return;
  }

  // 优先选择非当前行的定义
  const targetDef =
    defs.find((d) => !(d.docId === docId && d.line === currentLine)) ?? defs[0];

  // 如果存在多处不同文件/不同行的同名定义，且未按住分栏快捷键，优先跳转到首个定义
  await jumpToCodeLocation(targetDef, { ...options, fromDocId: docId, symbol });
}

/** 速览原函数定义（Alt+F12 / 右键「速览原函数定义」）：内联浮窗查看原函数代码 */
export async function peekSymbolDefinition(
  docId: string,
  explicitSymbol?: string,
): Promise<void> {
  const view = getEditorView(docId) ?? getEditorView();
  const symbol = explicitSymbol || getSymbolFromEditor(view);
  if (!symbol) return;

  useCodeNavStore.getState().setPeekState({
    visible: true,
    docId,
    mode: "peek-def",
    symbol,
    locations: [],
    selectedIndex: 0,
    loading: true,
  });

  const defs = await findSymbolLocations(docId, symbol, "defs");
  if (defs.length === 0) {
    const refs = await findSymbolLocations(docId, symbol, "refs");
    useCodeNavStore.getState().setPeekState({
      visible: true,
      docId,
      mode: refs.length > 0 ? "references" : "peek-def",
      symbol,
      locations: refs,
      selectedIndex: 0,
      loading: false,
    });
    return;
  }

  useCodeNavStore.getState().setPeekState({
    visible: true,
    docId,
    mode: "peek-def",
    symbol,
    locations: defs,
    selectedIndex: 0,
    loading: false,
  });
}

/** 查找所有引用（Shift+F12 / 右键「查找所有引用」） */
export async function openSymbolReferences(
  docId: string,
  explicitSymbol?: string,
): Promise<void> {
  const view = getEditorView(docId) ?? getEditorView();
  const symbol = explicitSymbol || getSymbolFromEditor(view);
  if (!symbol) return;

  useCodeNavStore.getState().setPeekState({
    visible: true,
    docId,
    mode: "references",
    symbol,
    locations: [],
    selectedIndex: 0,
    loading: true,
  });

  const refs = await findSymbolLocations(docId, symbol, "refs");
  useCodeNavStore.getState().setPeekState({
    visible: true,
    docId,
    mode: "references",
    symbol,
    locations: refs,
    selectedIndex: 0,
    loading: false,
  });
}

/** 导航历史后退（Alt + ← 或鼠标后退侧键） */
export async function navigateHistoryBack(): Promise<boolean> {
  const nav = useCodeNavStore.getState();
  if (nav.backStack.length === 0) return false;

  const target = nav.backStack[nav.backStack.length - 1];
  const nextBack = nav.backStack.slice(0, -1);

  const activeDocId = useAppStore.getState().activeId;
  const activeDoc = activeDocId ? getDocById(activeDocId) : null;
  const currentEntry: NavHistoryEntry | null = activeDoc
    ? {
        docId: activeDoc.id,
        filePath: activeDoc.filePath,
        fileName: activeDoc.filePath ? fileName(activeDoc.filePath) : "未命名文档",
        line: activeDoc.cursorLine || 1,
        col: activeDoc.cursorCol || 1,
      }
    : null;

  useCodeNavStore.setState({
    backStack: nextBack,
    forwardStack: currentEntry ? [...nav.forwardStack, currentEntry] : nav.forwardStack,
  });

  await restoreHistoryEntry(target);
  return true;
}

/** 导航历史前进（Alt + → 或鼠标前进侧键） */
export async function navigateHistoryForward(): Promise<boolean> {
  const nav = useCodeNavStore.getState();
  if (nav.forwardStack.length === 0) return false;

  const target = nav.forwardStack[nav.forwardStack.length - 1];
  const nextForward = nav.forwardStack.slice(0, -1);

  const activeDocId = useAppStore.getState().activeId;
  const activeDoc = activeDocId ? getDocById(activeDocId) : null;
  const currentEntry: NavHistoryEntry | null = activeDoc
    ? {
        docId: activeDoc.id,
        filePath: activeDoc.filePath,
        fileName: activeDoc.filePath ? fileName(activeDoc.filePath) : "未命名文档",
        line: activeDoc.cursorLine || 1,
        col: activeDoc.cursorCol || 1,
      }
    : null;

  useCodeNavStore.setState({
    backStack: currentEntry ? [...nav.backStack, currentEntry] : nav.backStack,
    forwardStack: nextForward,
  });

  await restoreHistoryEntry(target);
  return true;
}

async function restoreHistoryEntry(entry: NavHistoryEntry): Promise<void> {
  const appState = useAppStore.getState();
  const existing =
    getDocById(entry.docId) ??
    (entry.filePath
      ? appState.docs.find(
          (d) =>
            d.filePath && normalizePath(d.filePath) === normalizePath(entry.filePath!),
        ) ?? null
      : null);

  if (existing) {
    appState.activateDoc(existing.id);
    window.setTimeout(() => {
      scrollEditorToLineAndFlash(existing.id, entry.line, entry.col);
    }, 30);
    return;
  }

  if (entry.filePath) {
    await openPath(entry.filePath);
    const opened = useAppStore
      .getState()
      .docs.find(
        (d) =>
          d.filePath && normalizePath(d.filePath) === normalizePath(entry.filePath!),
      );
    if (opened) {
      window.setTimeout(() => {
        scrollEditorToLineAndFlash(opened.id, entry.line, entry.col);
      }, 80);
    }
  }
}

/* ------------------------------------------------------------------ */
/* CodeMirror 6 增强扩展：同名符号高亮 + Ctrl+悬停下划线 + Ctrl+单击跳转 */
/* ------------------------------------------------------------------ */

const occurrenceMark = Decoration.mark({ class: "cm-word-occurrence" });
const ctrlLinkMark = Decoration.mark({ class: "cm-ctrl-link" });

const setCtrlHoverRange = StateEffect.define<{ from: number; to: number } | null>();

const ctrlHoverField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setCtrlHoverRange)) {
        if (!e.value || e.value.from >= e.value.to) {
          return Decoration.none;
        }
        const builder = new RangeSetBuilder<Decoration>();
        builder.add(e.value.from, e.value.to, ctrlLinkMark);
        return builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 光标所在标识符的视口内全词同名高亮插件 */
const occurrenceHighlighterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.compute(update.view);
      }
    }

    compute(view: EditorView): DecorationSet {
      const docText = view.state.doc.toString();
      const head = view.state.selection.main.head;
      const sym = getSymbolAtOffset(docText, head);
      useCodeNavStore.getState().setActiveSymbol(sym?.name ?? null);

      if (!sym || sym.name.length < 2) {
        return Decoration.none;
      }

      const builder = new RangeSetBuilder<Decoration>();
      const word = sym.name;
      for (const { from, to } of view.visibleRanges) {
        const slice = docText.slice(from, to);
        let searchPos = 0;
        while (searchPos <= slice.length - word.length) {
          const idx = slice.indexOf(word, searchPos);
          if (idx === -1) break;
          const absFrom = from + idx;
          const absTo = absFrom + word.length;
          const prevOk = absFrom === 0 || !isIdentChar(docText[absFrom - 1]);
          const nextOk = absTo >= docText.length || !isIdentChar(docText[absTo]);
          if (prevOk && nextOk) {
            builder.add(absFrom, absTo, occurrenceMark);
          }
          searchPos = idx + word.length;
        }
      }
      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/** 为代码编辑器创建全套符号导航扩展（Ctrl+Click、同名高亮、跳转闪烁等） */
export function createCodeNavigationExtensions(docId: string): Extension[] {
  return [
    jumpFlashField,
    ctrlHoverField,
    occurrenceHighlighterPlugin,
    EditorView.domEventHandlers({
      mousemove: (event, view) => {
        const doc = getDocById(docId);
        if (!doc || isMarkdownDoc(doc)) return false;

        if (!(event.ctrlKey || event.metaKey)) {
          if (view.state.field(ctrlHoverField, false) !== Decoration.none) {
            view.dispatch({ effects: setCtrlHoverRange.of(null) });
          }
          return false;
        }

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
          view.dispatch({ effects: setCtrlHoverRange.of(null) });
          return false;
        }
        const sym = getSymbolAtOffset(view.state.doc.toString(), pos);
        view.dispatch({
          effects: setCtrlHoverRange.of(sym ? { from: sym.from, to: sym.to } : null),
        });
        return false;
      },
      mouseleave: (_event, view) => {
        if (view.state.field(ctrlHoverField, false) !== Decoration.none) {
          view.dispatch({ effects: setCtrlHoverRange.of(null) });
        }
        return false;
      },
      mousedown: (event, view) => {
        const doc = getDocById(docId);
        if (!doc || isMarkdownDoc(doc)) return false;

        // 鼠标侧键支持：后退 (button 3) / 前进 (button 4)
        if (event.button === 3) {
          event.preventDefault();
          void navigateHistoryBack();
          return true;
        }
        if (event.button === 4) {
          event.preventDefault();
          void navigateHistoryForward();
          return true;
        }

        // Ctrl + 左键单击：直接转到定义（Ctrl + Alt + 左键单击：在右侧分栏打开定义）
        if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const sym = getSymbolAtOffset(view.state.doc.toString(), pos);
            if (sym) {
              event.preventDefault();
              view.dispatch({
                selection: EditorSelection.cursor(pos),
                effects: setCtrlHoverRange.of(null),
              });
              void goToSymbolDefinition(docId, sym.name, {
                openInSplit: event.altKey,
              });
              return true;
            }
          }
        }
        return false;
      },
    }),
  ];
}
