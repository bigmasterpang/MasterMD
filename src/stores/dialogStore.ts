import { create } from "zustand";
import type {
  ConflictChoice,
  ConfirmRequest,
  UnsavedChoice,
} from "../types";

interface UnsavedState {
  open: boolean;
  name: string;
  resolve: ((choice: UnsavedChoice) => void) | null;
}

interface ConflictState {
  open: boolean;
  name: string;
  resolve: ((choice: ConflictChoice) => void) | null;
}

interface ConfirmState {
  open: boolean;
  request: ConfirmRequest | null;
  resolve: ((ok: boolean) => void) | null;
}

interface MessageState {
  open: boolean;
  title: string;
  text: string;
  resolve: (() => void) | null;
}

interface DialogStore {
  unsaved: UnsavedState;
  conflict: ConflictState;
  confirm: ConfirmState;
  message: MessageState;
  settingsVisible: boolean;
  shortcutsVisible: boolean;

  setSettingsVisible: (visible: boolean) => void;
  setShortcutsVisible: (visible: boolean) => void;
  setUnsaved: (patch: Partial<UnsavedState>) => void;
  setConflict: (patch: Partial<ConflictState>) => void;
  setConfirm: (patch: Partial<ConfirmState>) => void;
  setMessage: (patch: Partial<MessageState>) => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  unsaved: { open: false, name: "", resolve: null },
  conflict: { open: false, name: "", resolve: null },
  confirm: { open: false, request: null, resolve: null },
  message: { open: false, title: "", text: "", resolve: null },
  settingsVisible: false,
  shortcutsVisible: false,

  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
  setShortcutsVisible: (visible) => set({ shortcutsVisible: visible }),
  setUnsaved: (patch) => set((s) => ({ unsaved: { ...s.unsaved, ...patch } })),
  setConflict: (patch) => set((s) => ({ conflict: { ...s.conflict, ...patch } })),
  setConfirm: (patch) => set((s) => ({ confirm: { ...s.confirm, ...patch } })),
  setMessage: (patch) => set((s) => ({ message: { ...s.message, ...patch } })),
}));

/** 询问用户是否保存未保存的变更 */
export function askUnsaved(name: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    useDialogStore.getState().setUnsaved({ open: true, name, resolve });
  });
}

/** 外部修改冲突处理 */
export function askConflict(name: string): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    useDialogStore.getState().setConflict({ open: true, name, resolve });
  });
}

/** 通用确认框 */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().setConfirm({ open: true, request, resolve });
  });
}

/** 通用提示框 */
export function showMessage(title: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().setMessage({ open: true, title, text, resolve });
  });
}
