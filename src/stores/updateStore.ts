import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { tempDir, join } from "@tauri-apps/api/path";
import { checkForUpdate, type UpdateInfo } from "../utils/updateCheck";

interface DownloadResult {
  path: string;
  size: number;
  sha256: string;
}

interface ProgressPayload {
  received: number;
  total: number;
}

interface UpdateState {
  info: UpdateInfo | null;
  checking: boolean;
  error: string | null;
  /** 是否已提示过（避免自动检查反复弹窗） */
  notified: boolean;
  dialogVisible: boolean;

  /** 下载状态 */
  downloading: boolean;
  progress: number;
  received: number;
  total: number;
  downloadedPath: string | null;
  installed: boolean;

  check: (options?: { silent?: boolean }) => Promise<void>;
  showDialog: () => void;
  hideDialog: () => void;
  downloadAndInstall: () => Promise<void>;
  /** 便携版：替换并重启 */
  applyPortableUpdate: () => Promise<void>;
  runInstaller: () => Promise<void>;
  resetDownload: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  info: null,
  checking: false,
  error: null,
  notified: false,
  dialogVisible: false,

  downloading: false,
  progress: 0,
  received: 0,
  total: 0,
  downloadedPath: null,
  installed: false,

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

  /** 下载安装包（边下边校验 SHA-256），完成后自动启动安装程序 */
  downloadAndInstall: async () => {
    const info = get().info;
    if (!info?.downloadUrl) {
      set({ error: "当前更新源不支持应用内下载，请打开发布页面手动下载。" });
      return;
    }
    set({
      downloading: true,
      progress: 0,
      received: 0,
      total: info.size ?? 0,
      error: null,
      downloadedPath: null,
      installed: false,
    });

    const unlisten = await listen<ProgressPayload>("update-progress", (event) => {
      const { received, total } = event.payload;
      set({
        received,
        total: total || received,
        progress: total > 0 ? Math.min(1, received / total) : 0,
      });
    });

    try {
      const dir = await tempDir();
      const filename = info.filename || `mastermd-${info.latest}-setup.exe`;
      const dest = await join(dir, filename);

      const result = await invoke<DownloadResult>("download_update", {
        url: info.downloadUrl,
        dest,
        expectSha256: info.sha256 ?? null,
        expectSize: info.size ?? null,
      });

      set({
        downloading: false,
        progress: 1,
        downloadedPath: result.path,
      });

      // 便携版：直接替换当前程序并重启；安装包：拉起安装向导
      const isInstaller = /setup\.exe$/i.test(info.filename ?? "");
      if (isInstaller) {
        await get().runInstaller();
      } else {
        await get().applyPortableUpdate();
      }
    } catch (error) {
      set({ downloading: false, error: String(error) });
    } finally {
      unlisten();
    }
  },

  /** 便携版自更新：替换 exe 后由新进程接管，当前进程退出 */
  applyPortableUpdate: async () => {
    const path = get().downloadedPath;
    if (!path) return;
    try {
      await invoke("apply_update", { path });
      set({ installed: true });
      // 新版本已启动，关闭当前窗口
      await invoke("confirm_close");
    } catch (error) {
      set({ error: String(error) });
    }
  },

  runInstaller: async () => {
    const path = get().downloadedPath;
    if (!path) return;
    try {
      await invoke("run_installer", { path });
      set({ installed: true });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  resetDownload: () =>
    set({ downloadedPath: null, progress: 0, received: 0, installed: false }),
}));
