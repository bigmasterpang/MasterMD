import { useMemo } from "react";
import { Modal, Button } from "../common/Modal";
import { useDungeonStore } from "../../stores/dungeonStore";
import { askConfirm } from "../../stores/dialogStore";
import { renderMarkdown } from "../../utils/markdown";
import { sanitizeHtml } from "../../utils/sanitize";
import { APP_NAME, AUTHOR_NAME, AUTHOR_NAME_CN } from "../../utils/constants";

/** 把 Markdown 源码渲染进对话框（复用应用的渲染 + 清理管线） */
function MarkdownBlock({ source }: { source: string }) {
  const html = useMemo(() => sanitizeHtml(renderMarkdown(source).html), [source]);
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

const PHASE_LABEL: Record<string, string> = {
  intro: "序章",
  explore: "探索",
  combat: "战斗",
  reward: "战利品",
  gameover: "本局结束",
  victory: "通关",
};

/** 彩蛋：Markdown 地牢 */
export function DungeonDialog() {
  const visible = useDungeonStore((s) => s.visible);
  const state = useDungeonStore((s) => s.state);
  const meta = useDungeonStore((s) => s.meta);
  const close = () => useDungeonStore.getState().close();

  return (
    <Modal
      open={visible}
      title="🗝️ Markdown 地牢 · 彩蛋"
      onClose={close}
      width={680}
      footer={
        <>
          <span className="mr-auto text-[11px] text-faint">
            第 {state.phase === "intro" ? 0 : Math.min(state.floor, 5)}/5 层 ·{" "}
            {PHASE_LABEL[state.phase] ?? ""}
            {meta.cleared ? " · 🏆 已通关" : meta.bestFloor > 0 ? ` · 最远 ${meta.bestFloor} 层` : ""}
          </span>
          <Button
            variant="ghost"
            onClick={async () => {
              if (state.phase === "intro") {
                useDungeonStore.getState().startRun();
                return;
              }
              const ok = await askConfirm({
                title: "重新开始？",
                message: "当前地牢进度会丢失（不会影响你的文档）。",
                confirmText: "重新开始",
              });
              if (ok) useDungeonStore.getState().startRun();
            }}
          >
            重新开始
          </Button>
          <Button variant="primary" onClick={close}>
            离开地牢
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="max-h-[46vh] overflow-auto rounded-[var(--radius)] border border-line bg-app px-4 py-3">
          <MarkdownBlock source={state.scene} />
        </div>

        <div className="flex flex-wrap gap-2">
          {state.choices.map((choice) => (
            <button
              key={choice.action}
              type="button"
              title={choice.hint}
              onClick={() => useDungeonStore.getState().act(choice.action)}
              className="rounded-md border border-line bg-elevated px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
            >
              {choice.label}
            </button>
          ))}
        </div>

        <div className="text-[11px] leading-relaxed text-faint">
          这是一个用 Markdown 演出的隐藏小游戏：旁白用引用块、属性用表格、背包用任务列表、
          战斗日志用代码块、弱点用高亮标记。进度与「通关」状态会记在本机，
          不影响你的文档。— {APP_NAME} · {AUTHOR_NAME}（{AUTHOR_NAME_CN}）
        </div>
      </div>
    </Modal>
  );
}
