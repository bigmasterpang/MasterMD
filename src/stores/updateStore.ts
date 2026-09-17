import { create } from "zustand";
import { checkForUpdate, type UpdateInfo } from "../utils/updateCheck";

interface UpdateState {
  info: UpdateInfo | null;
  checking: boolean;
  error: string | null;
  /** 是否已提示过（避免自动检查反复弹窗） */
  notified: boolean;
  dialogVisible: boolean;

  check: (options?: { silent?: boolean }) => Promise<void>;
  showDialog: () => void;
  hideDialog: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  info: null,
  checking: false,
  error: null,
  notified: false,
  dialogVisible: false,

  check: async (options = {}) => {
    if (get().checking) return;
    set({ checking: true, error: null });
    try {
      const info = await checkForUpdate();
      set({ info, checking: false });
      if (info.hasUpdate && !get().notified) {
        set({ notified: true, dialogVisible: true });
      }
      if (!options.silent && !info.hasUpdate) {
        set({ dialogVisible: true });
      }
    } catch (error) {
      set({ checking: false, error: String(error) });
      if (!options.silent) set({ dialogVisible: true });
    }
  },

  showDialog: () => set({ dialogVisible: true }),
  hideDialog: () => set({ dialogVisible: false }),
}));
