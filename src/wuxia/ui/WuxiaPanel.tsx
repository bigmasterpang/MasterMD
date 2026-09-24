import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/common/Modal";
import { Icon } from "../../components/common/Icon";
import { renderMarkdown } from "../../utils/markdown";
import { sanitizeHtml } from "../../utils/sanitize";
import { askConfirm } from "../../stores/dialogStore";
import { useAppStore } from "../../stores/appStore";
import { DUNGEON_MAP, MAPS, POTIONS, QUALITY_META, QUEST_MAP, SECTS, SKILL_MAP } from "../data";
import {
  itemScore,
  questNeed,
  questProgress,
  questReady,
  realmOf,
  repeatRemaining,
  totalStats,
} from "../engine";
import { todayKey } from "../save";
import { offerableQuests, useWuxiaStore, type WuxiaTab } from "../store";
import type { EquipSlot, Quality } from "../types";
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
  { id: "bag", label: "装备" },
  { id: "skill", label: "武学" },
  { id: "quest", label: "任务" },
  { id: "sect", label: "门派" },
  { id: "dungeon", label: "秘境" },
  { id: "idle", label: "挂机" },
];

const SLOTS: Array<{ id: EquipSlot; label: string }> = [
  { id: "weapon", label: "武器" },
  { id: "head", label: "头部" },
  { id: "body", label: "衣甲" },
  { id: "hands", label: "手部" },
  { id: "feet", label: "足部" },
  { id: "accessory", label: "饰品" },
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

function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <span
      title={hint}
      className="rounded-md border border-line bg-elevated px-2 py-[3px] text-[11px] text-muted"
    >
      {label} <span className="font-semibold text-fg">{value}</span>
    </span>
  );
}

/** 《Markdown 江湖》主界面：以独立标签页的形式占满整个内容区 */
export function WuxiaPanel() {
  const save = useWuxiaStore((s) => s.save);
  const tab = useWuxiaStore((s) => s.tab);
  const selectedMap = useWuxiaStore((s) => s.selectedMap);
  const battle = useWuxiaStore((s) => s.battle);
  const recentBattles = useWuxiaStore((s) => s.recentBattles);
  const toast = useWuxiaStore((s) => s.toast);
  const [selectedUid, setSelectedUid] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<EquipSlot>("weapon");
  const [sellQuality, setSellQuality] = useState<Quality>("common");
  const [protectUpgrades, setProtectUpgrades] = useState(false);

  useEffect(() => {
    useWuxiaStore.getState().ensureLoaded();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => useWuxiaStore.getState().dismissToast(), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const today = todayKey();
  const offerable = useMemo(() => offerableQuests(save), [save]);

  const markdown = useMemo(() => {
    switch (tab) {
      case "map":
        return mapPanel(save, selectedMap);
      case "battle":
        return battlePanel(save, battle, recentBattles);
      case "bag":
        return bagPanel(save, selectedSlot);
      case "skill":
        return skillPanel(save);
      case "quest":
        return questPanel(save, today, offerable);
      case "sect":
        return sectPanel(save);
      case "dungeon":
        return dungeonPanel(save, today);
      case "idle":
        return idlePanel(save);
      default:
        return "";
    }
  }, [tab, save, selectedMap, battle, recentBattles, selectedSlot, today, offerable]);

  const map = MAPS.find((m) => m.id === selectedMap);
  const canEnterMap =
    map != null &&
    save.player.level >= map.minLevel &&
    (save.maps.includes(map.id) || map.id === "qingshi");
  const stats = totalStats(save.player);
  const realm = realmOf(save.player.level);
  const sortedInventory = useMemo(
    () => [...save.player.inventory].sort((a, b) => itemScore(b) - itemScore(a)),
    [save.player.inventory],
  );
  const inventoryItem =
    sortedInventory.find((i) => i.uid === selectedUid) ?? sortedInventory[0] ?? null;
  const equippedSlotItem = save.player.equipment[selectedSlot];
  const readyQuests = save.quests.active.filter((id) => questReady(save, id));
  const dungeonRemain = Object.values(DUNGEON_MAP).reduce((sum, d) => {
    const record = save.dungeonDaily[d.id];
    const used = record && record.date === today ? record.used : 0;
    return sum + Math.max(0, d.dailyLimit - used);
  }, 0);

  const badges: Partial<Record<WuxiaTab, string>> = {
    bag: save.player.inventory.length > 0 ? String(save.player.inventory.length) : "",
    quest: readyQuests.length > 0 ? String(readyQuests.length) : "",
    dungeon: dungeonRemain > 0 ? String(dungeonRemain) : "",
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      {/* 顶部角色概览 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          <Icon name="sword" size={15} className="text-accent" />
          {save.player.name} · {save.player.level} 级 · {realm.name}
        </span>
        <span className="text-[11px] text-faint">{save.title}</span>
        <span className="mx-1 h-4 w-px bg-line" />
        <StatChip label="气血" value={`${Math.round(save.player.hp)}/${Math.round(stats.hp)}`} />
        <StatChip label="内力" value={`${Math.round(save.player.mp)}/${Math.round(stats.mp)}`} />
        <StatChip label="修为" value={Math.round(save.player.exp).toLocaleString()} hint="修为即经验，用于学习与提升武学" />
        <StatChip label="银两" value={Math.round(save.player.silver).toLocaleString()} />
        <StatChip label="贡献" value={Math.round(save.player.contribution).toLocaleString()} />
        <StatChip
          label="战力"
          value={Math.round(stats.atk * 3 + stats.def * 2 + stats.agi * 1.5 + stats.hp * 0.3).toLocaleString()}
        />
        {save.idle.config.enabled ? (
          <span className="rounded-md border border-accent bg-accent-soft px-2 py-[3px] text-[11px] text-accent">
            挂机中 · {MAPS.find((m) => m.id === save.idle.config.mapId)?.name}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
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
          <Button variant="ghost" onClick={() => useAppStore.getState().closeGame()}>
            回到文档
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左栏：角色卡 */}
        <div className="hidden w-[340px] shrink-0 overflow-auto border-r border-line bg-app px-4 py-3 lg:block">
          <MarkdownBlock source={characterCard(save)} />
          <div className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
            已装备 {Object.values(save.player.equipment).filter(Boolean).length}/6 件 · 装备总评分{" "}
            {Object.values(save.player.equipment).reduce(
              (sum, item) => sum + (item ? itemScore(item) : 0),
              0,
            )}{" "}
            · 累计出战 {save.stats.battles.toLocaleString()} 场
          </div>
        </div>

        {/* 右栏：页签 + 内容 + 操作 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-line px-3 py-2">
            {TABS.map((item) => {
              const badge = badges[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => useWuxiaStore.getState().setTab(item.id)}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                    tab === item.id
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-line bg-elevated text-muted hover:bg-hover hover:text-fg"
                  }`}
                >
                  {item.label}
                  {badge ? (
                    <span
                      className={`rounded px-1 text-[10px] ${
                        tab === item.id ? "bg-accent-fg/20" : "bg-accent-soft text-accent"
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <MarkdownBlock source={markdown} />
          </div>

          {/* 操作区 */}
          <div className="shrink-0 border-t border-line bg-panel px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {tab === "map" ? (
                <>
                  <MapSelect save={save} value={selectedMap} />
                  <SmallButton
                    tone="primary"
                    disabled={!canEnterMap}
                    onClick={() => useWuxiaStore.getState().setTab("battle")}
                    title={canEnterMap ? "进入此地战斗" : "等级不足或未解锁"}
                  >
                    前往此地
                  </SmallButton>
                </>
              ) : null}

              {tab === "battle" ? (
                <>
                  <MapSelect save={save} value={selectedMap} />
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
                    title="精英（地图首领）：掉落更好，击败首领可解锁下一区域"
                  >
                    挑战首领/精英
                  </SmallButton>
                  <SmallButton
                    disabled={!canEnterMap}
                    onClick={() => {
                      for (let i = 0; i < 10; i += 1) useWuxiaStore.getState().fight(false);
                    }}
                    title="连续挑战 10 次（只保留最后一次过程）"
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
                    value={selectedSlot}
                    onChange={(event) => setSelectedSlot(event.target.value as EquipSlot)}
                    className="h-7 rounded-md border border-line bg-input px-2 text-[12px] text-fg"
                    title="选择要管理的部位"
                  >
                    {SLOTS.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  <SmallButton
                    tone="primary"
                    onClick={() => useWuxiaStore.getState().equipBestSlot(selectedSlot)}
                    title="该部位自动换上背包中评分最高的一件"
                  >
                    更换最优
                  </SmallButton>
                  <SmallButton
                    disabled={!equippedSlotItem}
                    onClick={() => equippedSlotItem && useWuxiaStore.getState().enhance(equippedSlotItem.uid)}
                    title="强化该部位当前装备（消耗银两与锻造材料）"
                  >
                    强化该部位
                  </SmallButton>
                  <SmallButton
                    disabled={!equippedSlotItem}
                    onClick={() => useWuxiaStore.getState().unequip(selectedSlot)}
                  >
                    卸下
                  </SmallButton>
                  <SmallButton tone="primary" onClick={() => useWuxiaStore.getState().equipBest()}>
                    一键全身换装
                  </SmallButton>
                  <span className="mx-1 h-4 w-px bg-line" />
                  <select
                    value={inventoryItem?.uid ?? ""}
                    onChange={(event) => setSelectedUid(event.target.value)}
                    className="h-7 max-w-[300px] rounded-md border border-line bg-input px-2 text-[12px] text-fg"
                    title="背包中的单件装备操作"
                  >
                    {sortedInventory.length === 0 ? <option value="">背包为空</option> : null}
                    {sortedInventory.map((item) => (
                      <option key={item.uid} value={item.uid}>
                        {QUALITY_META[item.quality].name}·{item.name}（评分 {itemScore(item)}）
                      </option>
                    ))}
                  </select>
                  <SmallButton
                    disabled={!inventoryItem}
                    onClick={() => inventoryItem && useWuxiaStore.getState().equip(inventoryItem.uid)}
                  >
                    装备
                  </SmallButton>
                  <SmallButton
                    disabled={!inventoryItem}
                    onClick={() => inventoryItem && useWuxiaStore.getState().enhance(inventoryItem.uid)}
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
                  <span className="mx-1 h-4 w-px bg-line" />
                  <select
                    value={sellQuality}
                    onChange={(event) => setSellQuality(event.target.value as Quality)}
                    className="h-7 rounded-md border border-line bg-input px-2 text-[12px] text-fg"
                    title="批量出售的品质上限"
                  >
                    {(["common", "fine", "rare", "epic"] as Quality[]).map((q) => (
                      <option key={q} value={q}>
                        {QUALITY_META[q].name}及以下
                      </option>
                    ))}
                  </select>
                  <SmallButton
                    tone="danger"
                    onClick={() => useWuxiaStore.getState().sellBelow(sellQuality, protectUpgrades)}
                  >
                    一键出售
                  </SmallButton>
                  <SmallButton
                    onClick={() => setProtectUpgrades((v) => !v)}
                    title="开启后：每个部位保留评分最高的一件，且不卖已强化的装备"
                  >
                    保留每部位最优：{protectUpgrades ? "开" : "关"}
                  </SmallButton>
                </>
              ) : null}

              {tab === "skill" ? (
                <>
                  {save.player.sect
                    ? Object.values(SKILL_MAP)
                        .filter((skill) => skill.sect === save.player.sect)
                        .map((skill) => {
                          const level = save.player.skills[skill.id] ?? 0;
                          return (
                            <SmallButton
                              key={skill.id}
                              tone={level > 0 ? "default" : "primary"}
                              title={`${skill.desc}｜消耗：银两 ${skill.cost.silver} · 贡献 ${skill.cost.contribution} · 修为 ${skill.cost.exp}`}
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
                  <span className="mx-1 h-4 w-px bg-line" />
                  <span className="text-[11px] text-faint">
                    修为（经验）来源：战斗、挂机、任务、秘境　当前 {Math.round(save.player.exp).toLocaleString()}
                  </span>
                </>
              ) : null}

              {tab === "quest" ? (
                <>
                  <SmallButton
                    tone={save.autoAccept ? "primary" : "default"}
                    onClick={() => useWuxiaStore.getState().setAutoAccept(!save.autoAccept)}
                    title="开启后，可接取的任务会在战斗/挂机时自动接下"
                  >
                    自动接取：{save.autoAccept ? "开" : "关"}
                  </SmallButton>
                  <span className="mx-1 h-4 w-px bg-line" />
                  {save.quests.active.map((id) => {
                    const quest = QUEST_MAP[id];
                    if (!quest) return null;
                    const ready = questReady(save, id);
                    const progress = Math.min(questProgress(save, id), questNeed(id));
                    const left =
                      quest.repeatDaily != null ? repeatRemaining(save, id, today) : undefined;
                    return (
                      <SmallButton
                        key={id}
                        tone={ready ? "primary" : "default"}
                        title={
                          ready
                            ? "目标已达成，点击交付；收集类任务会扣除对应材料"
                            : `尚未达成（${progress}/${questNeed(id)}）`
                        }
                        onClick={() => useWuxiaStore.getState().claimQuest(id)}
                      >
                        {ready ? "交付" : `进行中 ${progress}/${questNeed(id)}`}「{quest.title}」
                        {left !== undefined ? ` ${left} 次` : ""}
                      </SmallButton>
                    );
                  })}
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
                      title={`${dungeon.desc}｜门槛 ${dungeon.minLevel} 级｜今日 ${dungeon.dailyLimit} 次`}
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
                  <MapSelect
                    save={save}
                    value={save.idle.config.mapId}
                    onChange={(mapId) => {
                      useWuxiaStore.getState().selectMap(mapId);
                      useWuxiaStore.setState({
                        save: {
                          ...save,
                          idle: { ...save.idle, config: { ...save.idle.config, mapId } },
                        },
                      });
                    }}
                  />
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
                            config: { ...save.idle.config, fightElite: !save.idle.config.fightElite },
                          },
                        },
                      })
                    }
                    title="开启后挂机时有 20% 概率遭遇地图首领/精英"
                  >
                    挑战首领：{save.idle.config.fightElite ? "开" : "关"}
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
                  <span className="mx-1 h-4 w-px bg-line" />
                  {Object.entries(POTIONS).map(([id, potion]) => (
                    <SmallButton
                      key={id}
                      onClick={() => useWuxiaStore.getState().buyPotion(id, 5)}
                      title={`${potion.desc}｜每瓶 ${potion.price} 两，一次买 5 瓶`}
                    >
                      买 {potion.name} ×5
                    </SmallButton>
                  ))}
                  <SmallButton
                    onClick={() => useWuxiaStore.getState().usePotion("jinchuang")}
                    title="按当前气血上限的 30% 恢复"
                  >
                    服金创药
                  </SmallButton>
                </>
              ) : null}
            </div>

            {toast ? (
              <div className="mt-2 rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-[12px] text-accent">
                {toast}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 地图选择（未解锁的不可选） */
function MapSelect({
  save,
  value,
  onChange,
}: {
  save: { maps: string[] };
  value: string;
  onChange?: (mapId: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => {
        const mapId = event.target.value;
        if (onChange) onChange(mapId);
        else useWuxiaStore.getState().selectMap(mapId);
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
  );
}
