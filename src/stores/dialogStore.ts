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

export interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  value?: string;
  /** 获得焦点时是否全选内容 */
  autofocus?: boolean;
}

interface FormState {
  open: boolean;
  title: string;
  fields: FormField[];
  confirmText: string;
  resolve: ((values: Record<string, string> | null) => void) | null;
}

export interface PdfPasswordState {
  open: boolean;
  name: string;
  error?: string;
  resolve: ((password: string | null) => void) | null;
}

interface DialogStore {
  unsaved: UnsavedState;
  conflict: ConflictState;
  confirm: ConfirmState;
  message: MessageState;
  form: FormState;
  pdfPassword: PdfPasswordState;
  settingsVisible: boolean;
  shortcutsVisible: boolean;
  aboutVisible: boolean;

  setSettingsVisible: (visible: boolean) => void;
  setShortcutsVisible: (visible: boolean) => void;
  setAboutVisible: (visible: boolean) => void;
  setUnsaved: (patch: Partial<UnsavedState>) => void;
  setConflict: (patch: Partial<ConflictState>) => void;
  setConfirm: (patch: Partial<ConfirmState>) => void;
  setMessage: (patch: Partial<MessageState>) => void;
  setForm: (patch: Partial<FormState>) => void;
  setPdfPassword: (patch: Partial<PdfPasswordState>) => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  unsaved: { open: false, name: "", resolve: null },
  conflict: { open: false, name: "", resolve: null },
  confirm: { open: false, request: null, resolve: null },
  message: { open: false, title: "", text: "", resolve: null },
  form: { open: false, title: "", fields: [], confirmText: "插入", resolve: null },
  pdfPassword: { open: false, name: "", error: undefined, resolve: null },
  settingsVisible: false,
  shortcutsVisible: false,
  aboutVisible: false,

  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
  setShortcutsVisible: (visible) => set({ shortcutsVisible: visible }),
  setAboutVisible: (visible) => set({ aboutVisible: visible }),
  setUnsaved: (patch) => set((s) => ({ unsaved: { ...s.unsaved, ...patch } })),
  setConflict: (patch) => set((s) => ({ conflict: { ...s.conflict, ...patch } })),
  setConfirm: (patch) => set((s) => ({ confirm: { ...s.confirm, ...patch } })),
  setMessage: (patch) => set((s) => ({ message: { ...s.message, ...patch } })),
  setForm: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
  setPdfPassword: (patch) => set((s) => ({ pdfPassword: { ...s.pdfPassword, ...patch } })),
}));

/** 提示用户输入 PDF 解锁密码 */
export function askPdfPassword(name: string, error?: string): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().setPdfPassword({ open: true, name, error, resolve });
  });
}

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

/** 通用表单弹窗（插入链接 / 图片等），取消返回 null */
export function askForm(options: {
  title: string;
  fields: FormField[];
  confirmText?: string;
}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().setForm({
      open: true,
      title: options.title,
      fields: options.fields,
      confirmText: options.confirmText ?? "插入",
      resolve,
    });
  });
}
