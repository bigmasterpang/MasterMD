import { create } from "zustand";
import type {
  DocState,
  FilePayload,
  HeadingItem,
  LayoutState,
  ViewMode,
} from "../types";
import { LARGE_FILE_BYTES } from "../utils/constants";

let docSeq = 0;

export function nextDocId(): string {
  docSeq += 1;
  return `doc-${Date.now().toString(36)}-${docSeq}`;
}

/** 新建一个文档状态对象 */
export function createDoc(partial: Partial<DocState> = {}): DocState {
  return {
    id: nextDocId(),
    filePath: null,
    content: "",
    savedContent: "",
    isDirty: false,
    readOnly: false,
    encrypted: false,
    encryptedHeader: null,
    encoding: "utf-8",
    eol: "lf",
    modifiedAt: 0,
    size: 0,
    cursorLine: 1,
    cursorCol: 1,
    selectionLength: 0,
    headings: [],
    frontMatter: null,
    frontMatterRaw: null,
    scrollTop: 0,
    pane: 0,
    ...partial,
  };
}

/** 由后端返回的文件数据构造文档 */
export function docFromPayload(payload: FilePayload): DocState {
  const encrypted = payload.encrypted ?? false;
  return createDoc({
    filePath: payload.path,
    content: payload.content,
    savedContent: payload.content,
    modifiedAt: payload.modifiedAt,
    size: payload.size,
    encrypted,
    encryptedHeader: payload.encryptedHeader ?? null,
    encoding: payload.encoding ?? "utf-8",
    eol: payload.eol ?? "lf",
    // 加密文档可正常编辑，保存时由后端按原格式加密写回
    readOnly: payload.size > LARGE_FILE_BYTES,
  });
}

interface AppStore {
  docs: DocState[];
  activeId: string | null;
  viewMode: ViewMode;
  outlineVisible: boolean;
  searchVisible: boolean;
  searchQuery: string;
  searchCaseSensitive: boolean;
  recentFiles: string[];
  /** 编辑区与预览区滚动同步开关 */
  syncScroll: boolean;
  /** 《Markdown 江湖》以独立标签页的形式打开（与文档标签并列） */
  gameOpen: boolean;

  /** 双栏布局模型 */
  layout: LayoutState;
  /** 左右两栏当前激活的文档 ID [leftActiveId, rightActiveId] */
  activeIds: [string | null, string | null];

  setViewMode: (mode: ViewMode) => void;
  cycleViewMode: () => void;
  toggleOutline: () => void;
  setOutlineVisible: (visible: boolean) => void;
  setSearchVisible: (visible: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchCaseSensitive: (value: boolean) => void;
  setRecentFiles: (files: string[]) => void;
  toggleSyncScroll: () => void;
  openGame: () => void;
  closeGame: () => void;

  // 分栏布局控制
  setLayout: (partial: Partial<LayoutState>) => void;
  toggleSplit: () => void;
  setActivePane: (pane: 0 | 1) => void;
  setPaneRatio: (ratio: number) => void;
  moveDocToPane: (id: string, targetPane: 0 | 1) => void;

  addDoc: (doc: DocState) => void;
  activateDoc: (id: string, targetPane?: 0 | 1) => void;
  closeDoc: (id: string) => void;
  closeOtherDocs: (id: string) => void;
  closeRightDocs: (id: string) => void;
  closeAllDocs: () => void;
  reorderDocs: (pane: 0 | 1, fromIndex: number, toIndex: number) => void;

  patchActive: (patch: Partial<DocState>) => void;
  patchDoc: (id: string, patch: Partial<DocState>) => void;
  setContent: (content: string) => void;
  setDocContent: (id: string, content: string) => void;
  setCursor: (line: number, col: number) => void;
  setDocCursor: (id: string, line: number, col: number) => void;
  setSelectionLength: (length: number) => void;
  setDocSelectionLength: (id: string, length: number) => void;
  setHeadings: (headings: HeadingItem[]) => void;
  setDocHeadings: (id: string, headings: HeadingItem[]) => void;
  setDocScrollTop: (id: string, scrollTop: number) => void;
  markSaved: (path: string, modifiedAt: number, size: number) => void;
  applyDiskReload: (content: string, modifiedAt: number, size: number) => void;
}

const VIEW_CYCLE: ViewMode[] = ["preview", "source", "split"];

export const useAppStore = create<AppStore>((set, get) => ({
  docs: [],
  activeId: null,
  viewMode: "split",
  outlineVisible: true,
  searchVisible: false,
  searchQuery: "",
  searchCaseSensitive: false,
  recentFiles: [],
  syncScroll: true,
  gameOpen: false,
  layout: { split: false, activePane: 0, ratio: 0.5 },
  activeIds: [null, null],

  setViewMode: (mode) => set({ viewMode: mode }),

  cycleViewMode: () => {
    const current = get().viewMode;
    const idx = VIEW_CYCLE.indexOf(current);
    set({ viewMode: VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length] });
  },

  toggleOutline: () => set((s) => ({ outlineVisible: !s.outlineVisible })),
  setOutlineVisible: (visible) => set({ outlineVisible: visible }),
  setSearchVisible: (visible) =>
    set(visible ? { searchVisible: true } : { searchVisible: false, searchQuery: "" }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchCaseSensitive: (value) => set({ searchCaseSensitive: value }),
  setRecentFiles: (files) => set({ recentFiles: files }),
  toggleSyncScroll: () => set((s) => ({ syncScroll: !s.syncScroll })),

  openGame: () => set({ gameOpen: true, searchVisible: false, searchQuery: "" }),
  closeGame: () => set({ gameOpen: false }),

  setLayout: (partial) =>
    set((s) => ({ layout: { ...s.layout, ...partial } })),

  toggleSplit: () => {
    const { docs, layout, activeIds, activeId } = get();
    if (layout.split) {
      // 收回单栏：将右栏所有文档归入左栏
      const nextDocs = docs.map((d) => ({ ...d, pane: 0 as const }));
      const nextActiveId = activeIds[0] ?? activeIds[1] ?? (nextDocs[0]?.id || null);
      set({
        docs: nextDocs,
        layout: { ...layout, split: false, activePane: 0 },
        activeIds: [nextActiveId, null],
        activeId: nextActiveId,
      });
    } else {
      // 开启双栏：若有多个文档，将当前活动或最后一个文档移到右栏
      if (docs.length >= 2) {
        const moveDocId = activeId ?? docs[docs.length - 1].id;
        const nextDocs = docs.map((d) =>
          d.id === moveDocId ? { ...d, pane: 1 as const } : d,
        );
        const leftDoc = nextDocs.find((d) => (d.pane ?? 0) === 0);
        set({
          docs: nextDocs,
          layout: { ...layout, split: true, activePane: 1 },
          activeIds: [leftDoc?.id ?? null, moveDocId],
          activeId: moveDocId,
        });
      } else {
        set({
          layout: { ...layout, split: true, activePane: 0 },
        });
      }
    }
  },

  setActivePane: (pane) =>
    set((s) => ({
      layout: { ...s.layout, activePane: pane },
      activeId: s.activeIds[pane] ?? s.activeId,
    })),

  setPaneRatio: (ratio) =>
    set((s) => ({
      layout: { ...s.layout, ratio: Math.min(0.8, Math.max(0.2, ratio)) },
    })),

  moveDocToPane: (id, targetPane) => {
    const { docs, activeIds, layout } = get();
    const target = docs.find((d) => d.id === id);
    if (!target || target.pane === targetPane) return;
    const oldPane = target.pane ?? 0;

    let nextDocs = docs.map((d) => (d.id === id ? { ...d, pane: targetPane } : d));

    const remainingOld = nextDocs.filter((d) => (d.pane ?? 0) === oldPane);

    // 如果某一栏只剩最后一个标签，拖动后，双栏显示自动变单栏
    if (remainingOld.length === 0) {
      nextDocs = nextDocs.map((d) => ({ ...d, pane: 0 as const }));
      set({
        docs: nextDocs,
        activeIds: [id, null],
        activeId: id,
        layout: { ...layout, split: false, activePane: 0 },
      });
      return;
    }

    let nextActiveOld = activeIds[oldPane];
    if (activeIds[oldPane] === id) {
      nextActiveOld = remainingOld.length > 0 ? remainingOld[0].id : null;
    }

    const nextActiveIds: [string | null, string | null] = [
      targetPane === 0 ? id : nextActiveOld,
      targetPane === 1 ? id : nextActiveOld,
    ];

    set({
      docs: nextDocs,
      activeIds: nextActiveIds,
      activeId: id,
      layout: { ...layout, split: true, activePane: targetPane },
    });
  },

  addDoc: (doc) => {
    const currentPane = get().layout.activePane;
    const docPane = doc.pane ?? currentPane;
    const finalDoc: DocState = { ...doc, pane: docPane };
    const activeIds = [...get().activeIds] as [string | null, string | null];
    activeIds[docPane] = finalDoc.id;
    set((s) => ({
      docs: [...s.docs, finalDoc],
      activeIds,
      activeId: finalDoc.id,
      gameOpen: false,
    }));
  },

  activateDoc: (id, targetPane) => {
    const { docs, activeIds, layout } = get();
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    const destPane = targetPane !== undefined ? targetPane : target.pane ?? 0;
    let nextDocs = docs;
    if (target.pane !== destPane) {
      nextDocs = docs.map((d) => (d.id === id ? { ...d, pane: destPane } : d));
    }

    const nextActiveIds: [string | null, string | null] = [
      destPane === 0 ? id : activeIds[0],
      destPane === 1 ? id : activeIds[1],
    ];

    set({
      docs: nextDocs,
      activeIds: nextActiveIds,
      activeId: id,
      layout: { ...layout, activePane: destPane },
      searchVisible: false,
      searchQuery: "",
      gameOpen: false,
    });
  },

  closeDoc: (id) => {
    const { docs, activeIds, layout } = get();
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    const targetPane = target.pane ?? 0;
    const nextDocs = docs.filter((d) => d.id !== id);

    const paneDocs = nextDocs.filter((d) => (d.pane ?? 0) === targetPane);
    let nextActiveForPane = activeIds[targetPane];
    if (activeIds[targetPane] === id) {
      const prevPaneDocs = docs.filter((d) => (d.pane ?? 0) === targetPane);
      const idx = prevPaneDocs.findIndex((d) => d.id === id);
      nextActiveForPane =
        paneDocs.length === 0
          ? null
          : paneDocs[Math.min(Math.max(0, idx), paneDocs.length - 1)].id;
    }

    const nextActiveIds: [string | null, string | null] = [
      targetPane === 0 ? nextActiveForPane : activeIds[0],
      targetPane === 1 ? nextActiveForPane : activeIds[1],
    ];

    let nextSplit = layout.split;
    let nextActivePane = layout.activePane;
    let adjustedDocs = nextDocs;

    if (nextSplit) {
      const p0Count = adjustedDocs.filter((d) => (d.pane ?? 0) === 0).length;
      const p1Count = adjustedDocs.filter((d) => d.pane === 1).length;
      if (p1Count === 0) {
        nextSplit = false;
        nextActivePane = 0;
        nextActiveIds[1] = null;
      } else if (p0Count === 0) {
        adjustedDocs = adjustedDocs.map((d) => ({ ...d, pane: 0 as const }));
        nextActiveIds[0] = nextActiveIds[1];
        nextActiveIds[1] = null;
        nextSplit = false;
        nextActivePane = 0;
      }
    }

    const nextActiveId = nextActiveIds[nextActivePane] ?? nextActiveIds[0] ?? nextActiveIds[1];

    set({
      docs: adjustedDocs,
      activeIds: nextActiveIds,
      activeId: nextActiveId,
      layout: { ...layout, split: nextSplit, activePane: nextActivePane },
    });
  },

  closeOtherDocs: (id) => {
    const { docs, activeIds } = get();
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    const pane = target.pane ?? 0;
    const nextDocs = docs.filter((d) => (d.pane ?? 0) !== pane || d.id === id);
    const nextActiveIds: [string | null, string | null] = [
      pane === 0 ? id : activeIds[0],
      pane === 1 ? id : activeIds[1],
    ];
    set({ docs: nextDocs, activeIds: nextActiveIds, activeId: id });
  },

  closeRightDocs: (id) => {
    const { docs, activeIds, layout } = get();
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    const pane = target.pane ?? 0;
    const paneDocs = docs.filter((d) => (d.pane ?? 0) === pane);
    const targetIdx = paneDocs.findIndex((d) => d.id === id);
    if (targetIdx < 0) return;
    const keepPaneDocs = new Set(paneDocs.slice(0, targetIdx + 1).map((d) => d.id));
    const nextDocs = docs.filter((d) => (d.pane ?? 0) !== pane || keepPaneDocs.has(d.id));
    let nextActiveForPane = activeIds[pane];
    if (!keepPaneDocs.has(nextActiveForPane ?? "")) {
      nextActiveForPane = id;
    }
    const nextActiveIds: [string | null, string | null] = [
      pane === 0 ? nextActiveForPane : activeIds[0],
      pane === 1 ? nextActiveForPane : activeIds[1],
    ];
    set({
      docs: nextDocs,
      activeIds: nextActiveIds,
      activeId: nextActiveIds[layout.activePane] ?? id,
    });
  },

  closeAllDocs: () =>
    set({
      docs: [],
      activeIds: [null, null],
      activeId: null,
      layout: { split: false, activePane: 0, ratio: 0.5 },
    }),

  reorderDocs: (pane, fromIndex, toIndex) => {
    const { docs } = get();
    const paneDocs = docs.filter((d) => (d.pane ?? 0) === pane);
    const otherDocs = docs.filter((d) => (d.pane ?? 0) !== pane);
    if (
      fromIndex < 0 ||
      fromIndex >= paneDocs.length ||
      toIndex < 0 ||
      toIndex >= paneDocs.length
    )
      return;
    const [moved] = paneDocs.splice(fromIndex, 1);
    paneDocs.splice(toIndex, 0, moved);
    set({ docs: [...paneDocs, ...otherDocs] });
  },

  patchActive: (patch) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === s.activeId ? { ...d, ...patch } : d)),
    })),

  patchDoc: (id, patch) =>
    set((s) => ({
      docs: s.docs.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch };
        // 内容变化时自动重算脏标记
        if (patch.content !== undefined && patch.savedContent === undefined) {
          next.isDirty = next.content !== next.savedContent;
        }
        return next;
      }),
    })),

  setContent: (content) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId
          ? { ...d, content, isDirty: content !== d.savedContent }
          : d,
      ),
    })),

  setDocContent: (id, content) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id
          ? { ...d, content, isDirty: content !== d.savedContent }
          : d,
      ),
    })),

  setCursor: (line, col) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, cursorLine: line, cursorCol: col } : d,
      ),
    })),

  setDocCursor: (id, line, col) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, cursorLine: line, cursorCol: col } : d,
      ),
    })),

  setSelectionLength: (length) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, selectionLength: length } : d,
      ),
    })),

  setDocSelectionLength: (id, length) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, selectionLength: length } : d,
      ),
    })),

  setHeadings: (headings) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === s.activeId ? { ...d, headings } : d)),
    })),

  setDocHeadings: (id, headings) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, headings } : d)),
    })),

  setDocScrollTop: (id, scrollTop) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, scrollTop } : d)),
    })),

  markSaved: (path, modifiedAt, size) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId
          ? {
              ...d,
              filePath: path,
              savedContent: d.content,
              isDirty: false,
              modifiedAt,
              size,
            }
          : d,
      ),
    })),

  applyDiskReload: (content, modifiedAt, size) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId
          ? {
              ...d,
              content,
              savedContent: content,
              isDirty: false,
              modifiedAt,
              size,
              readOnly: size > LARGE_FILE_BYTES,
            }
          : d,
      ),
    })),
}));

/** 当前活动文档（无文档时为 null） */
export function useActiveDoc(): DocState | null {
  return useAppStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
}

/** 非响应式地读取当前文档 */
export function getActiveDoc(): DocState | null {
  const s = useAppStore.getState();
  return s.docs.find((d) => d.id === s.activeId) ?? null;
}

export function getDocById(id: string): DocState | null {
  return useAppStore.getState().docs.find((d) => d.id === id) ?? null;
}
