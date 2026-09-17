import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { showMessage } from "../stores/dialogStore";

export interface PdfExportOptions {
  title: string;
  /** 打印前回调：用于切换到预览模式、清除搜索高亮等 */
  beforePrint?: () => Promise<void>;
}

/**
 * 导出 PDF：直接调用 WebView2 的 PrintToPdf。
 * 打印样式由 styles.css 的 @media print 负责（隐藏界面、只留正文）。
 */
export async function exportPdfFile(options: PdfExportOptions): Promise<boolean> {
  const path = await saveDialog({
    title: "导出为 PDF",
    defaultPath: `${options.title}.pdf`,
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
  });
  if (!path) return false;

  await options.beforePrint?.();
  // 等待一帧，确保打印样式生效
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    await invoke("print_to_pdf", { path });
    return true;
  } catch (error) {
    await showMessage("导出 PDF 失败", String(error));
    return false;
  }
}
