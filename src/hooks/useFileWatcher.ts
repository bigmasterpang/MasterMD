import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { FileChangedPayload } from "../types";
import { useAppStore } from "../stores/appStore";
import { askConflict, showMessage } from "../stores/dialogStore";
import { fileName, samePath } from "../utils/filePath";
import {
  isRecentSelfWrite,
  reloadDocFromDisk,
  saveDocAs,
} from "../utils/fileActions";

/**
 * 文件外部变更监听：
 * - 本地无未保存变更 -> 自动重载
 * - 本地有未保存变更 -> 弹窗让用户选择
 */
export function useFileWatcher(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<FileChangedPayload>("file-changed", async (event) => {
      const payload = event.payload;
      // 自己写入触发的事件直接忽略
      if (isRecentSelfWrite()) return;

      const app = useAppStore.getState();
      const doc = app.docs.find((d) => samePath(d.filePath, payload.path));
      if (!doc) return;

      if (!payload.exists) {
        await showMessage(
          "文件已被删除或移动",
          `「${fileName(payload.path)}」已不存在，请使用「另存为」保存到新的位置。`,
        );
        return;
      }
      if (payload.modifiedAt !== 0 && payload.modifiedAt === doc.modifiedAt) return;

      if (!doc.isDirty) {
        await reloadDocFromDisk(doc.id);
        return;
      }

      const choice = await askConflict(fileName(payload.path));
      if (choice === "external") {
        await reloadDocFromDisk(doc.id);
      } else if (choice === "saveas") {
        await saveDocAs(doc.id);
      } else {
        // 保留本地：更新基线，避免重复弹窗
        useAppStore.getState().patchDoc(doc.id, {
          modifiedAt: payload.modifiedAt,
          size: payload.size,
        });
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
