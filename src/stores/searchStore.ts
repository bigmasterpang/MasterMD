import { create } from "zustand";
import { getActiveDoc, useAppStore } from "./appStore";
import { getEditorView } from "../utils/editorBridge";
import { selectRange } from "../utils/editorCommands";
import {
  DEFAULT_SEARCH_OPTIONS,
  applyChangesToString,
  buildReplaceAll,
  buildSingleReplacement,
  findMatches,
  type MatchRange,
  type SearchOptions,
} from "../utils/searchEngine";
import type { ChangeSpec } from "@codemirror/state";

interface SearchState {
  visible: boolean;
  replaceVisible: boolean;
  query: string;
  replacement: string;
  options: SearchOptions;
  matches: MatchRange[];
  current: number;
  error: string | null;

  open: (replace?: boolean) => void;
  close: () => void;
  setQuery: (query: string) => void;
  setReplacement: (value: string) => void;
  toggleOption: (key: keyof SearchOptions) => void;
  /** 内容 / 查询 / 选项变化后重新计算匹配 */
  recompute: (resetCurrent?: boolean) => void;
  /** 移动到上一个(-1) / 下一个(1)匹配 */
  step: (direction: -1 | 1) => void;
  setCurrent: (index: number) => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
}

/** 从编辑器或页面选区取初始查询串 */
function initialQuery(): string {
  const view = getEditorView();
  if (view) {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      const text = view.state.sliceDoc(sel.from, sel.to);
      if (text && text.length <= 200 && !text.includes("\n")) return text;
    }
  }
  const pageSelection = window.getSelection()?.toString() ?? "";
  if (pageSelection && pageSelection.length <= 200 && !pageSelection.includes("\n")) {
    return pageSelection;
  }
  return "";
}

function activeContent(): string {
  return getActiveDoc()?.content ?? "";
}

function isEditorMode(): boolean {
  const mode = useAppStore.getState().viewMode;
  return mode !== "preview" && getEditorView() !== null;
}

/** 滚动到指定匹配位置（源码模式移动光标；预览模式由预览组件负责） */
function revealMatch(index: number): void {
  const { matches } = useSearchStore.getState();
  const match = matches[index];
  if (!match) return;
  if (isEditorMode()) {
    selectRange(match.from, match.to);
  }
}

/** 应用编辑器变更（源码模式走 CodeMirror，保证撤销历史） */
function applyToDocument(changes: ChangeSpec[], fallbackText: string): void {
  const view = getEditorView();
  const mode = useAppStore.getState().viewMode;
  if (view && mode !== "preview") {
    view.dispatch({ changes });
    return;
  }
  useAppStore.getState().setContent(fallbackText);
}

export const useSearchStore = create<SearchState>((set, get) => ({
  visible: false,
  replaceVisible: false,
  query: "",
  replacement: "",
  options: { ...DEFAULT_SEARCH_OPTIONS },
  matches: [],
  current: 0,
  error: null,

  open: (replace = false) => {
    const seeded = get().query ? get().query : initialQuery();
    set({
      visible: true,
      replaceVisible: replace ? true : get().replaceVisible,
      query: seeded,
    });
    if (seeded) get().recompute(true);
  },

  close: () => {
    set({ visible: false, matches: [], current: 0, error: null });
  },

  setQuery: (query) => {
    set({ query });
    get().recompute(true);
  },

  setReplacement: (value) => set({ replacement: value }),

  toggleOption: (key) => {
    set((state) => ({ options: { ...state.options, [key]: !state.options[key] } }));
    get().recompute(true);
  },

  recompute: (resetCurrent = false) => {
    const { query, options, current } = get();
    const text = activeContent();
    const { ranges, error } = findMatches(text, query, options);
    const nextCurrent = ranges.length === 0
      ? 0
      : resetCurrent
        ? 0
        : Math.min(current, ranges.length - 1);
    set({ matches: ranges, error, current: nextCurrent });
    if (ranges.length > 0 && resetCurrent) revealMatch(nextCurrent);
  },

  step: (direction) => {
    const { matches, current, options } = get();
    if (matches.length === 0) return;
    let next = current + direction;
    if (next < 0) next = options.wrapAround ? matches.length - 1 : 0;
    if (next >= matches.length) next = options.wrapAround ? 0 : matches.length - 1;
    set({ current: next });
    revealMatch(next);
  },

  setCurrent: (index) => {
    set({ current: index });
    revealMatch(index);
  },

  replaceCurrent: () => {
    const { matches, current, query, replacement, options } = get();
    const match = matches[current];
    if (!match) return;
    const text = activeContent();
    const insert = buildSingleReplacement(text, match, query, replacement, options);
    const nextText = `${text.slice(0, match.from)}${insert}${text.slice(match.to)}`;
    applyToDocument([{ from: match.from, to: match.to, insert }], nextText);
    // 替换后原位置的下一个匹配成为新的当前项
    const { ranges, error } = findMatches(nextText, query, options);
    const nextIndex = Math.min(current, Math.max(0, ranges.length - 1));
    set({ matches: ranges, error, current: nextIndex });
    revealMatch(nextIndex);
  },

  replaceAll: () => {
    const { query, replacement, options } = get();
    const text = activeContent();
    const { changes, count, error } = buildReplaceAll(text, query, replacement, options);
    if (error || count === 0) {
      set({ error });
      return;
    }
    const nextText = applyChangesToString(text, changes);
    applyToDocument(
      changes.map((change) => ({
        from: change.from,
        to: change.to,
        insert: change.insert,
      })),
      nextText,
    );
    const { ranges } = findMatches(nextText, query, options);
    set({ matches: ranges, current: 0, error: null });
  },
}));
