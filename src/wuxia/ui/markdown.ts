/**
 * 《Markdown 江湖》面板的 Markdown 生成
 * 所有面板都用 Markdown 呈现：表格做数据、任务列表做清单、提示块做提醒
 */

import {
  DUNGEON_MAP,
  MAPS,
  MAP_BY_ID,
  MATERIAL_MAP,
  MONSTER_MAP,
  POTIONS,
  QUALITY_META,
  QUALITY_ORDER,
  QUEST_MAP,
  REALMS,
  SECTS,
  SECT_BY_ID,
  SKILLS,
  SKILL_MAP,
} from "../data";
import {
  enhancedStats,
  itemScore,
  realmOf,
  statsMarkdown,
  totalStats,
} from "../engine";
import type { EquipItem, QuestDef, SaveGame, SectId } from "../types";

/** 字符进度条 */
export function bar(current: number, max: number, length = 10): string {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const filled = Math.round(ratio * length);
  return `${"▓".repeat(filled)}${"░".repeat(length - filled)} ${Math.round(ratio * 100)}%`;
}

/** 数字千分位 */
export function num(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 角色卡 */
export function characterCard(save: SaveGame): string {
  const p = save.player;
  const stats = totalStats(p);
  const realm = realmOf(p.level);
  const need = Math.round(100 * Math.pow(p.level, 1.6));
  const sect = p.sect ? SECT_BY_ID[p.sect]?.name ?? p.sect : "无门无派";
  return [
    `## ${p.name} · ${p.level} 级 · ${realm.name}`,
    "",
    `**${sect}**　称号：**${save.title}**　战力 **${num(
      stats.atk * 3 + stats.def * 2 + stats.agi * 1.5 + stats.hp * 0.3,
    )}**`,
    "",
    "| 资源 | 数值 | 进度 |",
    "| --- | --- | --- |",
    `| 气血 | ${num(p.hp)} / ${num(stats.hp)} | \`${bar(p.hp, stats.hp)}\` |`,
    `| 内力 | ${num(p.mp)} / ${num(stats.mp)} | \`${bar(p.mp, stats.mp)}\` |`,
    `| 经验 | ${num(p.exp)} / ${num(need)} | \`${bar(p.exp, need)}\` |`,
    "",
    statsMarkdown(stats),
    "",
    `银两 **${num(p.silver)}** · 门派贡献 **${num(p.contribution)}** · 弟子 ${num(
      save.stats.kills,
    )} 战 · 秘境 ${num(save.stats.dungeonClears)} 次`,
  ].join("\n");
}

/** 地图面板 */
export function mapPanel(save: SaveGame, selectedMap: string): string {
  const lines = ["### 江湖地图", "", "> 选择一处地方探索，等级不足的区域无法进入。", ""];
  lines.push("| 区域 | 建议等级 | 状态 | 说明 |");
  lines.push("| --- | --- | --- | --- |");
  for (const map of MAPS) {
    const unlocked = save.maps.includes(map.id) || map.id === "qingshi";
    const current = map.id === selectedMap ? "==当前==" : "";
    lines.push(
      `| ${unlocked ? "" : "🔒 "}${map.name} ${current} | ${map.recommend[0]}–${map.recommend[1]} | ${
        unlocked ? (save.player.level >= map.minLevel ? "可前往" : `需 ${map.minLevel} 级`) : "未解锁"
      } | ${map.desc} |`,
    );
  }
  const map = MAP_BY_ID[selectedMap];
  if (map) {
    lines.push("", `#### ${map.name}`, "", `> ${map.desc}`, "");
    lines.push("**出没怪物**", "");
    for (const id of map.monsters) {
      const m = MONSTER_MAP[id];
      if (!m) continue;
      if (save.player.level >= m.level + 8) {
        lines.push(`- [x] ${m.name}（${m.level} 级）· 已被你视作等闲`);
      } else {
        lines.push(`- [ ] ${m.name}（${m.level} 级）· ${m.desc}`);
      }
    }
    if (map.elite) {
      const elite = MONSTER_MAP[map.elite];
      if (elite) lines.push("", `> [!WARNING] 精英：**${elite.name}**（${elite.level} 级）— ${elite.desc}`);
    }
    if (map.dungeon) {
      lines.push("", `> [!NOTE] 秘境：${DUNGEON_MAP[map.dungeon]?.name ?? ""}（可从「秘境」页进入）`);
    }
    if (map.npcs.length > 0) {
      const npc = map.npcs[0];
      lines.push("", `**${npc.name}**（${npc.title}）：「${npc.lines[0]}」`);
    }
  }
  return lines.join("\n");
}

/** 战斗记录 */
export function battlePanel(save: SaveGame, log: string[]): string {
  const map = MAP_BY_ID[save.idle.config.mapId];
  return [
    "### 战斗",
    "",
    `当前所在：**${map?.name ?? "青石镇"}**　累计出战 **${num(save.stats.battles)}** 场　击败 **${num(
      save.stats.kills,
    )}** 名敌人　力竭 **${num(save.stats.deaths)}** 次`,
    "",
    log.length > 0 ? log.join("\n\n") : "> 还没有战斗记录。点击下方按钮开始挑战。",
  ].join("\n");
}

/** 装备行描述 */
function equipLine(item: EquipItem, equipped: boolean): string {
  const s = enhancedStats(item);
  const parts: string[] = [];
  if (s.atk) parts.push(`攻+${Math.round(s.atk)}`);
  if (s.def) parts.push(`防+${Math.round(s.def)}`);
  if (s.agi) parts.push(`身+${Math.round(s.agi)}`);
  if (s.hp) parts.push(`血+${Math.round(s.hp)}`);
  if (s.mp) parts.push(`气+${Math.round(s.mp)}`);
  if (s.crit) parts.push(`暴+${(s.crit * 100).toFixed(1)}%`);
  if (s.lifesteal) parts.push(`吸+${(s.lifesteal * 100).toFixed(1)}%`);
  const enhance = item.enhance > 0 ? ` **+${item.enhance}**` : "";
  return `${QUALITY_META[item.quality].mark} ${item.name}${enhance}${
    equipped ? "（已装备）" : ""
  }　${parts.join(" ")}　评分 ${itemScore(item)}`;
}

/** 背包 / 装备面板 */
export function bagPanel(save: SaveGame): string {
  const p = save.player;
  const slotNames: Record<string, string> = {
    weapon: "武器",
    head: "头部",
    body: "衣甲",
    hands: "手部",
    feet: "足部",
    accessory: "饰品",
  };
  const lines: string[] = ["### 装备", "", "| 部位 | 装备 |", "| --- | --- |"];
  for (const [slot, name] of Object.entries(slotNames)) {
    const item = p.equipment[slot as keyof typeof p.equipment];
    lines.push(`| ${name} | ${item ? equipLine(item, true) : "—"} |`);
  }

  lines.push("", `### 背包（${p.inventory.length}/200）`, "");
  if (p.inventory.length === 0) {
    lines.push("> 背包空空如也，去战斗或秘境里找些装备吧。");
  } else {
    lines.push("| # | 装备 | 需求 |", "| --- | --- | --- |");
    p.inventory.slice(0, 30).forEach((item, index) => {
      lines.push(`| ${index + 1} | ${equipLine(item, false)} | ${item.reqLevel} 级 |`);
    });
    if (p.inventory.length > 30) lines.push("", `> 其余 ${p.inventory.length - 30} 件已省略，可在下方下拉框中选择。`);
  }

  const materials = Object.entries(p.materials).filter(([, count]) => count > 0);
  lines.push("", "### 材料", "");
  if (materials.length === 0) lines.push("> 暂无材料。");
  else {
    lines.push("| 材料 | 数量 | 用途 |", "| --- | --- | --- |");
    for (const [id, count] of materials) {
      const def = MATERIAL_MAP[id];
      lines.push(`| ${def?.name ?? id} | ${count} | ${def?.desc ?? ""} |`);
    }
  }

  lines.push("", "### 药品", "");
  lines.push("| 药品 | 数量 | 效果 | 单价 |", "| --- | --- | --- | --- |");
  for (const [id, potion] of Object.entries(POTIONS)) {
    lines.push(
      `| ${potion.name} | ${p.potions[id] ?? 0} | ${
        potion.heal > 0 ? `回复 ${potion.heal} 气血` : `回复 ${potion.mana} 内力`
      } | ${potion.price} |`,
    );
  }
  return lines.join("\n");
}

/** 武学面板 */
export function skillPanel(save: SaveGame): string {
  const p = save.player;
  if (!p.sect) {
    return [
      "### 武学",
      "",
      "> [!WARNING] 你尚未拜入任何门派。",
      "> 到「门派」页选择一门武学，才能学习招式与绝学。",
      "",
      `当前等级 **${p.level}**，银两 **${num(p.silver)}**。`,
    ].join("\n");
  }
  const sect = SECT_BY_ID[p.sect];
  const lines = [
    `### ${sect?.name ?? ""}武学`,
    "",
    `> ${sect?.motto ?? ""}`,
    "",
    "| 武学 | 层级 | 状态 | 效果 | 消耗 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const skillId of sect?.skills ?? []) {
    const skill = SKILL_MAP[skillId];
    if (!skill) continue;
    const level = p.skills[skillId] ?? 0;
    const status =
      level > 0
        ? `**${level} 层**`
        : p.level < skill.reqLevel
          ? `需 ${skill.reqLevel} 级`
          : skill.reqSkill && !p.skills[skill.reqSkill]
            ? "需前置"
            : "可学习";
    lines.push(
      `| ${skill.name} | ${skill.tier} | ${status} | ${skill.desc} | 银两 ${num(
        skill.cost.silver,
      )} · 贡献 ${skill.cost.contribution} |`,
    );
  }
  return lines.join("\n");
}

/** 任务面板 */
export function questPanel(save: SaveGame): string {
  const lines: string[] = ["### 任务", ""];
  const active = save.quests.active;
  if (active.length === 0) lines.push("> 暂无进行中的任务。");
  else {
    lines.push("**进行中**", "");
    for (const id of active) {
      const quest = QUEST_MAP[id];
      if (!quest) continue;
      const need =
        quest.objective.type === "level"
          ? quest.objective.level
          : quest.objective.type === "dungeon"
            ? 1
            : quest.objective.count;
      const done = save.quests.progress[id] ?? 0;
      const progress = Math.min(done, need);
      const badge = progress >= need ? " ✅ **可交付**" : "";
      lines.push(
        `- [${progress >= need ? "x" : " "}] **${quest.title}**${quest.chapter ? `（第 ${quest.chapter} 章）` : ""}${badge}`,
      );
      lines.push(`  - 委托人：${quest.giver}`);
      lines.push(
        `  - 目标：${objectiveText(quest)}　进度 \`${bar(progress, need, 8)}\``,
      );
      lines.push(
        `  - 奖励：经验 ${num(quest.reward.exp)} · 银两 ${num(quest.reward.silver)}${
          quest.reward.contribution ? ` · 贡献 ${quest.reward.contribution}` : ""
        }${quest.reward.equip ? ` · ${QUALITY_META[quest.reward.equip].name}装备` : ""}`,
      );
      if (quest.story.length > 0) {
        lines.push(`  - 剧情：> ${quest.story[0]}`);
      }
    }
  }

  const completed = save.quests.completed;
  if (completed.length > 0) {
    lines.push("", `**已完成（${completed.length}）**`, "");
    lines.push(
      completed.map((id) => `\`${QUEST_MAP[id]?.title ?? id}\``).join("　"),
    );
  }
  return lines.join("\n");
}

function objectiveText(quest: QuestDef): string {
  const obj = quest.objective;
  if (obj.type === "kill") return `击败 ${MONSTER_MAP[obj.monsterId]?.name ?? obj.monsterId} × ${obj.count}`;
  if (obj.type === "collect") return `收集 ${MATERIAL_MAP[obj.materialId]?.name ?? obj.materialId} × ${obj.count}`;
  if (obj.type === "dungeon") return `通关秘境「${DUNGEON_MAP[obj.dungeonId]?.name ?? obj.dungeonId}」`;
  return `达到 ${obj.level} 级`;
}

/** 门派面板 */
export function sectPanel(save: SaveGame): string {
  const p = save.player;
  if (p.sect) {
    const sect = SECT_BY_ID[p.sect];
    const mastery = (sect?.skills ?? []).reduce((sum, id) => sum + (p.skills[id] ?? 0), 0);
    return [
      `### ${sect?.name ?? ""}`,
      "",
      `> ${sect?.motto ?? ""}`,
      "",
      `你是本门**${p.level >= 45 ? "长老" : p.level >= 25 ? "核心弟子" : "入门弟子"}**，已修习武学 ${mastery} 层，门派贡献 **${num(
        p.contribution,
      )}**。`,
      "",
      "**本门武学**",
      "",
      ...(sect?.skills ?? []).map((id) => {
        const skill = SKILL_MAP[id];
        const level = p.skills[id] ?? 0;
        return `- ${level > 0 ? `[x] **${skill.name}**（${level} 层）` : `[ ] ${skill.name}`}`;
      }),
      "",
      "> [!NOTE] 门派贡献来源：主线/支线任务、日常任务。武学可在「武学」页学习与提升。",
    ].join("\n");
  }

  const lines = [
    "### 拜入门派",
    "",
    "> 江湖有四门，各有所长。拜入之后可学习本门武学（需门派贡献与银两）。",
    "",
    "| 门派 | 所在地 | 入门等级 | 特色 |",
    "| --- | --- | --- | --- |",
  ];
  for (const sect of SECTS) {
    lines.push(
      `| **${sect.name}** | ${MAP_BY_ID[sect.mapId]?.name ?? ""} | ${sect.minLevel} | ${sect.desc} |`,
    );
  }
  lines.push("");
  for (const sect of SECTS) {
    lines.push(`> [!NOTE] ${sect.name}　「${sect.motto}」`);
  }
  return lines.join("\n");
}

/** 秘境面板 */
export function dungeonPanel(save: SaveGame, today: string): string {
  const lines = ["### 秘境", "", "> 秘境分层推进，每层可战可退；撤退也保留已得奖励。", ""];

  if (save.dungeonRun) {
    const run = save.dungeonRun;
    const def = DUNGEON_MAP[run.dungeonId];
    lines.push(
      `#### 进行中：${def?.name ?? run.dungeonId}　第 ${run.floor + 1} / ${def?.floors.length ?? 0} 层`,
      "",
      `已在手中：经验 **${num(run.pending.exp)}** · 银两 **${num(run.pending.silver)}** · 装备 ${
        run.pending.drops.length
      } 件`,
      "",
      run.log.length > 0 ? run.log.slice(0, 6).map((l) => `- ${l}`).join("\n") : "",
    );
    return lines.join("\n");
  }

  lines.push("| 秘境 | 所在地 | 门槛 | 层数 | 今日剩余 |", "| --- | --- | --- | --- | --- |");
  for (const dungeon of Object.values(DUNGEON_MAP)) {
    const record = save.dungeonDaily[dungeon.id];
    const used = record && record.date === today ? record.used : 0;
    const remain = Math.max(0, dungeon.dailyLimit - used);
    lines.push(
      `| ${dungeon.name} | ${MAP_BY_ID[dungeon.mapId]?.name ?? ""} | ${dungeon.minLevel} 级 | ${
        dungeon.floors.length
      } | ${remain}/${dungeon.dailyLimit} |`,
    );
  }
  lines.push("", "**保底奖励**", "");
  for (const dungeon of Object.values(DUNGEON_MAP)) {
    lines.push(
      `- ${dungeon.name}：经验 ${num(dungeon.reward.exp)} · 银两 ${num(
        dungeon.reward.silver,
      )} · ${QUALITY_META[dungeon.reward.equip].name}装备 ×1`,
    );
  }
  return lines.join("\n");
}

/** 挂机面板 */
export function idlePanel(save: SaveGame): string {
  const idle = save.idle;
  const map = MAP_BY_ID[idle.config.mapId];
  const session = idle.session;
  const lines = [
    "### 自动挂机",
    "",
    `状态：${idle.config.enabled ? "**挂机中**（每 5 秒一场）" : "已停止"}　地点：**${map?.name ?? ""}**`,
    "",
    "| 本次挂机 | 数值 |",
    "| --- | --- |",
    `| 场次 | ${num(session.battles)} |`,
    `| 经验 | ${num(session.exp)} |`,
    `| 银两 | ${num(session.silver)} |`,
    `| 拾取 | ${session.drops.length} 件 |`,
    `| 力竭 | ${num(session.deaths)} 次 |`,
    "",
    "**挂机设置**",
    "",
    `- [${idle.config.autoHeal ? "x" : " "}] 自动服用金创药（气血低于 ${Math.round(
      idle.config.healThreshold * 100,
    )}%）`,
    `- [${idle.config.fightElite ? "x" : " "}] 挑战精英怪（收益更高，风险更大）`,
    `- [${idle.config.collectCommon ? "x" : " "}] 拾取凡品装备（关闭则自动忽略）`,
    "",
    "> [!TIP] 离线也会按同样速率结算，最多补算 12 小时（超出部分收益减半）。",
  ];
  if (idle.report) {
    lines.push(
      "",
      "#### 上次离线收益",
      "",
      `离线 **${idle.report.minutes}** 分钟，战斗 **${num(idle.report.battles)}** 场，经验 **+${num(
        idle.report.exp,
      )}**，银两 **+${num(idle.report.silver)}**，拾取 ${idle.report.drops.length} 件，力竭 ${
        idle.report.deaths
      } 次。`,
    );
    if (idle.report.drops.length > 0) {
      lines.push("", `拾得：${idle.report.drops.slice(0, 12).map((n) => `\`${n}\``).join(" ")}`);
    }
  }
  if (idle.log.length > 0) {
    lines.push("", "#### 挂机日志（最近 20 条）", "", idle.log.slice(0, 20).map((l) => `- ${l}`).join("\n"));
  }
  return lines.join("\n");
}

/** 门派武学可学列表（供界面用） */
export function skillListOf(sect: SectId) {
  return SKILLS.filter((s) => s.sect === sect);
}

export const QUALITY_SORT = QUALITY_ORDER;
export const REALM_LIST = REALMS;
