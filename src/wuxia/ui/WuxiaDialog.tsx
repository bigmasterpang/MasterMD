import { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "../../components/common/Modal";
import { renderMarkdown } from "../../utils/markdown";
import { sanitizeHtml } from "../../utils/sanitize";
import { DUNGEON_MAP, MAPS, POTIONS, QUEST_MAP, SECTS, SKILL_MAP } from "../data";
import { askConfirm } from "../../stores/dialogStore";
import { offerableQuests, useWuxiaStore, type WuxiaTab } from "../store";
import { todayKey } from "../save";
import { itemScore, totalStats } from "../engine";
import {
  bagPanel,
  battlePanel,
  characterCard,
  dungeonPanel,
  idlePanel,
  mapPanel,
  questPanel,
  sectPanel,
  skillPanel,
} from "./markdown";

function MarkdownBlock({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => sanitizeHtml(renderMarkdown(source).html), [source]);
  return (
    <div className={className ?? "md-body"} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

const TABS: Array<{ id: WuxiaTab; label: string }> = [
  { id: "map", label: "地图" },
  { id: "battle", label: "战斗" },
  { id: "bag", label: "背包" },
  { id: "skill", label: "武学" },
  { id: "quest", label: "任务" },
  { id: "sect", label: "门派" },
  { id: "dungeon", label: "秘境" },
  { id: "idle", label: "挂机" },
];

function SmallButton({
  children,
  onClick,
  title,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "border-transparent bg-accent text-accent-fg hover:opacity-90"
      : tone === "danger"
        ? "border-line text-danger hover:bg-danger-soft"
        : "border-line bg-elevated text-fg hover:bg-hover";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-[3px] text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

/** 《Markdown 江湖》主界面 */
export function WuxiaDialog() {
  const store = useWuxiaStore();
  const { save, open, tab, selectedMap, battleLog, toast } = store;
  const [itemIndex, setItemIndex] = useState(0);

  useEffect(() => {
    if (open) store.loadOrCreate();
    // 只在打开时初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => useWuxiaStore.getState().dismissToast(), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markdown = useMemo(() => {
    switch (tab) {
      case "map":
        return mapPanel(save, selectedMap);
      case "battle":
        return battlePanel(save, battleLog);
      case "bag":
        return bagPanel(save);
      case "skill":
        return skillPanel(save);
      case "quest":
        return questPanel(save);
      case "sect":
        return sectPanel(save);
      case "dungeon":
        return dungeonPanel(save, todayKey());
      case "idle":
        return idlePanel(save);
      default:
        return "";
    }
  }, [tab, save, selectedMap, battleLog]);

  const map = MAPS.find((m) => m.id === selectedMap);
  const canEnterMap = map ? save.player.level >= map.minLevel && (save.maps.includes(map.id) || map.id === "qingshi") : false;
  const inventoryItem = save.player.inventory[itemIndex];
  const stats = totalStats(save.player);

  return (
    <Modal
      open={open}
      title="🏯 Markdown 江湖 · 隐藏玩法"
      onClose={() => useWuxiaStore.getState().closePanel()}
      width={780}
      footer={
        <>
          <span className="mr-auto text-[11px] text-faint">
            {save.player.name} · {save.player.level} 级 · 银两 {Math.round(save.player.silver)} · 战力{" "}
            {Math.round(stats.atk * 3 + stats.def * 2 + stats.agi * 1.5 + stats.hp * 0.3)}
            {save.idle.config.enabled ? " · 挂机中" : ""}
          </span>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await askConfirm({
                title: "删档重来？",
                message: "将清空江湖进度（等级、装备、任务、门派），此操作不可恢复。",
                confirmText: "删档重来",
                danger: true,
              });
              if (ok) useWuxiaStore.getState().resetGame();
            }}
          >
            删档重来
          </Button>
          <Button variant="primary" onClick={() => useWuxiaStore.getState().closePanel()}>
            收剑归鞘
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-[var(--radius)] border border-line bg-app px-4 py-3">
          <MarkdownBlock source={characterCard(save)} />
        </div>

        <div className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => useWuxiaStore.getState().setTab(item.id)}
              className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                tab === item.id
                  ? "border-transparent bg-accent text-accent-fg"
                  : "border-line bg-elevated text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="max-h-[40vh] overflow-auto rounded-[var(--radius)] border border-line bg-app px-4 py-3">
          <MarkdownBlock source={markdown} />
        </div>

        {/* 操作区 */}
        <div className="flex flex-wrap items-center gap-2">
          {tab === "map" ? (
            <>
              <select
                value={selectedMap}
                onChange={(event) => useWuxiaStore.getState().selectMap(event.target.value)}
                className="h-7 rounded-md border border-line bg-input px-2 text-[12px] text-fg"
              >
                {MAPS.map((m) => {
                  const unlocked = save.maps.includes(m.id) || m.id === "qingshi";
                  return (
                    <option key={m.id} value={m.id} disabled={!unlocked}>
                      {unlocked ? m.name : `🔒 ${m.name}`}
                    </option>
                  );
                })}
              </select>
              <SmallButton
                tone="primary"
                disabled={!canEnterMap}
                onClick={() => {
                  useWuxiaStore.getState().setTab("battle");
                }}
                title={canEnterMap ? "" : "等级不足或未解锁"}
              >
                前往此地
              </SmallButton>
            </>
          ) : null}

          {tab === "battle" ? (
            <>
              <SmallButton
                tone="primary"
                disabled={!canEnterMap}
                onClick={() => useWuxiaStore.getState().fight(false)}
              >
                挑战普通怪
              </SmallButton>
              <SmallButton
                disabled={!canEnterMap || !map?.elite}
                onClick={() => useWuxiaStore.getState().fight(true)}
                title="精英怪更强，掉落更好"
              >
                挑战精英
              </SmallButton>
              <SmallButton
                disabled={!canEnterMap}
                onClick={() => {
                  for (let i = 0; i < 10; i += 1) useWuxiaStore.getState().fight(false);
                }}
                title="连续挑战 10 次"
              >
                连战 10 场
              </SmallButton>
              <SmallButton
                disabled={!canEnterMap}
                onClick={() => useWuxiaStore.getState().toggleIdle()}
                tone={save.idle.config.enabled ? "danger" : "default"}
              >
                {save.idle.config.enabled ? "停止挂机" : "在此挂机"}
              </SmallButton>
            </>
          ) : null}

          {tab === "bag" ? (
            <>
              <select
                value={itemIndex}
                onChange={(event) => setItemIndex(Number(event.target.value))}
                className="h-7 max-w-[320px] rounded-md border border-line bg-input px-2 text-[12px] text-fg"
              >
                {save.player.inventory.length === 0 ? <option>背包为空</option> : null}
                {save.player.inventory.map((item, index) => (
                  <option key={item.uid} value={index}>
                    {item.name}（评分 {itemScore(item)}）
                  </option>
                ))}
              </select>
              <SmallButton
                tone="primary"
                disabled={!inventoryItem}
                onClick={() => inventoryItem && useWuxiaStore.getState().equip(inventoryItem.uid)}
              >
                装备
              </SmallButton>
              <SmallButton
                disabled={!inventoryItem}
                onClick={() => inventoryItem && useWuxiaStore.getState().enhance(inventoryItem.uid)}
                title="消耗银两与锻造材料，+1~+10，每级 +6% 属性"
              >
                强化
              </SmallButton>
              <SmallButton
                tone="danger"
                disabled={!inventoryItem}
                onClick={() => inventoryItem && useWuxiaStore.getState().sellItem(inventoryItem.uid)}
              >
                出售
              </SmallButton>
              <SmallButton onClick={() => useWuxiaStore.getState().sellAllCommon()}>
                一键卖凡品
              </SmallButton>
            </>
          ) : null}

          {tab === "skill" && save.player.sect
            ? SKILLS_OF(save.player.sect).map((skill) => {
                const level = save.player.skills[skill.id] ?? 0;
                return (
                  <SmallButton
                    key={skill.id}
                    tone={level > 0 ? "default" : "primary"}
                    title={`${skill.desc}｜消耗：银两 ${skill.cost.silver} · 贡献 ${skill.cost.contribution}`}
                    onClick={() =>
                      level > 0
                        ? useWuxiaStore.getState().upgradeSkill(skill.id)
                        : useWuxiaStore.getState().learnSkill(skill.id)
                    }
                  >
                    {level > 0 ? `${skill.name} ↑${level}` : `学习 ${skill.name}`}
                  </SmallButton>
                );
              })
            : null}

          {tab === "quest" ? (
            <>
              {save.quests.active.map((id) => {
                const quest = QUEST_MAP[id];
                if (!quest) return null;
                return (
                  <SmallButton
                    key={id}
                    tone="primary"
                    title="交付后获得奖励；收集类任务会扣除对应材料"
                    onClick={() => useWuxiaStore.getState().claimQuest(id)}
                  >
                    交付「{quest.title}」
                  </SmallButton>
                );
              })}
              {offerableQuests(save).map((quest) => (
                <SmallButton
                  key={quest.id}
                  title={quest.story[0] ?? ""}
                  onClick={() => useWuxiaStore.getState().acceptQuest(quest.id)}
                >
                  接取「{quest.title}」
                </SmallButton>
              ))}
            </>
          ) : null}

          {tab === "sect" && !save.player.sect
            ? SECTS.map((sect) => (
                <SmallButton
                  key={sect.id}
                  tone="primary"
                  title={`${sect.desc}｜入门等级 ${sect.minLevel}`}
                  onClick={() => useWuxiaStore.getState().joinSect(sect.id)}
                >
                  拜入{sect.name}
                </SmallButton>
              ))
            : null}

          {tab === "dungeon" ? (
            save.dungeonRun ? (
              <>
                <SmallButton tone="primary" onClick={() => useWuxiaStore.getState().dungeonNext()}>
                  继续深入
                </SmallButton>
                <SmallButton onClick={() => useWuxiaStore.getState().dungeonRetreat()}>
                  携宝撤退
                </SmallButton>
              </>
            ) : (
              Object.values(DUNGEON_MAP).map((dungeon) => (
                <SmallButton
                  key={dungeon.id}
                  onClick={() => useWuxiaStore.getState().enterDungeon(dungeon.id)}
                  title={`${dungeon.desc}｜门槛 ${dungeon.minLevel} 级`}
                >
                  挑战 {dungeon.name}
                </SmallButton>
              ))
            )
          ) : null}

          {tab === "idle" ? (
            <>
              <SmallButton
                tone={save.idle.config.enabled ? "danger" : "primary"}
                onClick={() => useWuxiaStore.getState().toggleIdle()}
              >
                {save.idle.config.enabled ? "停止挂机" : "开始挂机"}
              </SmallButton>
              <select
                value={save.idle.config.mapId}
                onChange={(event) => {
                  useWuxiaStore.getState().selectMap(event.target.value);
                  useWuxiaStore.setState({
                    save: {
                      ...save,
                      idle: { ...save.idle, config: { ...save.idle.config, mapId: event.target.value } },
                    },
                  });
                }}
                className="h-7 rounded-md border border-line bg-input px-2 text-[12px] text-fg"
              >
                {MAPS.map((m) => {
                  const unlocked = save.maps.includes(m.id) || m.id === "qingshi";
                  return (
                    <option key={m.id} value={m.id} disabled={!unlocked}>
                      {unlocked ? m.name : `🔒 ${m.name}`}
                    </option>
                  );
                })}
              </select>
              <SmallButton
                onClick={() =>
                  useWuxiaStore.setState({
                    save: {
                      ...save,
                      idle: {
                        ...save.idle,
                        config: { ...save.idle.config, autoHeal: !save.idle.config.autoHeal },
                      },
                    },
                  })
                }
              >
                自动用药：{save.idle.config.autoHeal ? "开" : "关"}
              </SmallButton>
              <SmallButton
                onClick={() =>
                  useWuxiaStore.setState({
                    save: {
                      ...save,
                      idle: {
                        ...save.idle,
                        config: { ...save.idle.config, collectCommon: !save.idle.config.collectCommon },
                      },
                    },
                  })
                }
              >
                拾取凡品：{save.idle.config.collectCommon ? "开" : "关"}
              </SmallButton>
            </>
          ) : null}

          {tab === "bag" ? (
            <>
              {Object.entries(POTIONS).map(([id, potion]) => (
                <SmallButton
                  key={id}
                  onClick={() => useWuxiaStore.getState().buyPotion(id, 5)}
                  title={`每瓶 ${potion.price} 两，一次买 5 瓶`}
                >
                  买 {potion.name} ×5
                </SmallButton>
              ))}
              <SmallButton onClick={() => useWuxiaStore.getState().usePotion("jinchuang")}>
                服金创药
              </SmallButton>
            </>
          ) : null}
        </div>

        {toast ? (
          <div className="rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-[12px] text-accent">
            {toast}
          </div>
        ) : null}

        <div className="text-[11px] leading-relaxed text-faint">
          江湖玩法完全由 Markdown 呈现：表格是属性与背包，任务列表是进度，引用块是剧情，
          代码块是战斗记录。存档在浏览器本地，不影响你的文档。已装备{" "}
          {Object.values(save.player.equipment).filter(Boolean).length}/6 件，装备总评分{" "}
          {Object.values(save.player.equipment).reduce(
            (sum, item) => sum + (item ? itemScore(item) : 0),
            0,
          )}。
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ 小工具 ------------------------------ */

function SKILLS_OF(sect: string) {
  return Object.values(SKILL_MAP).filter((skill) => skill.sect === sect);
}
