import { create } from "zustand";

export interface TabDragState {
  /** 是否正在拖拽标签 */
  isDragging: boolean;
  /** 被拖拽文档 ID */
  docId: string | null;
  /** 起始分栏 (0 或 1) */
  fromPane: 0 | 1;
  /** 标签展示标题 */
  title: string;
  /** 鼠标全局位置（用于渲染跟随浮动卡片） */
  x: number;
  y: number;
  /** 当前悬停的目标分栏 */
  targetPane: 0 | 1 | null;
  /** 在目标分栏内的插入位置下标 */
  targetIndex: number | null;
}

interface TabDragStore extends TabDragState {
  startDrag: (docId: string, fromPane: 0 | 1, title: string, x: number, y: number) => void;
  updateHover: (x: number, y: number, targetPane: 0 | 1 | null, targetIndex: number | null) => void;
  endDrag: () => void;
}

export const useTabDragStore = create<TabDragStore>((set) => ({
  isDragging: false,
  docId: null,
  fromPane: 0,
  title: "",
  x: 0,
  y: 0,
  targetPane: null,
  targetIndex: null,

  startDrag: (docId, fromPane, title, x, y) =>
    set({
      isDragging: true,
      docId,
      fromPane,
      title,
      x,
      y,
      targetPane: fromPane,
      targetIndex: null,
    }),

  updateHover: (x, y, targetPane, targetIndex) =>
    set((s) => ({
      ...s,
      x,
      y,
      targetPane,
      targetIndex,
    })),

  endDrag: () =>
    set({
      isDragging: false,
      docId: null,
      fromPane: 0,
      title: "",
      targetPane: null,
      targetIndex: null,
    }),
}));
