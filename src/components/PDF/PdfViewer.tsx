import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFDocument, degrees } from "pdf-lib";
import { Icon } from "../common/Icon";
import { useAppStore } from "../../stores/appStore";
import { askConfirm, askPdfPassword, showMessage } from "../../stores/dialogStore";
import { fileName } from "../../utils/filePath";
import { invoke } from "@tauri-apps/api/core";

// 设置 PDF.js Worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  docId: string;
  pane?: 0 | 1;
  isDark: boolean;
}

interface OutlineItem {
  title: string;
  dest: any;
  items?: OutlineItem[];
  pageIndex?: number;
}

/** Base64 与 Uint8Array 互转辅助函数 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function PdfViewer({ docId, isDark }: PdfViewerProps) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState<number>(1.2);
  const [fitMode, setFitMode] = useState<"custom" | "width" | "page">("width");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"thumbnails" | "outline">("thumbnails");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [invertColors, setInvertColors] = useState(false);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const pdfBase64 = doc?.pdfBase64 ?? "";
  const docName = doc?.filePath ? fileName(doc.filePath) : "PDF 文档";

  // 加载 PDF 文档
  const loadPdf = useCallback(
    async (password?: string) => {
      if (!pdfBase64) return;
      setLoading(true);
      setError(null);

      try {
        const rawBytes = base64ToBytes(pdfBase64);
        const loadingTask = pdfjsLib.getDocument({
          data: rawBytes,
          password: password ?? doc?.pdfPassword,
          cMapUrl: "https://unpkg.com/pdfjs-dist@3.11.174/cmaps/",
          cMapPacked: true,
        });

        // 密码回调处理
        loadingTask.onPassword = async (updatePassword: (pw: string) => void, reason: number) => {
          const errMsg = reason === 2 ? "密码不正确，请重新输入" : undefined;
          const pw = await askPdfPassword(docName, errMsg);
          if (pw !== null) {
            updatePassword(pw);
            useAppStore.getState().patchDoc(docId, { pdfPassword: pw });
          } else {
            setError("需要密码才能查看此 PDF 文档。");
            setLoading(false);
          }
        };

        const proxy = await loadingTask.promise;
        setPdfProxy(proxy);
        setNumPages(proxy.numPages);
        useAppStore.getState().patchDoc(docId, {
          pdfTotalPages: proxy.numPages,
          pdfCurrentPage: 1,
        });

        // 提取大纲书签
        try {
          const rawOutline = await proxy.getOutline();
          if (rawOutline && rawOutline.length > 0) {
            // 解析大纲目标页码
            const parsedOutline: OutlineItem[] = [];
            for (const item of rawOutline) {
              let pageIdx: number | undefined;
              if (item.dest) {
                try {
                  let destRef: any = item.dest;
                  if (typeof destRef === "string") {
                    destRef = (await proxy.getDestination(destRef)) as any;
                  }
                  if (Array.isArray(destRef) && destRef[0]) {
                    pageIdx = (await proxy.getPageIndex(destRef[0])) + 1;
                  }
                } catch {
                  /* ignore */
                }
              }
              parsedOutline.push({
                title: item.title,
                dest: item.dest,
                pageIndex: pageIdx,
              });
            }
            setOutline(parsedOutline);
          } else {
            setOutline([]);
          }
        } catch {
          setOutline([]);
        }

        setLoading(false);
      } catch (err: any) {
        console.error("加载 PDF 失败", err);
        if (err?.name === "PasswordException") {
          setError("需要密码才能查看此 PDF 文档。");
        } else {
          setError(`加载 PDF 失败: ${err?.message || String(err)}`);
        }
        setLoading(false);
      }
    },
    [pdfBase64, doc?.pdfPassword, docName, docId],
  );

  useEffect(() => {
    void loadPdf();
  }, [loadPdf]);

  // 适应页面宽度计算
  const updateFitWidth = useCallback(async () => {
    if (!pdfProxy || !containerRef.current) return;
    try {
      const page = await pdfProxy.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current.clientWidth - (sidebarOpen ? 240 : 0) - 64;
      if (containerWidth > 0 && viewport.width > 0) {
        const newScale = Math.max(0.4, Math.min(3.0, containerWidth / viewport.width));
        setScale(newScale);
        setFitMode("width");
        useAppStore.getState().patchDoc(docId, { pdfScale: "width" });
      }
    } catch {
      /* ignore */
    }
  }, [pdfProxy, currentPage, sidebarOpen, docId]);

  // 适应整页高度计算
  const updateFitPage = useCallback(async () => {
    if (!pdfProxy || !containerRef.current) return;
    try {
      const page = await pdfProxy.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerHeight = containerRef.current.clientHeight - 64;
      if (containerHeight > 0 && viewport.height > 0) {
        const newScale = Math.max(0.4, Math.min(3.0, containerHeight / viewport.height));
        setScale(newScale);
        setFitMode("page");
        useAppStore.getState().patchDoc(docId, { pdfScale: "page" });
      }
    } catch {
      /* ignore */
    }
  }, [pdfProxy, currentPage, docId]);

  useEffect(() => {
    if (fitMode === "width") {
      void updateFitWidth();
    } else if (fitMode === "page") {
      void updateFitPage();
    }
  }, [fitMode, sidebarOpen]);

  // 视口滚动监听以追踪当前页码
  const handleScroll = () => {
    if (!containerRef.current) return;
    const containerTop = containerRef.current.getBoundingClientRect().top;
    let closestPage = 1;
    let minDistance = Infinity;

    pageRefs.current.forEach((el, pNum) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - containerTop - 40);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = pNum;
      }
    });

    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
      useAppStore.getState().patchDoc(docId, { pdfCurrentPage: closestPage });
    }
  };

  // 跳转到指定页面
  const scrollToPage = (pageNum: number) => {
    const safePage = Math.max(1, Math.min(numPages, pageNum));
    const targetEl = pageRefs.current.get(safePage);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(safePage);
      useAppStore.getState().patchDoc(docId, { pdfCurrentPage: safePage });
    }
  };

  /* ---------------------- PDF 编辑操作 (使用 pdf-lib) ---------------------- */

  // 旋转指定页面（顺时针 90 度）
  const rotatePage = async (pageNum: number, clockwise = true) => {
    try {
      const rawBytes = base64ToBytes(pdfBase64);
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
  };

  // 旋转全部页面
  const rotateAllPages = async (clockwise = true) => {
    try {
      const rawBytes = base64ToBytes(pdfBase64);
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
  };

  // 删除指定页面
  const deletePage = async (pageNum: number) => {
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
      const rawBytes = base64ToBytes(pdfBase64);
      const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      pdfDoc.removePage(pageNum - 1);

      const newBytes = await pdfDoc.save();
      const newBase64 = bytesToBase64(newBytes);
      useAppStore.getState().patchDoc(docId, {
        pdfBase64: newBase64,
        isDirty: true,
        pdfTotalPages: numPages - 1,
        pdfCurrentPage: Math.min(currentPage, numPages - 1),
      });
    } catch (err: any) {
      await showMessage("删除页面失败", String(err));
    }
  };

  // 提取当前页并另存为独立 PDF
  const extractPage = async (pageNum: number) => {
    try {
      const rawBytes = base64ToBytes(pdfBase64);
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
  };

  // 页面拖拽调序完成
  const handleDropPage = async (targetIndex: number) => {
    if (draggedPageIndex === null || draggedPageIndex === targetIndex) return;
    try {
      const rawBytes = base64ToBytes(pdfBase64);
      const srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();

      // 构建新排序下标列表
      const order = Array.from({ length: numPages }, (_, i) => i);
      const [moved] = order.splice(draggedPageIndex, 1);
      order.splice(targetIndex, 0, moved);

      const copiedPages = await newDoc.copyPages(srcDoc, order);
      copiedPages.forEach((p) => newDoc.addPage(p));

      const newBytes = await newDoc.save();
      const newBase64 = bytesToBase64(newBytes);
      setDraggedPageIndex(null);
      useAppStore.getState().patchDoc(docId, {
        pdfBase64: newBase64,
        isDirty: true,
      });
    } catch (err: any) {
      setDraggedPageIndex(null);
      await showMessage("重排页面失败", String(err));
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-panel">
      {/* PDF 顶置工具栏 */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel px-3 text-[12px] text-muted">
        {/* 左侧：侧栏切换 & 页码跳转 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title={sidebarOpen ? "收起缩略图与大纲" : "展开缩略图与大纲"}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex h-7 items-center gap-1 rounded px-2 transition-colors ${
              sidebarOpen ? "bg-accent/15 text-accent font-medium" : "hover:bg-hover hover:text-fg"
            }`}
          >
            <Icon name="grid" size={14} />
            <span className="hidden sm:inline">页面侧栏</span>
          </button>

          <div className="mx-1 h-4 w-px bg-line" />

          {/* 页码选择器 */}
          <button
            type="button"
            title="上一页 (Page Up)"
            disabled={currentPage <= 1}
            onClick={() => scrollToPage(currentPage - 1)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            <Icon name="arrow-up" size={13} />
          </button>

          <div className="flex items-center gap-1">
            <input
              type="text"
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) scrollToPage(val);
              }}
              className="h-6 w-11 rounded border border-line bg-app text-center text-[12px] text-fg outline-none focus:border-accent"
            />
            <span className="text-muted/70">/ {numPages || 1}</span>
          </div>

          <button
            type="button"
            title="下一页 (Page Down)"
            disabled={currentPage >= numPages}
            onClick={() => scrollToPage(currentPage + 1)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            <Icon name="arrow-down" size={13} />
          </button>
        </div>

        {/* 中间：缩放控制 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="缩小 (Ctrl+-)"
            onClick={() => {
              setFitMode("custom");
              setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))));
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-fg"
          >
            <Icon name="zoom-out" size={14} />
          </button>

          <span
            className="min-w-[46px] text-center font-mono text-[11.5px] text-fg/85 cursor-pointer hover:text-accent"
            title="点击重置为 100%"
            onClick={() => {
              setFitMode("custom");
              setScale(1.0);
            }}
          >
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            title="放大 (Ctrl+=)"
            onClick={() => {
              setFitMode("custom");
              setScale((s) => Math.min(3.5, Number((s + 0.15).toFixed(2))));
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-fg"
          >
            <Icon name="zoom-in" size={14} />
          </button>

          <div className="mx-1 h-4 w-px bg-line" />

          <button
            type="button"
            title="适合页宽"
            onClick={() => {
              setFitMode("width");
              void updateFitWidth();
            }}
            className={`flex h-7 items-center rounded px-2 text-[11.5px] transition-colors ${
              fitMode === "width" ? "bg-accent/15 text-accent font-medium" : "hover:bg-hover hover:text-fg"
            }`}
          >
            页宽
          </button>

          <button
            type="button"
            title="适合整页"
            onClick={() => {
              setFitMode("page");
              void updateFitPage();
            }}
            className={`flex h-7 items-center rounded px-2 text-[11.5px] transition-colors ${
              fitMode === "page" ? "bg-accent/15 text-accent font-medium" : "hover:bg-hover hover:text-fg"
            }`}
          >
            整页
          </button>
        </div>

        {/* 右侧：编辑与夜间模式 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="顺时针旋转当前页 90°"
            onClick={() => rotatePage(currentPage, true)}
            className="flex h-7 items-center gap-1 rounded px-2 hover:bg-hover hover:text-fg"
          >
            <Icon name="rotate-cw" size={13} />
            <span className="hidden md:inline">旋转当前页</span>
          </button>

          <button
            type="button"
            title="顺时针旋转全部页面 90°"
            onClick={() => rotateAllPages(true)}
            className="flex h-7 items-center gap-1 rounded px-2 hover:bg-hover hover:text-fg"
          >
            <Icon name="rotate-cw" size={13} />
            <span className="hidden lg:inline">旋转全部</span>
          </button>

          <button
            type="button"
            title="删除当前页"
            onClick={() => deletePage(currentPage)}
            className="flex h-7 items-center gap-1 rounded px-2 text-danger/80 hover:bg-danger/10 hover:text-danger"
          >
            <Icon name="trash" size={13} />
            <span className="hidden md:inline">删除此页</span>
          </button>

          <button
            type="button"
            title="将当前页另存为单独的 PDF"
            onClick={() => extractPage(currentPage)}
            className="flex h-7 items-center gap-1 rounded px-2 hover:bg-hover hover:text-fg"
          >
            <Icon name="download" size={13} />
            <span className="hidden lg:inline">另存此页</span>
          </button>

          <div className="mx-1 h-4 w-px bg-line" />

          {/* 夜间反色阅读模式 */}
          <button
            type="button"
            title={invertColors ? "关闭深色阅读模式" : "开启深色阅读滤镜（夜间舒适护眼）"}
            onClick={() => setInvertColors(!invertColors)}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              invertColors ? "bg-accent text-accent-contrast" : "hover:bg-hover hover:text-fg"
            }`}
          >
            <Icon name={invertColors ? "sun" : "moon"} size={14} />
          </button>
        </div>
      </div>

      {/* 主视口区域：侧边栏 + 画布流 */}
      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden bg-app">
        {/* 左侧可折叠抽屉：缩略图 / 大纲目录 */}
        {sidebarOpen ? (
          <aside className="relative flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
            {/* 侧栏选项卡 */}
            <div className="flex h-8 items-center border-b border-line px-2 text-[12px]">
              <button
                type="button"
                onClick={() => setSidebarTab("thumbnails")}
                className={`flex flex-1 items-center justify-center gap-1 rounded py-1 transition-colors ${
                  sidebarTab === "thumbnails" ? "bg-panel font-medium text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <Icon name="grid" size={13} />
                <span>缩略图 ({numPages})</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("outline")}
                className={`flex flex-1 items-center justify-center gap-1 rounded py-1 transition-colors ${
                  sidebarTab === "outline" ? "bg-panel font-medium text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <Icon name="book-open" size={13} />
                <span>大纲目录</span>
              </button>
            </div>

            {/* 侧栏内容区 */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              {sidebarTab === "thumbnails" ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => (
                    <div
                      key={pNum}
                      draggable
                      onDragStart={() => setDraggedPageIndex(pNum - 1)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropPage(pNum - 1)}
                      onClick={() => scrollToPage(pNum)}
                      className={`group relative flex cursor-pointer flex-col items-center rounded-lg border p-1.5 transition-all ${
                        currentPage === pNum
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-line bg-panel hover:border-line-strong hover:bg-hover"
                      }`}
                    >
                      {/* 缩略图画布渲染容器 */}
                      <PdfThumbnail
                        pdfProxy={pdfProxy}
                        pageNum={pNum}
                        active={currentPage === pNum}
                      />

                      {/* 页码与操作按钮 */}
                      <div className="mt-1 flex w-full items-center justify-between px-1 text-[11px] text-muted">
                        <span className="font-mono">{pNum}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="旋转此页"
                            onClick={(e) => {
                              e.stopPropagation();
                              rotatePage(pNum, true);
                            }}
                            className="rounded p-0.5 hover:bg-accent/20 hover:text-accent"
                          >
                            <Icon name="rotate-cw" size={11} />
                          </button>
                          <button
                            type="button"
                            title="删除此页"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePage(pNum);
                            }}
                            className="rounded p-0.5 hover:bg-danger/20 hover:text-danger"
                          >
                            <Icon name="trash" size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-fg/80">
                  {outline.length === 0 ? (
                    <div className="py-8 text-center text-muted">此文档未包含书签大纲</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {outline.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (item.pageIndex) scrollToPage(item.pageIndex);
                          }}
                          className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-hover hover:text-accent"
                        >
                          <span className="truncate">{item.title}</span>
                          {item.pageIndex ? (
                            <span className="font-mono text-[11px] text-muted">{item.pageIndex}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        ) : null}

        {/* 主页面渲染流容器 */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={`flex flex-1 flex-col items-center overflow-y-auto overflow-x-auto p-6 scrollbar-thin ${
            isDark ? "bg-[#18181b]" : "bg-neutral-100"
          }`}
        >
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
              <Icon name="loader" size={28} className="animate-spin text-accent" />
              <div className="text-[13px]">正在加载并解析 PDF 文档…</div>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
              <Icon name="lock" size={32} className="text-warning/80" />
              <div className="text-[14px] font-medium text-fg">{error}</div>
              <button
                type="button"
                onClick={() => void loadPdf()}
                className="mt-2 rounded-md bg-accent px-4 py-1.5 text-[12px] text-accent-contrast shadow transition-colors hover:brightness-105"
              >
                输入密码解锁
              </button>
            </div>
          ) : (
            <div
              className={`flex flex-col items-center gap-6 transition-all ${
                invertColors ? "invert contrast-[0.9] hue-rotate-180" : ""
              }`}
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => (
                <div
                  key={pNum}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pNum, el);
                    else pageRefs.current.delete(pNum);
                  }}
                  data-page-number={pNum}
                  className="relative rounded shadow-lg bg-white overflow-hidden transition-shadow"
                >
                  <PdfPage
                    pdfProxy={pdfProxy}
                    pageNum={pNum}
                    scale={scale}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 单页 Canvas + TextLayer 渲染组件 */
function PdfPage({
  pdfProxy,
  pageNum,
  scale,
}: {
  pdfProxy: pdfjsLib.PDFDocumentProxy | null;
  pageNum: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfProxy) return;
    let cancel = false;
    let renderTask: any = null;

    const render = async () => {
      try {
        const page = await pdfProxy.getPage(pageNum);
        if (cancel) return;

        // 根据设备像素比高清渲染 Canvas
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale });

        setDimensions({ width: cssViewport.width, height: cssViewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (cancel) return;

        // 渲染透明文本选择层（支持划词/选择/复制）
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = "";
          const textContent = await page.getTextContent();
          if (cancel) return;

          pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport: cssViewport,
            textDivs: [],
          });
        }
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`渲染第 ${pageNum} 页错误`, err);
        }
      }
    };

    void render();

    return () => {
      cancel = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfProxy, pageNum, scale]);

  return (
    <div
      style={{
        width: dimensions ? `${dimensions.width}px` : "auto",
        height: dimensions ? `${dimensions.height}px` : "auto",
      }}
      className="relative flex items-center justify-center bg-white"
    >
      <canvas ref={canvasRef} className="block select-none" />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 select-text"
        style={{
          width: dimensions ? `${dimensions.width}px` : "auto",
          height: dimensions ? `${dimensions.height}px` : "auto",
        }}
      />
    </div>
  );
}

/** 缩略图迷你渲染组件 */
function PdfThumbnail({
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
