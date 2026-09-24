import { useEffect, useRef, useState } from "react";
import type * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { useAppStore } from "../../stores/appStore";
import { askConfirm, showMessage } from "../../stores/dialogStore";
import { fileName } from "../../utils/filePath";
import { invoke } from "@tauri-apps/api/core";

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
    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
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

/** 对选中文字绘制高亮矩形并保存至 PDF 二进制 */
export async function highlightPdfText(
  docId: string,
  pageNum: number,
  clientRects: DOMRect[],
  pageBoundingRect: DOMRect,
  colorType: "yellow" | "green" | "pink" = "yellow",
): Promise<boolean> {
  const doc = useAppStore.getState().docs.find((d) => d.id === docId);
  if (!doc?.pdfBase64 || clientRects.length === 0) return false;

  try {
    const rawBytes = base64ToBytes(doc.pdfBase64);
    const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPage(pageNum - 1);
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;

    const colorMap = {
      yellow: rgb(1, 0.92, 0.23),
      green: rgb(0.3, 0.9, 0.4),
      pink: rgb(1, 0.45, 0.75),
    };
    const drawColor = colorMap[colorType] || colorMap.yellow;

    for (const r of clientRects) {
      if (r.width <= 0 || r.height <= 0) continue;
      const xPercent = Math.max(0, ((r.left - pageBoundingRect.left) / pageBoundingRect.width) * 100);
      const yPercent = Math.max(0, ((r.top - pageBoundingRect.top) / pageBoundingRect.height) * 100);
      const wPercent = Math.min(100, (r.width / pageBoundingRect.width) * 100);
      const hPercent = Math.min(100, (r.height / pageBoundingRect.height) * 100);

      const pdfRect = mapVisualToPdfRect(
        { xPercent, yPercent, wPercent, hPercent },
        width,
        height,
        rotation,
      );

      page.drawRectangle({
        x: pdfRect.x,
        y: pdfRect.y,
        width: pdfRect.width,
        height: pdfRect.height,
        color: drawColor,
        opacity: 0.38,
      });
    }

    const newBytes = await pdfDoc.save();
    const newBase64 = bytesToBase64(newBytes);
    useAppStore.getState().patchDoc(docId, {
      pdfBase64: newBase64,
      isDirty: true,
    });
    return true;
  } catch (err: any) {
    console.error("高亮失败", err);
    await showMessage("高亮失败", String(err));
    return false;
  }
}

/* ---------------- 缩略图渲染组件 ---------------- */

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
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;

        canvas.width = thumbViewport.width;
        canvas.height = thumbViewport.height;

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
