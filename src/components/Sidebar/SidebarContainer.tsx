import { useRef } from "react";
import { FileTree } from "../Explorer/FileTree";
import { OutlineSidebar } from "../Outline/OutlineSidebar";
import { useExplorerStore } from "../../stores/explorerStore";

interface Props {
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

export function SidebarContainer({ previewRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ratio = useExplorerStore((s) => s.ratio);
  const setRatio = useExplorerStore((s) => s.setRatio);
  const sidebarWidth = useExplorerStore((s) => s.sidebarWidth);
  const setSidebarWidth = useExplorerStore((s) => s.setSidebarWidth);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const height = rect.height;
      if (height <= 0) return;
      const currentY = moveEvent.clientY - rect.top;
      const newRatio = currentY / height;
      setRatio(newRatio);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleHorizontalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startWidth = rect.width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setSidebarWidth(startWidth + deltaX);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const topPercent = Math.round(ratio * 100);
  const bottomPercent = 100 - topPercent;

  return (
    <aside
      ref={containerRef}
      style={{ width: `${sidebarWidth}px` }}
      className="print-hide relative flex shrink-0 flex-col border-r border-line bg-sidebar"
    >
      {/* 上半部：文件树 */}
      <div style={{ height: `${topPercent}%` }} className="min-h-0 w-full overflow-hidden">
        <FileTree />
      </div>

      {/* 拖拽分割条 */}
      <div
        onMouseDown={handleMouseDown}
        className="group relative flex h-1.5 w-full cursor-row-resize shrink-0 items-center justify-center border-y border-line/60 bg-app hover:bg-accent/40"
      >
        <div className="h-0.5 w-8 rounded-full bg-line group-hover:bg-accent" />
      </div>

      {/* 下半部：大纲与符号导航 */}
      <div style={{ height: `${bottomPercent}%` }} className="min-h-0 w-full overflow-hidden">
        <OutlineSidebar previewRef={previewRef} />
      </div>

      {/* 右侧拖拽边缘（调整侧边栏宽度） */}
      <div
        onMouseDown={handleHorizontalResize}
        className="group absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/40"
        title="拖动调整侧边栏宽度"
      />
    </aside>
  );
}
