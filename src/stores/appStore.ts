import { create } from "zustand";
import type {
  DocState,
  FilePayload,
  HeadingItem,
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
    modifiedAt: 0,
    size: 0,
    cursorLine: 1,
    cursorCol: 1,
    selectionLength: 0,
    headings: [],
    frontMatter: null,
    frontMatterRaw: null,
    scrollTop: 0,
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

  addDoc: (doc: DocState) => void;
  activateDoc: (id: string) => void;
  closeDoc: (id: string) => void;
  closeOtherDocs: (id: string) => void;
  closeAllDocs: () => void;

  patchActive: (patch: Partial<DocState>) => void;
  patchDoc: (id: string, patch: Partial<DocState>) => void;
  setContent: (content: string) => void;
  setCursor: (line: number, col: number) => void;
  setSelectionLength: (length: number) => void;
  setHeadings: (headings: HeadingItem[]) => void;
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

  addDoc: (doc) =>
    set((s) => ({ docs: [...s.docs, doc], activeId: doc.id, gameOpen: false })),

  activateDoc: (id) => {
    const { activeId, gameOpen } = get();
    if (activeId === id && !gameOpen) return;
    set({ activeId: id, searchVisible: false, searchQuery: "", gameOpen: false });
  },

  closeDoc: (id) => {
    const { docs, activeId } = get();
    const idx = docs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const next = docs.filter((d) => d.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      nextActive = next.length === 0 ? null : next[Math.min(idx, next.length - 1)].id;
    }
    set({ docs: next, activeId: nextActive });
  },

  closeOtherDocs: (id) =>
    set((s) => ({ docs: s.docs.filter((d) => d.id === id), activeId: id })),

  closeAllDocs: () => set({ docs: [], activeId: null }),

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

  setCursor: (line, col) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, cursorLine: line, cursorCol: col } : d,
      ),
    })),

  setSelectionLength: (length) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, selectionLength: length } : d,
      ),
    })),

  setHeadings: (headings) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === s.activeId ? { ...d, headings } : d)),
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
