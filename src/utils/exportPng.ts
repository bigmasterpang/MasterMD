import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { showMessage } from "../stores/dialogStore";
import { clonePreview, inlineLocalImages } from "./exportShared";

export interface ImageExportOptions {
  source: HTMLElement;
  title: string;
  isDark: boolean;
}

/**
 * 将预览内容光栅化为 PNG data URL。
 * 由于内联了本地图片，且预览 DOM 与页面同源，canvas 不会被污染。
 */
export async function renderPreviewToPng(
  source: HTMLElement,
  isDark: boolean,
): Promise<string> {
  const background = isDark ? "#1e1f22" : "#ffffff";
  const clone = clonePreview(source);
  await inlineLocalImages(clone);

  // 离屏容器：固定宽度保证排版稳定
  const holder = document.createElement("div");
  holder.style.cssText = [
    "position:fixed",
    "left:-20000px",
    "top:0",
    "width:900px",
    `background:${background}`,
    "padding:28px 32px",
    "box-sizing:border-box",
    "z-index:-1",
  ].join(";");
  const content = (clone.querySelector(".md-body") ?? clone) as HTMLElement;
  holder.appendChild(content.cloneNode(true));
  document.body.appendChild(holder);

  try {
    const { toPng } = await import("html-to-image");
    const target = holder.firstElementChild as HTMLElement;
    const options = {
      pixelRatio: 2,
      backgroundColor: background,
      width: 900,
      height: Math.max(target.scrollHeight, 1),
    };
    try {
      return await toPng(target, options);
    } catch {
      // 字体内联失败时退化为跳过字体
      return await toPng(target, { ...options, skipFonts: true });
    }
  } finally {
    holder.remove();
  }
}

/**
 * 导出为 PNG 图片。
 */
export async function exportPngFile(options: ImageExportOptions): Promise<boolean> {
  const { source, title, isDark } = options;
  try {
    const dataUrl = await renderPreviewToPng(source, isDark);
    const base64 = dataUrl.split(",")[1];
    const path = await saveDialog({
      title: "导出为图片",
      defaultPath: `${title}.png`,
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (!path) return false;
    await invoke<number>("write_binary_file", { path, base64 });
    return true;
  } catch (error) {
    await showMessage("导出图片失败", String(error));
    return false;
  }
}
