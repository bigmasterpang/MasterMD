import { useEffect, useRef, useState } from "react";
import type * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { useAppStore } from "../../stores/appStore";
import { askConfirm, showMessage } from "../../stores/dialogStore";
import { fileName } from "../../utils/filePath";
import { invoke } from "@tauri-apps/api/core";
import type { PdfHighlight, PdfNote } from "../../types";

export interface PaperTheme {
  id: string;
  name: string;
  color: string;
  preview: string;
  textColor?: string;
}

export const PDF_PAPER_THEMES: PaperTheme[] = [
  { id: "white", name: "纯白", color: "#ffffff", preview: "#ffffff" },
  { id: "warm", name: "暖阳", color: "#f7f1e5", preview: "#f7f1e5" },
  { id: "green", name: "豆沙", color: "#eaf4eb", preview: "#eaf4eb" },
  { id: "parchment", name: "羊皮", color: "#f5eedb", preview: "#f5eedb" },
  { id: "dark", name: "夜间", color: "#18181b", preview: "#27272a" },
];

export interface OutlineItem {
  title: string;
  dest: any;
  items?: OutlineItem[];
  pageIndex?: number;
}

/** Base64 与 Uint8Array 互转 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/* ---------------- 全局 PDF 实例共享与响应式订阅 ---------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

const proxyMap = new Map<string, pdfjsLib.PDFDocumentProxy>();
const outlineMap = new Map<string, OutlineItem[]>();

export function registerPdfDocument(
  docId: string,
  proxy: pdfjsLib.PDFDocumentProxy,
  outline?: OutlineItem[],
) {
  proxyMap.set(docId, proxy);
  if (outline) outlineMap.set(docId, outline);
  listeners.forEach((l) => l());
}

export function unregisterPdfDocument(docId: string) {
  proxyMap.delete(docId);
  outlineMap.delete(docId);
  listeners.forEach((l) => l());
}

export function usePdfProxy(docId: string | null | undefined): pdfjsLib.PDFDocumentProxy | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);
  return docId ? proxyMap.get(docId) ?? null : null;
}

export function usePdfOutline(docId: string | null | undefined): OutlineItem[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);
  return docId ? outlineMap.get(docId) ?? [] : [];
}

/** 请求 PDF 视口跳转到指定页面 */
export function jumpToPdfPage(docId: string, pageNum: number) {
  window.dispatchEvent(
    new CustomEvent("pdf-jump-to-page", {
      detail: { docId, pageNum },
    }),
  );
  useAppStore.getState().patchDoc(docId, { pdfCurrentPage: pageNum });
}

/* ---------------- PDF 高亮标注（动态、可撤销/取消） ---------------- */

/** 添加高亮标注 */
/** 添加高亮标注（支持同时附加批注文本） */
/**
 * 智能合并同行的相邻或微小重叠高亮矩形，彻底杜绝跨 span 接缝导致的颜色叠加加深
 */
export function mergeHighlightRects(
  rawRects: Array<{ xPercent: number; yPercent: number; wPercent: number; hPercent: number }>,
): Array<{ xPercent: number; yPercent: number; wPercent: number; hPercent: number }> {
  if (rawRects.length <= 1) return rawRects;

  // 按垂直位置升序排序，同垂直位置按水平位置排序
  const sorted = [...rawRects].sort((a, b) => {
    const diffY = a.yPercent - b.yPercent;
    if (Math.abs(diffY) > 0.4) return diffY;
    return a.xPercent - b.xPercent;
  });

  const merged: Array<{ xPercent: number; yPercent: number; wPercent: number; hPercent: number }> = [];

  for (const curr of sorted) {
    if (merged.length === 0) {
      merged.push({ ...curr });
      continue;
    }

    const prev = merged[merged.length - 1];

    // 判断是否在同一行：两者的垂直中心差小于各自高度的 60%
    const prevCenterY = prev.yPercent + prev.hPercent / 2;
    const currCenterY = curr.yPercent + curr.hPercent / 2;
    const minHeight = Math.min(prev.hPercent, curr.hPercent);
    const isSameLine = Math.abs(prevCenterY - currCenterY) < Math.max(minHeight * 0.6, 0.4);

    // 水平方向上：如果相邻接触、有重叠或缝隙小于等于 1.0%（一个字符间距）
    const prevRight = prev.xPercent + prev.wPercent;
    const currRight = curr.xPercent + curr.wPercent;
    const isHorizontallyTouching = curr.xPercent <= prevRight + 1.0;

    if (isSameLine && isHorizontallyTouching) {
      // 合并两矩形为同一行连续矩形
      const newLeft = Math.min(prev.xPercent, curr.xPercent);
      const newRight = Math.max(prevRight, currRight);
      const newTop = Math.min(prev.yPercent, curr.yPercent);
      const newBottom = Math.max(prev.yPercent + prev.hPercent, curr.yPercent + curr.hPercent);

      prev.xPercent = Number(newLeft.toFixed(3));
      prev.yPercent = Number(newTop.toFixed(3));
      prev.wPercent = Number((newRight - newLeft).toFixed(3));
      prev.hPercent = Number((newBottom - newTop).toFixed(3));
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

export function addPdfHighlight(
  docId: string,
  pageNum: number,
  clientRects: DOMRect[],
  pageBoundingRect: DOMRect,
  colorType: "yellow" | "green" | "pink" = "yellow",
  text?: string,
  comment?: string,
): PdfHighlight | null {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc) return null;

  const rawRects: Array<{ xPercent: number; yPercent: number; wPercent: number; hPercent: number }> = [];
  for (const r of clientRects) {
    if (r.width <= 0 || r.height <= 0) continue;
    const xPercent = Math.max(0, ((r.left - pageBoundingRect.left) / pageBoundingRect.width) * 100);
    const yPercent = Math.max(0, ((r.top - pageBoundingRect.top) / pageBoundingRect.height) * 100);
    const wPercent = Math.min(100, (r.width / pageBoundingRect.width) * 100);
    const hPercent = Math.min(100, (r.height / pageBoundingRect.height) * 100);
    rawRects.push({ xPercent, yPercent, wPercent, hPercent });
  }

  if (rawRects.length === 0) return null;

  // 关键优化：智能合并同行碎片矩形，消除选区跨 span 接缝重叠变暗问题
  const rects = mergeHighlightRects(rawRects);

  const newHighlight: PdfHighlight = {
    id: `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    page: pageNum,
    rects,
    color: colorType,
    text,
    comment,
    createdAt: Date.now(),
  };

  const existing = doc.pdfHighlights ?? [];
  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: [...existing, newHighlight],
    isDirty: true,
  });
  return newHighlight;
}

/** 更新高亮标注（内容批注、颜色等） */
export function updatePdfHighlight(docId: string, highlightId: string, patch: Partial<PdfHighlight>) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc || !doc.pdfHighlights) return;
  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: doc.pdfHighlights.map((h) => (h.id === highlightId ? { ...h, ...patch } : h)),
    isDirty: true,
  });
}

/** 批量删除标注与便签 */
export function batchDeletePdfAnnotations(
  docId: string,
  targetIds: { highlightIds?: string[]; noteIds?: string[] },
) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc) return;

  const hlSet = new Set(targetIds.highlightIds ?? []);
  const noteSet = new Set(targetIds.noteIds ?? []);

  const nextHighlights = (doc.pdfHighlights ?? []).filter((h) => !hlSet.has(h.id));
  const nextNotes = (doc.pdfNotes ?? []).filter((n) => !noteSet.has(n.id));

  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: nextHighlights,
    pdfNotes: nextNotes,
    isDirty: true,
  });
}

/** 聚焦并打开指定标注或便签 */
export function focusPdfAnnotation(
  docId: string,
  pageNum: number,
  annotationId: string,
  type: "highlight" | "note",
) {
  jumpToPdfPage(docId, pageNum);
  window.dispatchEvent(
    new CustomEvent("pdf-focus-annotation", {
      detail: { docId, pageNum, annotationId, type },
    }),
  );
}

/** 移除单个高亮标注（支持撤销/取消） */
export function removePdfHighlight(docId: string, highlightId: string) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc || !doc.pdfHighlights) return;
  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: doc.pdfHighlights.filter((h) => h.id !== highlightId),
    isDirty: true,
  });
}

/** 清除指定页面的所有高亮标注 */
export function clearPageHighlights(docId: string, pageNum: number) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc || !doc.pdfHighlights) return;
  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: doc.pdfHighlights.filter((h) => h.page !== pageNum),
    isDirty: true,
  });
}

/** 清除文档内的所有高亮标注 */
export function clearAllHighlights(docId: string) {
  useAppStore.getState().patchDoc(docId, {
    pdfHighlights: [],
    isDirty: true,
  });
}

/* ---------------- PDF 便签附注（图钉笔记） ---------------- */

/** 添加便签附注图钉 */
export function addPdfNote(
  docId: string,
  pageNum: number,
  xPercent: number,
  yPercent: number,
  content = "",
  color: "yellow" | "blue" | "green" | "purple" = "yellow",
): PdfNote {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  const newNote: PdfNote = {
    id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    page: pageNum,
    xPercent: Number(xPercent.toFixed(2)),
    yPercent: Number(yPercent.toFixed(2)),
    content,
    color,
    createdAt: Date.now(),
  };

  const existing = doc?.pdfNotes ?? [];
  useAppStore.getState().patchDoc(docId, {
    pdfNotes: [...existing, newNote],
    isDirty: true,
  });
  return newNote;
}

/** 更新便签附注内容或颜色 */
export function updatePdfNote(docId: string, noteId: string, patch: Partial<PdfNote>) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc || !doc.pdfNotes) return;
  useAppStore.getState().patchDoc(docId, {
    pdfNotes: doc.pdfNotes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    isDirty: true,
  });
}

/** 删除便签附注 */
export function deletePdfNote(docId: string, noteId: string) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc || !doc.pdfNotes) return;
  useAppStore.getState().patchDoc(docId, {
    pdfNotes: doc.pdfNotes.filter((n) => n.id !== noteId),
    isDirty: true,
  });
}

/** 复制当前页面 Canvas 为高精 PNG 图片到系统剪贴板 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        resolve(true);
      } catch (err) {
        console.error("复制图片到剪贴板失败", err);
        resolve(false);
      }
    }, "image/png");
  });
}

/** 保存时将高亮矩形真正烘焙绘制入 PDF 二进制中 */
export async function burnHighlightsToPdf(
  base64Data: string,
  highlights: PdfHighlight[],
): Promise<string> {
  if (!highlights || highlights.length === 0) return base64Data;
  try {
    const rawBytes = base64ToBytes(base64Data);
    const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const numPages = pdfDoc.getPageCount();

    const colorMap = {
      yellow: rgb(1, 0.92, 0.23),
      green: rgb(0.3, 0.9, 0.4),
      pink: rgb(1, 0.45, 0.75),
    };

    for (const hl of highlights) {
      if (hl.page < 1 || hl.page > numPages) continue;
      const page = pdfDoc.getPage(hl.page - 1);
      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;
      const drawColor = colorMap[hl.color] || colorMap.yellow;

      for (const r of hl.rects) {
        const pdfRect = mapVisualToPdfRect(r, width, height, rotation);
        page.drawRectangle({
          x: pdfRect.x,
          y: pdfRect.y,
          width: pdfRect.width,
          height: pdfRect.height,
          color: drawColor,
          opacity: 0.38,
        });
      }
    }

    const newBytes = await pdfDoc.save();
    return bytesToBase64(newBytes);
  } catch (err) {
    console.error("绘制高亮矩形失败", err);
    return base64Data;
  }
}

/* ---------------- PDF 编辑操作 ---------------- */

/** 旋转指定页面（顺时针/逆时针 90 度） */
export async function rotatePdfPage(docId: string, pageNum: number, clockwise = true) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64) return;
  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPage(pageNum - 1);
    const current = page.getRotation().angle;
    const nextAngle = (current + (clockwise ? 90 : 270)) % 360;
    page.setRotation(degrees(nextAngle));

    const newBytes = await pdfDoc.save();
    const newBase64 = bytesToBase64(newBytes);
    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
      cleanPdfBase64: newBase64,
      pdfCurrentPage: pageNum,
      isDirty: true,
    });
  } catch (err: any) {
    await showMessage("旋转页面失败", String(err));
  }
}

/** 旋转全部页面 */
export async function rotateAllPdfPages(docId: string, clockwise = true) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64) return;
  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const current = page.getRotation().angle;
      const nextAngle = (current + (clockwise ? 90 : 270)) % 360;
      page.setRotation(degrees(nextAngle));
    }

    const newBytes = await pdfDoc.save();
    const newBase64 = bytesToBase64(newBytes);
    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
      cleanPdfBase64: newBase64,
      pdfCurrentPage: doc.pdfCurrentPage ?? 1,
      isDirty: true,
    });
  } catch (err: any) {
    await showMessage("旋转全部页面失败", String(err));
  }
}

/** 删除指定页面 */
export async function deletePdfPage(docId: string, pageNum: number) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64) return;
  const numPages = doc.pdfTotalPages ?? 1;
  if (numPages <= 1) {
    await showMessage("无法删除", "文档仅剩 1 页，无法继续删除。");
    return;
  }
  const ok = await askConfirm({
    title: "删除页面",
    message: `确定要删除第 ${pageNum} 页吗？删除后可使用 Ctrl+S 保存。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;

  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    pdfDoc.removePage(pageNum - 1);

    const newBytes = await pdfDoc.save();
    const newBase64 = bytesToBase64(newBytes);

    // 重新映射受影响的高亮标注页码
    const updatedHighlights = (doc.pdfHighlights ?? [])
      .filter((h) => h.page !== pageNum)
      .map((h) => (h.page > pageNum ? { ...h, page: h.page - 1 } : h));

    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
      cleanPdfBase64: newBase64,
      pdfHighlights: updatedHighlights,
      isDirty: true,
      pdfTotalPages: numPages - 1,
      pdfCurrentPage: Math.min(doc.pdfCurrentPage ?? 1, numPages - 1),
    });
  } catch (err: any) {
    await showMessage("删除页面失败", String(err));
  }
}

/** 提取指定页并另存为独立 PDF */
export async function extractPdfPage(docId: string, pageNum: number) {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64) return;
  const docName = doc.filePath ? fileName(doc.filePath) : "PDF 文档";

  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(srcDoc, [pageNum - 1]);
    newPdf.addPage(copiedPage);
    const newBytes = await newPdf.save();
    const newBase64 = bytesToBase64(newBytes);

    const defaultName = `${docName.replace(/\.pdf$/i, "")}_第${pageNum}页.pdf`;
    const targetPath = await invoke<string | null>("save_file_dialog", {
      defaultPath: defaultName,
      filterPdf: true,
    });
    if (!targetPath) return;

    await invoke("write_binary_file", {
      path: targetPath,
      base64: newBase64,
      encryptedHeader: null,
    });
    await showMessage("提取成功", `已成功将第 ${pageNum} 页保存到：\n${targetPath}`);
  } catch (err: any) {
    await showMessage("提取页面失败", String(err));
  }
}

/** 页面拖拽重排 */
export async function reorderPdfPages(docId: string, fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return;
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64) return;
  const numPages = doc.pdfTotalPages ?? 1;

  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const order = Array.from({ length: numPages }, (_, i) => i);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    const copiedPages = await newDoc.copyPages(srcDoc, order);
    copiedPages.forEach((p) => newDoc.addPage(p));

    const newBytes = await newDoc.save();
    const newBase64 = bytesToBase64(newBytes);
    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
      cleanPdfBase64: newBase64,
      isDirty: true,
    });
  } catch (err: any) {
    await showMessage("重排页面失败", String(err));
  }
}

/**
 * 将视口百分比坐标映射为 PDF 坐标系统（考虑不同旋转角度 0/90/180/270）
 */
export function mapVisualToPdfRect(
  r: { xPercent: number; yPercent: number; wPercent: number; hPercent: number },
  pageWidth: number,
  pageHeight: number,
  rotationAngle: number,
): { x: number; y: number; width: number; height: number } {
  const normAngle = ((rotationAngle % 360) + 360) % 360;
  if (normAngle === 90) {
    const vx = (r.xPercent / 100) * pageHeight;
    const vy = (r.yPercent / 100) * pageWidth;
    const vw = (r.wPercent / 100) * pageHeight;
    const vh = (r.hPercent / 100) * pageWidth;
    return {
      x: pageWidth - vy - vh,
      y: vx,
      width: vh,
      height: vw,
    };
  } else if (normAngle === 180) {
    const vx = (r.xPercent / 100) * pageWidth;
    const vy = (r.yPercent / 100) * pageHeight;
    const vw = (r.wPercent / 100) * pageWidth;
    const vh = (r.hPercent / 100) * pageHeight;
    return {
      x: pageWidth - vx - vw,
      y: vy,
      width: vw,
      height: vh,
    };
  } else if (normAngle === 270) {
    const vx = (r.xPercent / 100) * pageHeight;
    const vy = (r.yPercent / 100) * pageWidth;
    const vw = (r.wPercent / 100) * pageHeight;
    const vh = (r.hPercent / 100) * pageWidth;
    return {
      x: vy,
      y: pageHeight - vx - vw,
      width: vh,
      height: vw,
    };
  } else {
    // 0 度
    const vx = (r.xPercent / 100) * pageWidth;
    const vy = (r.yPercent / 100) * pageHeight;
    const vw = (r.wPercent / 100) * pageWidth;
    const vh = (r.hPercent / 100) * pageHeight;
    return {
      x: vx,
      y: pageHeight - vy - vh,
      width: vw,
      height: vh,
    };
  }
}

/* ---------------- 缩略图渲染组件（修复黑色背景） ---------------- */

export function PdfThumbnail({
  pdfProxy,
  pageNum,
  active,
}: {
  pdfProxy: pdfjsLib.PDFDocumentProxy | null;
  pageNum: number;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfProxy) return;
    let cancel = false;
    let renderTask: any = null;

    const render = async () => {
      try {
        const page = await pdfProxy.getPage(pageNum);
        if (cancel) return;

        const viewport = page.getViewport({ scale: 1.0 });
        const targetWidth = 140;
        const thumbScale = targetWidth / viewport.width;
        const thumbViewport = page.getViewport({ scale: thumbScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = thumbViewport.width;
        canvas.height = thumbViewport.height;

        // 立即纯白填充，杜绝黑色闪烁
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvasContext: context,
          viewport: thumbViewport,
        });
        await renderTask.promise;
      } catch {
        /* ignore */
      }
    };

    void render();

    return () => {
      cancel = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfProxy, pageNum]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded bg-white shadow-xs ${
        active ? "ring-2 ring-accent" : ""
      }`}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
