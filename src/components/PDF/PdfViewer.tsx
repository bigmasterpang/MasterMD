import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { Icon } from "../common/Icon";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { useAppStore } from "../../stores/appStore";
import { askPdfPassword } from "../../stores/dialogStore";
import { fileName } from "../../utils/filePath";
import {
  addPdfHighlight,
  base64ToBytes,
  clearAllHighlights,
  clearPageHighlights,
  deletePdfPage,
  extractPdfPage,
  registerPdfDocument,
  removePdfHighlight,
  rotateAllPdfPages,
  rotatePdfPage,
  unregisterPdfDocument,
  type OutlineItem,
} from "./pdfService";

// 设置 PDF.js Worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  docId: string;
  pane?: 0 | 1;
  isDark: boolean;
}

interface PdfSelectionMenuState {
  x: number;
  y: number;
  selectedText: string;
  pageNum: number;
  clientRects: DOMRect[];
  pageRect: DOMRect | null;
}

interface HighlightMenuState {
  x: number;
  y: number;
  highlightId: string;
  pageNum: number;
}

export function PdfViewer({ docId, isDark }: PdfViewerProps) {
  const doc = useAppStore((s) => s.docs.find((d) => d.id === docId) ?? null);
  const outlineVisible = useAppStore((s) => s.outlineVisible);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState<number>(1.2);
  const [debouncedScale, setDebouncedScale] = useState<number>(1.2);
  const [fitMode, setFitMode] = useState<"custom" | "width" | "page">("width");
  const [invertColors, setInvertColors] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<PdfSelectionMenuState | null>(null);
  const [highlightMenu, setHighlightMenu] = useState<HighlightMenuState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const pdfBase64 = doc?.pdfBase64 ?? "";
  const docName = doc?.filePath ? fileName(doc.filePath) : "PDF 文档";

  // 大文档缩放性能优化：对高负载重绘进行 100ms 防抖，滚动缩放时先通过 CSS 缩放，停止滚动后精细渲染
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedScale(scale);
    }, 100);
    return () => clearTimeout(timer);
  }, [scale]);

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
        let parsedOutline: OutlineItem[] = [];
        try {
          const rawOutline = await proxy.getOutline();
          if (rawOutline && rawOutline.length > 0) {
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
          }
        } catch {
          parsedOutline = [];
        }

        // 注册到全局共享服务
        registerPdfDocument(docId, proxy, parsedOutline);
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
    return () => {
      unregisterPdfDocument(docId);
    };
  }, [loadPdf, docId]);

  // 适应页面宽度计算
  const updateFitWidth = useCallback(async () => {
    if (!pdfProxy || !containerRef.current) return;
    try {
      const page = await pdfProxy.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current.clientWidth - 48;
      if (containerWidth > 0 && viewport.width > 0) {
        const newScale = Math.max(0.3, Math.min(3.5, containerWidth / viewport.width));
        setScale(newScale);
        setDebouncedScale(newScale);
        setFitMode("width");
        useAppStore.getState().patchDoc(docId, { pdfScale: "width" });
      }
    } catch {
      /* ignore */
    }
  }, [pdfProxy, currentPage, docId]);

  // 适应整页高度计算
  const updateFitPage = useCallback(async () => {
    if (!pdfProxy || !containerRef.current) return;
    try {
      const page = await pdfProxy.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerHeight = containerRef.current.clientHeight - 48;
      if (containerHeight > 0 && viewport.height > 0) {
        const newScale = Math.max(0.3, Math.min(3.5, containerHeight / viewport.height));
        setScale(newScale);
        setDebouncedScale(newScale);
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
  }, [fitMode]);

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
  const scrollToPage = useCallback(
    (pageNum: number) => {
      const safePage = Math.max(1, Math.min(numPages, pageNum));
      const targetEl = pageRefs.current.get(safePage);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        setCurrentPage(safePage);
        useAppStore.getState().patchDoc(docId, { pdfCurrentPage: safePage });
      }
    },
    [numPages, docId],
  );

  // 监听来自全局侧边栏的跳转事件
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.docId === docId && typeof e.detail?.pageNum === "number") {
        scrollToPage(e.detail.pageNum);
      }
    };
    window.addEventListener("pdf-jump-to-page" as any, handler);
    return () => window.removeEventListener("pdf-jump-to-page" as any, handler);
  }, [docId, scrollToPage]);

  // 支持 Ctrl + 滚轮平滑缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setFitMode("custom");
        setScale((prev) => Math.max(0.3, Math.min(4.0, Number((prev + delta).toFixed(2)))));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // 右键划词选区与菜单处理
  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || "";
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    let targetPage = currentPage;
    let pageEl: HTMLElement | null = null;
    let cur: HTMLElement | null = e.target as HTMLElement;

    while (cur && cur !== containerRef.current) {
      if (cur.dataset?.pageNumber) {
        targetPage = parseInt(cur.dataset.pageNumber, 10);
        pageEl = cur;
        break;
      }
      cur = cur.parentElement;
    }

    const clientRects = range ? Array.from(range.getClientRects()) : [];
    const pageRect = pageEl ? pageEl.getBoundingClientRect() : null;

    if (text || clientRects.length > 0) {
      e.preventDefault();
      setSelectionMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText: text,
        pageNum: targetPage,
        clientRects,
        pageRect,
      });
    }
  };

  // 划词选区右键菜单
  const selectionMenuGroups = useMemo<ContextMenuItem[][]>(() => {
    if (!selectionMenu) return [];
    const pageHls = (doc?.pdfHighlights ?? []).filter((h) => h.page === selectionMenu.pageNum);
    const hasAnyHls = (doc?.pdfHighlights ?? []).length > 0;

    return [
      [
        {
          label: "复制文本",
          hint: "Ctrl+C",
          icon: "copy",
          onClick: async () => {
            if (selectionMenu.selectedText) {
              await navigator.clipboard.writeText(selectionMenu.selectedText);
            }
            setSelectionMenu(null);
          },
        },
      ],
      [
        {
          label: "高亮标记 (黄色)",
          icon: "bold",
          onClick: () => {
            if (selectionMenu.pageRect && selectionMenu.clientRects.length > 0) {
              addPdfHighlight(
                docId,
                selectionMenu.pageNum,
                selectionMenu.clientRects,
                selectionMenu.pageRect,
                "yellow",
                selectionMenu.selectedText,
              );
              window.getSelection()?.removeAllRanges();
            }
            setSelectionMenu(null);
          },
        },
        {
          label: "高亮标记 (绿色)",
          onClick: () => {
            if (selectionMenu.pageRect && selectionMenu.clientRects.length > 0) {
              addPdfHighlight(
                docId,
                selectionMenu.pageNum,
                selectionMenu.clientRects,
                selectionMenu.pageRect,
                "green",
                selectionMenu.selectedText,
              );
              window.getSelection()?.removeAllRanges();
            }
            setSelectionMenu(null);
          },
        },
        {
          label: "高亮标记 (粉色)",
          onClick: () => {
            if (selectionMenu.pageRect && selectionMenu.clientRects.length > 0) {
              addPdfHighlight(
                docId,
                selectionMenu.pageNum,
                selectionMenu.clientRects,
                selectionMenu.pageRect,
                "pink",
                selectionMenu.selectedText,
              );
              window.getSelection()?.removeAllRanges();
            }
            setSelectionMenu(null);
          },
        },
      ],
      ...(pageHls.length > 0 || hasAnyHls
        ? [
            [
              ...(pageHls.length > 0
                ? [
                    {
                      label: "清除本页所有高亮",
                      icon: "trash" as any,
                      onClick: () => {
                        clearPageHighlights(docId, selectionMenu.pageNum);
                        setSelectionMenu(null);
                      },
                    },
                  ]
                : []),
              {
                label: "清除全部高亮",
                icon: "trash" as any,
                onClick: () => {
                  clearAllHighlights(docId);
                  setSelectionMenu(null);
                },
              },
            ],
          ]
        : []),
      [
        {
          label: "取消选区",
          icon: "x",
          onClick: () => {
            window.getSelection()?.removeAllRanges();
            setSelectionMenu(null);
          },
        },
      ],
    ];
  }, [selectionMenu, docId, doc?.pdfHighlights]);

  // 高亮项自身右键菜单（支持删除高亮）
  const highlightMenuGroups = useMemo<ContextMenuItem[][]>(() => {
    if (!highlightMenu) return [];
    return [
      [
        {
          label: "移除此高亮",
          icon: "trash",
          onClick: () => {
            removePdfHighlight(docId, highlightMenu.highlightId);
            setHighlightMenu(null);
          },
        },
      ],
      [
        {
          label: "清除本页所有高亮",
          onClick: () => {
            clearPageHighlights(docId, highlightMenu.pageNum);
            setHighlightMenu(null);
          },
        },
        {
          label: "清除全部高亮",
          onClick: () => {
            clearAllHighlights(docId);
            setHighlightMenu(null);
          },
        },
      ],
    ];
  }, [highlightMenu, docId]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-panel">
      {/* PDF 顶置工具栏：防止挤压、加 shrink-0、窄屏隐藏文字只留精细图标 */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-line bg-panel px-2 text-[12px] text-muted overflow-x-auto overflow-y-hidden scrollbar-none">
        {/* 左侧：侧栏切换 & 页码跳转 */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={outlineVisible ? "收起文档大纲与缩略图 (Ctrl+Shift+E)" : "展开文档大纲与缩略图 (Ctrl+Shift+E)"}
            onClick={() => useAppStore.getState().setOutlineVisible(!outlineVisible)}
            className={`flex h-7 shrink-0 whitespace-nowrap items-center gap-1 rounded px-2 transition-colors ${
              outlineVisible ? "bg-accent/15 text-accent font-medium" : "hover:bg-hover hover:text-fg"
            }`}
          >
            <Icon name="grid" size={14} className="shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">侧栏</span>
          </button>

          <div className="mx-1 h-4 w-px shrink-0 bg-line" />

          {/* 页码选择器 */}
          <button
            type="button"
            title="上一页 (Page Up)"
            disabled={currentPage <= 1}
            onClick={() => scrollToPage(currentPage - 1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            <Icon name="arrow-up" size={13} className="shrink-0" />
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <input
              type="text"
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) scrollToPage(val);
              }}
              className="h-6 w-10 shrink-0 rounded border border-line bg-app text-center text-[12px] text-fg outline-none focus:border-accent"
            />
            <span className="shrink-0 whitespace-nowrap text-muted/70 text-[11px]">/ {numPages || 1}</span>
          </div>

          <button
            type="button"
            title="下一页 (Page Down)"
            disabled={currentPage >= numPages}
            onClick={() => scrollToPage(currentPage + 1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            <Icon name="arrow-down" size={13} className="shrink-0" />
          </button>
        </div>

        {/* 中间：缩放控制 */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="缩小 (Ctrl+- 或 Ctrl+滚轮)"
            onClick={() => {
              setFitMode("custom");
              const next = Math.max(0.3, Number((scale - 0.15).toFixed(2)));
              setScale(next);
              setDebouncedScale(next);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-hover hover:text-fg"
          >
            <Icon name="zoom-out" size={14} className="shrink-0" />
          </button>

          <span
            className="min-w-[42px] shrink-0 text-center font-mono text-[11.5px] text-fg/85 cursor-pointer hover:text-accent whitespace-nowrap"
            title="点击重置为 100%"
            onClick={() => {
              setFitMode("custom");
              setScale(1.0);
              setDebouncedScale(1.0);
            }}
          >
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            title="放大 (Ctrl+= 或 Ctrl+滚轮)"
            onClick={() => {
              setFitMode("custom");
              const next = Math.min(4.0, Number((scale + 0.15).toFixed(2)));
              setScale(next);
              setDebouncedScale(next);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-hover hover:text-fg"
          >
            <Icon name="zoom-in" size={14} className="shrink-0" />
          </button>

          <div className="mx-1 h-4 w-px shrink-0 bg-line" />

          <button
            type="button"
            title="适合页宽"
            onClick={() => {
              setFitMode("width");
              void updateFitWidth();
            }}
            className={`flex h-7 shrink-0 whitespace-nowrap items-center rounded px-1.5 text-[11.5px] transition-colors ${
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
            className={`flex h-7 shrink-0 whitespace-nowrap items-center rounded px-1.5 text-[11.5px] transition-colors ${
              fitMode === "page" ? "bg-accent/15 text-accent font-medium" : "hover:bg-hover hover:text-fg"
            }`}
          >
            整页
          </button>
        </div>

        {/* 右侧：编辑与夜间模式 */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            title="顺时针旋转当前页 90°"
            onClick={() => rotatePdfPage(docId, currentPage, true)}
            className="flex h-7 shrink-0 whitespace-nowrap items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-fg"
          >
            <Icon name="rotate-cw" size={13} className="shrink-0" />
            <span className="hidden xl:inline whitespace-nowrap">旋转当前页</span>
          </button>

          <button
            type="button"
            title="顺时针旋转全部页面 90°"
            onClick={() => rotateAllPdfPages(docId, true)}
            className="flex h-7 shrink-0 whitespace-nowrap items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-fg"
          >
            <Icon name="rotate-cw" size={13} className="shrink-0" />
            <span className="hidden 2xl:inline whitespace-nowrap">旋转全部</span>
          </button>

          <button
            type="button"
            title="删除当前页"
            onClick={() => deletePdfPage(docId, currentPage)}
            className="flex h-7 shrink-0 whitespace-nowrap items-center gap-1 rounded px-1.5 text-danger/80 hover:bg-danger/10 hover:text-danger"
          >
            <Icon name="trash" size={13} className="shrink-0" />
            <span className="hidden xl:inline whitespace-nowrap">删除此页</span>
          </button>

          <button
            type="button"
            title="将当前页另存为单独的 PDF"
            onClick={() => extractPdfPage(docId, currentPage)}
            className="flex h-7 shrink-0 whitespace-nowrap items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-fg"
          >
            <Icon name="download" size={13} className="shrink-0" />
            <span className="hidden 2xl:inline whitespace-nowrap">另存此页</span>
          </button>

          <div className="mx-1 h-4 w-px shrink-0 bg-line" />

          {/* 夜间反色阅读模式 */}
          <button
            type="button"
            title={invertColors ? "关闭深色阅读模式" : "开启深色阅读滤镜（夜间舒适护眼）"}
            onClick={() => setInvertColors(!invertColors)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
              invertColors ? "bg-accent text-accent-contrast" : "hover:bg-hover hover:text-fg"
            }`}
          >
            <Icon name={invertColors ? "sun" : "moon"} size={14} className="shrink-0" />
          </button>
        </div>
      </div>

      {/* 主视口区域：页面画布渲染流 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onContextMenu={handleContextMenu}
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
                  renderScale={debouncedScale}
                  docId={docId}
                  highlights={(doc?.pdfHighlights ?? []).filter((h) => h.page === pNum)}
                  onHighlightContextMenu={(x, y, hlId, p) =>
                    setHighlightMenu({ x, y, highlightId: hlId, pageNum: p })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 划词选区处理菜单 */}
      {selectionMenu ? (
        <ContextMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          groups={selectionMenuGroups}
          onClose={() => setSelectionMenu(null)}
        />
      ) : null}

      {/* 高亮标注右键菜单（支持移除） */}
      {highlightMenu ? (
        <ContextMenu
          x={highlightMenu.x}
          y={highlightMenu.y}
          groups={highlightMenuGroups}
          onClose={() => setHighlightMenu(null)}
        />
      ) : null}
    </div>
  );
}

/** 单页 Canvas + TextLayer 渲染组件（带视口虚拟化渲染与白色背景防黑底机制） */
function PdfPage({
  pdfProxy,
  pageNum,
  scale,
  renderScale,
  docId,
  highlights,
  onHighlightContextMenu,
}: {
  pdfProxy: pdfjsLib.PDFDocumentProxy | null;
  pageNum: number;
  scale: number;
  renderScale: number;
  docId: string;
  highlights: ReturnType<typeof useAppStore.getState>["docs"][0]["pdfHighlights"];
  onHighlightContextMenu: (x: number, y: number, highlightId: string, pageNum: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // 1. 计算当前页面在 1.0 比例下的固有尺寸（用于在未渲染时稳定占位，保证滚动条平滑）
  useEffect(() => {
    if (!pdfProxy) return;
    let cancel = false;
    void pdfProxy.getPage(pageNum).then((page) => {
      if (cancel) return;
      const viewport = page.getViewport({ scale });
      setDimensions({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancel = true;
    };
  }, [pdfProxy, pageNum, scale]);

  // 2. 视口可见性观察器（虚拟化渲染：远离视口的页面不渲染重负载 canvas/textLayer）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "450px 0px 450px 0px", // 提前 450px 预加载上下页面
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 3. 可见时进行高清 Canvas + TextLayer 渲染
  useEffect(() => {
    if (!pdfProxy || !isVisible) return;
    let cancel = false;
    let renderTask: any = null;

    const render = async () => {
      try {
        const page = await pdfProxy.getPage(pageNum);
        if (cancel) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: renderScale * dpr });
        const cssViewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 关键修复 1：使用标准 context，不开启 alpha: false，杜绝黑底出现
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // 关键修复 2：在尺寸变更的第一帧同步绘制纯白背景，避免重绘期间露出黑底
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (cancel) return;

        // 渲染透明文本选择层（保证选区与缩放高度严格一致）
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = "";
          textLayerRef.current.style.setProperty("--scale-factor", String(cssViewport.scale));

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
  }, [pdfProxy, pageNum, renderScale, isVisible]);

  const cssWidth = dimensions?.width ?? 600;
  const cssHeight = dimensions?.height ?? 800;

  return (
    <div
      ref={containerRef}
      style={{
        width: `${cssWidth}px`,
        height: `${cssHeight}px`,
      }}
      className="relative flex items-center justify-center bg-white shadow-xs"
    >
      {isVisible ? (
        <>
          <canvas ref={canvasRef} className="block select-none" />
          <div
            ref={textLayerRef}
            className="textLayer absolute inset-0 select-text leading-none"
            style={{
              width: `${cssWidth}px`,
              height: `${cssHeight}px`,
              // @ts-ignore
              "--scale-factor": String(scale),
            }}
          />

          {/* 交互式高亮标注遮罩层：支持点击移除与右键菜单移除 */}
          {highlights && highlights.length > 0 ? (
            <div className="absolute inset-0 pointer-events-none z-10">
              {highlights.map((hl) => (
                <div key={hl.id} className="contents pointer-events-auto">
                  {hl.rects.map((r, i) => (
                    <div
                      key={`${hl.id}-${i}`}
                      data-highlight-id={hl.id}
                      style={{
                        left: `${r.xPercent}%`,
                        top: `${r.yPercent}%`,
                        width: `${r.wPercent}%`,
                        height: `${r.hPercent}%`,
                        backgroundColor:
                          hl.color === "green"
                            ? "rgba(74, 222, 128, 0.45)"
                            : hl.color === "pink"
                              ? "rgba(244, 114, 182, 0.45)"
                              : "rgba(250, 204, 21, 0.45)",
                      }}
                      className="absolute rounded-xs mix-blend-multiply cursor-pointer hover:opacity-80 transition-opacity"
                      title="点击或右键可移除此高亮标注"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePdfHighlight(docId, hl.id);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onHighlightContextMenu(e.clientX, e.clientY, hl.id, pageNum);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        /* 视口外虚拟骨架占位 */
        <div className="flex h-full w-full items-center justify-center text-[12px] text-faint bg-white">
          <span className="font-mono opacity-40">第 {pageNum} 页</span>
        </div>
      )}
    </div>
  );
}
