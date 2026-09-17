import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { loadKatex, loadMermaid } from "../../utils/markdown";
import { isExternalUrl, resolveLocalImagePath, joinPath, dirName } from "../../utils/filePath";
import { openExternal, openPath } from "../../utils/fileActions";
import { sanitizeHtml } from "../../utils/sanitize";
import { useAppStore } from "../../stores/appStore";

interface Props {
  html: string;
  hasMath: boolean;
  hasMermaid: boolean;
  isDark: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

let mermaidSeq = 0;

/**
 * Markdown 预览。
 * 顺序：清理 HTML -> 注入 DOM -> 修正图片路径/链接 -> 延迟渲染 KaTeX / Mermaid。
 */
export function MarkdownPreview({
  html,
  hasMath,
  hasMermaid,
  isDark,
  scrollRef,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const generation = ++generationRef.current;

    const safe = sanitizeHtml(html);
    root.innerHTML = safe;

    const doc = useAppStore.getState().docs.find((d) => d.id === useAppStore.getState().activeId);
    const docPath = doc?.filePath ?? null;

    /* ---------------- 图片路径修正 ---------------- */
    root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      if (!src) return;
      if (/^(https?:|data:|asset:)/i.test(src)) return;

      const localPath = resolveLocalImagePath(docPath, src);
      if (!localPath) {
        markBroken(img, "文档尚未保存，无法解析相对路径图片");
        return;
      }
      img.setAttribute("data-local-path", localPath);
      img.setAttribute("src", convertFileSrc(localPath));
      img.addEventListener("error", () => markBroken(img, "图片无法加载"), {
        once: true,
      });
    });

    /* ---------------- 链接拦截 ---------------- */
    root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href") ?? "";
        if (!href || href.startsWith("#")) {
          event.preventDefault();
          if (href.startsWith("#")) {
            const target = root.querySelector<HTMLElement>(
              `[id="${CSS.escape(href.slice(1))}"]`,
            );
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          return;
        }
        event.preventDefault();
        if (isExternalUrl(href)) {
          if (href.startsWith("#")) return;
          void openExternal(href);
          return;
        }
        // 相对路径：如果是 Markdown 文件则在应用内打开
        if (docPath && /\.(md|markdown|mdown|mkd|mkdn|txt)$/i.test(href)) {
          const base = href.split("#")[0].split("?")[0];
          let decoded = base;
          try {
            decoded = decodeURIComponent(base);
          } catch {
            /* 保留原值 */
          }
          void openPath(joinPath(dirName(docPath), decoded));
          return;
        }
        if (docPath) {
          void openExternal(convertFileSrc(joinPath(dirName(docPath), href)));
        }
      });
    });

    /* ---------------- KaTeX（按需加载） ---------------- */
    if (hasMath) {
      void loadKatex().then((katex) => {
        if (generationRef.current !== generation) return;
        root.querySelectorAll<HTMLElement>(".math-inline, .math-block").forEach((el) => {
          const tex = el.dataset.tex ?? "";
          const displayMode = el.classList.contains("math-block");
          try {
            el.innerHTML = katex.renderToString(tex, {
              displayMode,
              throwOnError: false,
              strict: "ignore",
              output: "html",
            });
          } catch (error) {
            el.classList.add("math-error");
            el.textContent = `公式解析失败: ${tex} (${String(error)})`;
          }
        });
      });
    }

    /* ---------------- Mermaid（按需加载） ---------------- */
    if (hasMermaid) {
      void loadMermaid(isDark).then(async (mermaid) => {
        if (generationRef.current !== generation) return;
        const blocks = Array.from(
          root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
        );
        for (const code of blocks) {
          if (generationRef.current !== generation) return;
          const pre = code.parentElement;
          const graph = code.textContent ?? "";
          const target = document.createElement("div");
          target.className = "mermaid-block";
          try {
            const id = `mdview-mermaid-${++mermaidSeq}`;
            const { svg } = await mermaid.render(id, graph);
            target.innerHTML = svg;
          } catch (error) {
            target.classList.add("mermaid-error");
            target.textContent = `Mermaid 渲染失败：${String(error)}`;
          }
          pre?.replaceWith(target);
        }
      });
    }
  }, [html, hasMath, hasMermaid, isDark]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto"
      style={{ scrollBehavior: "auto" }}
    >
      <div className="mx-auto w-full px-8 py-6" style={{ maxWidth: 900 }}>
        <div ref={bodyRef} className="md-body" />
      </div>
    </div>
  );
}

function markBroken(img: HTMLImageElement, reason: string) {
  img.classList.add("md-img-broken");
  img.removeAttribute("src");
  img.setAttribute("alt", `${img.getAttribute("alt") ?? ""}（${reason}）`);
  img.title = reason;
}
