/**
 * 《Markdown 江湖》引擎（纯函数，不依赖 DOM，可用 Node 直接模拟验证）
 */

import {
  ACHIEVEMENTS,
  DUNGEON_MAP,
  EQUIP_TEMPLATES,
  MAP_BY_ID,
  MATERIAL_MAP,
  MONSTER_MAP,
  QUALITY_AFFIX_COUNT,
  QUALITY_META,
  QUALITY_ORDER,
  REALMS,
  SKILL_MAP,
  TITLES,
} from "./data";
import {
  ZERO_STATS,
  type CombatResult,
  type DungeonRun,
  type EquipItem,
  type EquipSlot,
  type IdleReport,
  type IdleState,
  type MaterialDef,
  type MonsterDef,
  type Player,
  type QuestState,
  type Quality,
  type SaveGame,
  type SectId,
  type SkillDef,
  type Stats,
} from "./types";

/* ------------------------------ 随机与数值工具 ------------------------------ */

export const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const chance = (p: number) => Math.random() < p;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pick = <T,>(list: T[]): T => list[rand(0, list.length - 1)];

/** 升级所需经验 */
export const expForLevel = (level: number) => Math.round(100 * Math.pow(level, 1.6));

/**
 * 等级差收益衰减：越级挑战有少量加成，长期刷低级地图收益骤减。
 * 用于经验与银两（材料掉落不受影响），避免挂低级图刷级。
 */
export function rewardMultiplier(monsterLevel: number, playerLevel: number): number {
  const diff = monsterLevel - playerLevel;
  if (diff >= 0) return Math.min(1.2, 1 + diff * 0.03);
  return Math.max(0.08, 1 + diff * 0.12);
}

export const uid = () =>
  `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function addStats(a: Stats, b: Partial<Stats>): Stats {
  return {
    atk: a.atk + (b.atk ?? 0),
    def: a.def + (b.def ?? 0),
    agi: a.agi + (b.agi ?? 0),
    hp: a.hp + (b.hp ?? 0),
    mp: a.mp + (b.mp ?? 0),
    crit: a.crit + (b.crit ?? 0),
    lifesteal: a.lifesteal + (b.lifesteal ?? 0),
  };
}

export const scaleStats = (s: Partial<Stats>, mult: number): Stats => ({
  atk: (s.atk ?? 0) * mult,
  def: (s.def ?? 0) * mult,
  agi: (s.agi ?? 0) * mult,
  hp: (s.hp ?? 0) * mult,
  mp: (s.mp ?? 0) * mult,
  crit: (s.crit ?? 0) * mult,
  lifesteal: (s.lifesteal ?? 0) * mult,
});

/** 当前境界 */
export function realmOf(level: number) {
  let current = REALMS[0];
  for (const realm of REALMS) if (level >= realm.level) current = realm;
  return current;
}

/* ------------------------------ 玩家属性 ------------------------------ */

export function createPlayer(name = "无名少侠"): Player {
  return {
    name,
    level: 1,
    exp: 0,
    hp: 86,
    mp: 36,
    silver: 120,
    contribution: 0,
    sect: null,
    skills: {},
    inventory: [],
    potions: { jinchuang: 5 },
    materials: {},
    equipment: {
      weapon: {
        uid: "starter-sword",
        name: "旧木剑",
        slot: "weapon",
        quality: "common",
        reqLevel: 1,
        stats: { atk: 4, def: 0, agi: 1, hp: 10, mp: 0, crit: 0, lifesteal: 0 },
        enhance: 0,
        price: 10,
        from: "青石镇铁匠",
      },
      body: {
        uid: "starter-armor",
        name: "旧布衣",
        slot: "body",
        quality: "common",
        reqLevel: 1,
        stats: { atk: 0, def: 3, agi: 0, hp: 18, mp: 0, crit: 0, lifesteal: 0 },
        enhance: 0,
        price: 8,
        from: "柳伯所赠",
      },
      head: {
        uid: "starter-head",
        name: "旧头巾",
        slot: "head",
        quality: "common",
        reqLevel: 1,
        stats: { atk: 0, def: 2, agi: 0, hp: 10, mp: 0, crit: 0, lifesteal: 0 },
        enhance: 0,
        price: 6,
        from: "柳伯所赠",
      },
      feet: {
        uid: "starter-boots",
        name: "旧快靴",
        slot: "feet",
        quality: "common",
        reqLevel: 1,
        stats: { atk: 0, def: 1, agi: 3, hp: 6, mp: 0, crit: 0, lifesteal: 0 },
        enhance: 0,
        price: 6,
        from: "柳伯所赠",
      },
    },
  };
}

/** 基础属性（等级 + 境界加成） */
export function baseStats(level: number): Stats {
  const realm = realmOf(level);
  const mult = 1 + realm.bonus;
  return {
    atk: Math.round((5 + level * 2.2) * mult),
    def: Math.round((2 + level * 1.1) * mult),
    agi: Math.round((3 + level * 0.9) * mult),
    hp: Math.round((60 + level * 26) * mult),
    mp: Math.round((30 + level * 6) * mult),
    crit: clamp(0.05 + level * 0.002, 0, 0.2),
    lifesteal: 0,
  };
}

/** 装备总加成 */
export function equipmentStats(player: Player): Stats {
  let total = { ...ZERO_STATS };
  for (const item of Object.values(player.equipment)) {
    if (item) total = addStats(total, item.stats);
  }
  return total;
}

/** 最终属性 */
export function totalStats(player: Player): Stats {
  return addStats(baseStats(player.level), equipmentStats(player));
}

/** 战斗力（用于面板展示与副本门槛判断） */
export function powerOf(player: Player): number {
  const s = totalStats(player);
  return Math.round(s.atk * 3 + s.def * 2 + s.agi * 1.5 + s.hp * 0.3 + s.mp * 0.2);
}

/* ------------------------------ 装备生成 ------------------------------ */

export function generateEquip(options: {
  level: number;
  quality: Quality;
  slot?: EquipSlot;
  from?: string;
  nameHint?: string;
}): EquipItem {
  const slot = options.slot ?? (pick(["weapon", "head", "body", "hands", "feet", "accessory"]) as EquipSlot);
  const pool = EQUIP_TEMPLATES.filter((t) => t.slot === slot && QUALITY_ORDER.indexOf(t.minQuality) <= QUALITY_ORDER.indexOf(options.quality));
  const template = pool.length > 0 ? pick(pool) : EQUIP_TEMPLATES.find((t) => t.slot === slot) ?? EQUIP_TEMPLATES[0];
  const meta = QUALITY_META[options.quality];

  const budget = (1.6 + options.level * 0.85) * meta.mult;
  const stats: Stats = { ...ZERO_STATS };
  for (const [key, weight] of Object.entries(template.weights)) {
    const k = key as keyof Stats;
    stats[k] = Math.round(budget * (weight as number) * (0.9 + Math.random() * 0.2));
  }
  // 品质附带随机词条
  const affixCount = QUALITY_AFFIX_COUNT[options.quality];
  for (let i = 0; i < affixCount; i += 1) {
    const roll = rand(1, 100);
    if (roll <= 30) stats.atk += Math.round(options.level * 0.5 * meta.mult);
    else if (roll <= 55) stats.def += Math.round(options.level * 0.4 * meta.mult);
    else if (roll <= 70) stats.agi += Math.round(options.level * 0.35 * meta.mult);
    else if (roll <= 82) stats.hp += Math.round(options.level * 6 * meta.mult);
    else if (roll <= 90) stats.mp += Math.round(options.level * 3 * meta.mult);
    else if (roll <= 96) stats.crit += Number((0.02 * meta.mult).toFixed(3));
    else stats.lifesteal += Number((0.015 * meta.mult).toFixed(3));
  }

  const name = options.nameHint ? `${meta.name}·${options.nameHint}` : `${meta.name}${template.name}`;
  return {
    uid: uid(),
    name,
    slot,
    quality: options.quality,
    reqLevel: Math.max(1, Math.round(options.level * 0.8)),
    stats,
    enhance: 0,
    price: Math.round((20 + options.level * 12) * meta.mult),
    from: options.from,
  };
}

/** 强化加成：每级 +6% 主属性 */
export function enhancedStats(item: EquipItem): Stats {
  return scaleStats(item.stats, 1 + item.enhance * 0.06);
}

export function enhanceCost(item: EquipItem): { silver: number; iron: number } {
  const meta = QUALITY_META[item.quality];
  const level = item.enhance + 1;
  return {
    silver: Math.round(120 * level * meta.mult * (1 + item.reqLevel * 0.05)),
    iron: 1 + Math.floor(level / 2),
  };
}

/** 掉落判定 */
export function rollLoot(monster: MonsterDef): EquipItem[] {
  const drops: EquipItem[] = [];
  const base = monster.boss ? 1 : monster.elite ? 0.5 : 0.055;
  if (chance(base)) {
    const quality = rollQuality(monster);
    drops.push(generateEquip({ level: monster.level, quality, from: monster.name }));
  }
  if (monster.elite && chance(0.25)) {
    drops.push(generateEquip({ level: monster.level, quality: rollQuality(monster), from: monster.name }));
  }
  return drops;
}

export function rollQuality(monster: MonsterDef): Quality {
  const roll = rand(1, 1000);
  const bonus = monster.boss ? 3 : monster.elite ? 2 : 1;
  if (roll <= 2 * bonus) return "divine";
  if (roll <= 18 * bonus) return "legend";
  if (roll <= 90 * bonus) return "epic";
  if (roll <= 260 * bonus) return "rare";
  if (roll <= 540 * bonus) return "fine";
  return "common";
}

export function rollMaterials(monster: MonsterDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of monster.materials ?? []) {
    if (chance(entry.chance)) out[entry.id] = (out[entry.id] ?? 0) + rand(entry.count[0], entry.count[1]);
  }
  return out;
}

/* ------------------------------ 战斗 ------------------------------ */

export interface Fighter {
  name: string;
  level: number;
  stats: Stats;
  /** 已学技能 skillId -> level */
  skills: Record<string, number>;
  hp: number;
  mp: number;
  potions: number;
}

export interface BattleOptions {
  /** 是否使用药品 */
  autoHeal: boolean;
  healThreshold: number;
  /** 是否记录每回合日志 */
  verbose: boolean;
  maxRounds?: number;
}

interface EnemyUnit {
  def: MonsterDef;
  hp: number;
}

/** 选择本轮使用的技能（内力足够时用最高层级的伤害技能） */
export function chooseSkill(fighter: Fighter): SkillDef | null {
  const known = Object.entries(fighter.skills)
    .map(([id, level]) => ({ def: SKILL_MAP[id], level }))
    .filter((entry) => entry.def && entry.level > 0)
    .filter((entry) => entry.def.reqLevel <= fighter.level)
    .sort((a, b) => b.def.tier - a.def.tier);
  for (const entry of known) {
    if (entry.def.mp <= fighter.mp) return entry.def;
  }
  return null;
}

function skillMultiplier(skill: SkillDef, level: number): number {
  return 1 + (level - 1) * 0.08 + (skill.coef - 1);
}

function computeHit(atk: number, coef: number, def: number, crit: number): { damage: number; critical: boolean } {
  const raw = atk * coef - def * 0.6;
  const jitter = 0.9 + Math.random() * 0.2;
  const critical = chance(clamp(crit, 0, 0.75));
  const critMult = critical ? 1.5 + Math.random() * 0.5 : 1;
  return { damage: Math.max(1, Math.round(raw * jitter * critMult)), critical };
}

export function resolveCombat(
  fighter: Fighter,
  monsters: MonsterDef[],
  options: BattleOptions = { autoHeal: true, healThreshold: 0.4, verbose: true },
): CombatResult {
  const maxRounds = options.maxRounds ?? 40;
  const rounds: string[] = [];
  const enemies: EnemyUnit[] = monsters.map((def) => ({ def, hp: def.hp }));
  let hp = fighter.hp;
  let mp = fighter.mp;
  let potions = fighter.potions;
  let shield = 0;
  let dodgeUp = 0;
  let lifestealBonus = 0;
  let reflect = 0;
  const poisonStacks: number[] = enemies.map(() => 0);
  let potionsUsed = 0;
  const stats = fighter.stats;

  const totalHp = () => enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
  const aliveEnemies = () => enemies.filter((e) => e.hp > 0);

  for (let round = 1; round <= maxRounds; round += 1) {
    // ---- 用药 ----
    if (options.autoHeal && hp / stats.hp < options.healThreshold && potions > 0) {
      const heal = Math.max(60, Math.round(stats.hp * 0.35));
      hp = Math.min(stats.hp, hp + heal);
      potions -= 1;
      potionsUsed += 1;
      if (options.verbose) rounds.push(`第 ${round} 回合：你服下一枚丹药，回复 ${heal} 点气血（${hp}/${stats.hp}）。`);
    } else {
      // ---- 出手 ----
      const skill = chooseSkill({ ...fighter, hp, mp });
      const skillLevel = skill ? fighter.skills[skill.id] ?? 1 : 0;
      const living = aliveEnemies();
      if (living.length === 0) break;
      const primary = living[0];
      const targets = skill?.effect?.aoe ? living : [primary];
      const hits = skill?.effect?.hits ?? 1;
      const coef = skill ? skillMultiplier(skill, skillLevel) * (skill.effect?.aoe ? 1 : 1) : 1;
      if (skill) mp = Math.max(0, mp - skill.mp);

      let totalDamage = 0;
      for (const target of targets) {
        for (let h = 0; h < hits; h += 1) {
          if (target.hp <= 0) break;
          const { damage, critical } = computeHit(
            stats.atk,
            coef,
            target.def.def,
            stats.crit + (skill?.effect?.critBonus ?? 0),
          );
          target.hp -= damage;
          totalDamage += damage;
          if (options.verbose) {
            const label = skill ? `施展「${skill.name}」` : "普通攻击";
            const hitLabel = hits > 1 ? `（第 ${h + 1} 段）` : "";
            rounds.push(
              `第 ${round} 回合：你${label}${hitLabel}，对${target.def.name}造成 ==${damage}== 点伤害${
                critical ? "（**暴击**）" : ""
              }。`,
            );
          }
        }
      }

      // 技能附带效果
      const lifesteal = clamp(stats.lifesteal + (skill?.effect?.lifesteal ?? 0) + lifestealBonus, 0, 0.8);
      if (lifesteal > 0 && totalDamage > 0) {
        const heal = Math.round(totalDamage * lifesteal);
        hp = Math.min(stats.hp, hp + heal);
        if (options.verbose) rounds.push(`　　你吸食敌人内力，回复 ${heal} 点气血。`);
      }
      if (skill?.effect?.heal) {
        const heal = Math.round(stats.hp * skill.effect.heal);
        hp = Math.min(stats.hp, hp + heal);
        if (options.verbose) rounds.push(`　　内息流转，回复 ${heal} 点气血。`);
      }
      if (skill?.effect?.shield) shield = Math.max(shield, skill.effect.shield);
      if (skill?.effect?.dodgeUp) dodgeUp = Math.max(dodgeUp, skill.effect.dodgeUp);
      if (skill?.effect?.reflect) reflect = Math.max(reflect, skill.effect.reflect);
      if (skill?.effect?.lifesteal && !options.verbose) lifestealBonus = 0;
      if (skill?.effect?.poison) {
        for (const target of targets) {
          const index = enemies.indexOf(target);
          if (index >= 0) poisonStacks[index] = Math.max(poisonStacks[index], 3);
        }
      }
    }

    if (totalHp() <= 0) break;

    // ---- 敌人出手 ----
    for (const enemy of aliveEnemies()) {
      const dodgeChance = clamp(
        0.05 + (stats.agi + dodgeUp * 100 - enemy.def.agi) / 1000,
        0.02,
        0.5,
      );
      if (chance(dodgeChance)) {
        if (options.verbose) rounds.push(`　　你身形一闪，避开了${enemy.def.name}的攻击。`);
        continue;
      }
      const { damage, critical } = computeHit(enemy.def.atk, 1, stats.def, 0.08);
      const reduced = Math.max(1, Math.round(damage * (1 - shield)));
      hp -= reduced;
      if (options.verbose) rounds.push(`　　第 ${round} 回合：${enemy.def.name}击中你，造成 ${reduced} 点伤害${critical ? "（暴击）" : ""}。`);
      if (reflect > 0) {
        enemy.hp -= Math.round(reduced * reflect);
        if (options.verbose) rounds.push(`　　少林内劲反弹，${enemy.def.name}受到 ${Math.round(reduced * reflect)} 点反噬。`);
      }
      if (hp <= 0) break;
    }

    // ---- 中毒结算 ----
    for (let i = 0; i < enemies.length; i += 1) {
      if (poisonStacks[i] > 0 && enemies[i].hp > 0) {
        const dot = Math.max(1, Math.round(stats.atk * 0.18));
        enemies[i].hp -= dot;
        poisonStacks[i] -= 1;
        if (options.verbose) rounds.push(`　　毒力发作，${enemies[i].def.name}再受 ${dot} 点伤害。`);
      }
    }

    if (totalHp() <= 0) break;
    if (hp <= 0) break;
  }

  const win = totalHp() <= 0 && hp > 0;
  const died = hp <= 0;
  const monster = monsters[0];
  const rewardMult = rewardMultiplier(monster.level, fighter.level);
  const exp = win ? monsters.reduce((sum, m) => sum + Math.round(m.exp * rewardMult), 0) : 0;
  const silver = win ? monsters.reduce((sum, m) => sum + Math.round(m.silver * rewardMult), 0) : 0;
  const drops: EquipItem[] = [];
  const materials: Record<string, number> = {};
  if (win) {
    for (const m of monsters) {
      drops.push(...rollLoot(m));
      const rolled = rollMaterials(m);
      for (const [id, count] of Object.entries(rolled)) {
        materials[id] = (materials[id] ?? 0) + count;
      }
    }
  }

  return {
    win,
    rounds,
    exp,
    silver,
    drops,
    materials,
    hp: Math.max(died ? 1 : 1, hp),
    mp,
    potionsUsed,
    died,
    monster,
  };
}

/** 组织一群怪物：普通怪成群（低等级 1~2 只，之后 1~3 只），越级挑战只遇单只 */
export function buildMonsterGroup(monsterId: string, groupSize?: number): MonsterDef[] {
  const def = MONSTER_MAP[monsterId];
  if (!def) return [];
  const count = def.elite || def.boss ? 1 : clamp(groupSize ?? rand(1, 3), 1, 3);
  return Array.from({ length: count }, () => def);
}

/** 按玩家等级决定普通怪群规模 */
export function monsterGroupSize(monsterLevel: number, playerLevel: number): number {
  if (monsterLevel >= playerLevel + 5) return 1;
  return playerLevel < 12 ? rand(1, 2) : rand(1, 3);
}

/* ------------------------------ 升级 ------------------------------ */

export interface LevelUpResult {
  player: Player;
  levelsGained: number;
  messages: string[];
}

export function grantExp(player: Player, exp: number): LevelUpResult {
  const next: Player = { ...player, exp: player.exp + exp };
  const messages: string[] = [];
  let levelsGained = 0;
  while (next.level < 60 && next.exp >= expForLevel(next.level)) {
    next.exp -= expForLevel(next.level);
    next.level += 1;
    levelsGained += 1;
    const realm = realmOf(next.level);
    messages.push(`**升级！** 你已达到 ${next.level} 级（${realm.name}）`);
    const before = baseStats(next.level - 1);
    const after = baseStats(next.level);
    next.hp = Math.min(after.hp, next.hp + (after.hp - before.hp));
    next.mp = Math.min(after.mp, next.mp + (after.mp - before.mp));
  }
  if (next.level >= 60) next.exp = 0;
  return { player: next, levelsGained, messages };
}

/* ------------------------------ 任务进度 ------------------------------ */

export function progressKill(quests: QuestState, monsterId: string, count = 1): QuestState {
  return progressObjective(quests, (objective) => objective.type === "kill" && objective.monsterId === monsterId, count);
}

export function progressCollect(quests: QuestState, materialId: string, count = 1): QuestState {
  return progressObjective(quests, (objective) => objective.type === "collect" && objective.materialId === materialId, count);
}

export function progressDungeon(quests: QuestState, dungeonId: string): QuestState {
  return progressObjective(quests, (objective) => objective.type === "dungeon" && objective.dungeonId === dungeonId, 1);
}

export function progressLevel(quests: QuestState, level: number): QuestState {
  const progress = { ...quests.progress };
  for (const id of quests.active) {
    const quest = require_quest(id);
    if (quest?.objective.type === "level" && level >= quest.objective.level) {
      progress[id] = quest.objective.level;
    }
  }
  return { ...quests, progress };
}

// 避免循环依赖的轻量查表
let questLookup: ((id: string) => import("./types").QuestDef | undefined) | null = null;
export function registerQuestLookup(fn: (id: string) => import("./types").QuestDef | undefined) {
  questLookup = fn;
}
function require_quest(id: string) {
  return questLookup?.(id);
}

function progressObjective(
  quests: QuestState,
  match: (objective: import("./types").QuestObjective) => boolean,
  count: number,
): QuestState {
  const progress = { ...quests.progress };
  for (const id of quests.active) {
    const quest = require_quest(id);
    if (!quest || !match(quest.objective)) continue;
    const current = progress[id] ?? 0;
    progress[id] = current + count;
  }
  return { ...quests, progress };
}

/** 任务是否完成 */
export function questComplete(questId: string, quests: QuestState): boolean {
  const quest = require_quest(questId);
  if (!quest) return false;
  const need =
    quest.objective.type === "level"
      ? quest.objective.level
      : quest.objective.type === "dungeon"
        ? 1
        : quest.objective.count;
  return (quests.progress[questId] ?? 0) >= need;
}

export function questNeed(questId: string): number {
  const quest = require_quest(questId);
  if (!quest) return 1;
  if (quest.objective.type === "level") return quest.objective.level;
  if (quest.objective.type === "dungeon") return 1;
  return quest.objective.count;
}

/**
 * 任务当前进度：
 * - 收集类按「背包中实际持有的材料」计算（接了任务之前的材料同样算数）
 * - 等级类按当前等级
 * - 其余按任务进度
 */
export function questProgress(save: SaveGame, questId: string): number {
  const quest = require_quest(questId);
  if (!quest) return 0;
  if (quest.objective.type === "collect") {
    return save.player.materials[quest.objective.materialId] ?? 0;
  }
  if (quest.objective.type === "level") return save.player.level;
  return save.quests.progress[questId] ?? 0;
}

/** 任务是否可交付 */
export function questReady(save: SaveGame, questId: string): boolean {
  if (!require_quest(questId)) return false;
  return questProgress(save, questId) >= questNeed(questId);
}

/* ------------------------------ 材料 / 背包 ------------------------------ */

export function addMaterials(player: Player, gained: Record<string, number>): Player {
  const materials = { ...player.materials };
  for (const [id, count] of Object.entries(gained)) {
    materials[id] = (materials[id] ?? 0) + count;
  }
  return { ...player, materials };
}

export function takeMaterials(player: Player, need: Record<string, number>): Player | null {
  const materials = { ...player.materials };
  for (const [id, count] of Object.entries(need)) {
    if ((materials[id] ?? 0) < count) return null;
    materials[id] -= count;
    if (materials[id] <= 0) delete materials[id];
  }
  return { ...player, materials };
}

/** 装备一件物品，返回新的玩家与换下的装备 */
export function equipItem(player: Player, item: EquipItem): { player: Player; replaced: EquipItem | null } {
  const replaced = player.equipment[item.slot] ?? null;
  const inventory = player.inventory.filter((i) => i.uid !== item.uid);
  if (replaced) inventory.push(replaced);
  return {
    player: {
      ...player,
      equipment: { ...player.equipment, [item.slot]: item },
      inventory,
    },
    replaced,
  };
}

/** 自动比较两件装备的收益（用于背包提示） */
export function compareEquip(item: EquipItem, current: EquipItem | undefined): Stats {
  const a = enhancedStats(item);
  const b = current ? enhancedStats(current) : { ...ZERO_STATS };
  return {
    atk: a.atk - b.atk,
    def: a.def - b.def,
    agi: a.agi - b.agi,
    hp: a.hp - b.hp,
    mp: a.mp - b.mp,
    crit: Number((a.crit - b.crit).toFixed(3)),
    lifesteal: Number((a.lifesteal - b.lifesteal).toFixed(3)),
  };
}

/** 装备评分（用于排序与自动拾取） */
export function itemScore(item: EquipItem): number {
  const s = enhancedStats(item);
  return Math.round(s.atk * 3 + s.def * 2 + s.agi * 1.5 + s.hp * 0.3 + s.mp * 0.2 + s.crit * 500 + s.lifesteal * 400);
}

/** 该装备是否比当前部位更好（含强化等级换算） */
export function isUpgrade(player: Player, item: EquipItem): boolean {
  const current = player.equipment[item.slot];
  if (item.reqLevel > player.level) return false;
  return itemScore(item) > (current ? itemScore(current) : 0);
}

export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "head", "body", "hands", "feet", "accessory"];

/** 一键装备：每个部位自动换上背包中最好的一件（只换更强且等级够的） */
export function autoEquipBest(player: Player): { player: Player; equipped: string[] } {
  let current = player;
  const names: string[] = [];
  for (const slot of EQUIP_SLOTS) {
    const candidates = current.inventory.filter((i) => i.slot === slot && i.reqLevel <= current.level);
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) => (itemScore(b) > itemScore(a) ? b : a));
    const equipped = current.equipment[slot];
    if (equipped && itemScore(equipped) >= itemScore(best)) continue;
    current = equipItem(current, best).player;
    names.push(best.name);
  }
  return { player: current, equipped: names };
}

/* ------------------------------ 挂机与离线 ------------------------------ */

export const IDLE_INTERVAL_MS = 5000;
/** 离线结算：每场战斗耗时更长（在线 5 秒 → 离线 25 秒） */
export const OFFLINE_INTERVAL_MS = 25000;
/** 离线收益效率：经验与银两按 12% 结算（材料与装备照常） */
export const OFFLINE_EFFICIENCY = 0.12;
export const OFFLINE_CAP_MS = 12 * 3600 * 1000;

export interface IdleSettleOptions {
  player: Player;
  mapId: string;
  elapsedMs: number;
  /** 是否记录详细日志 */
  verbose: boolean;
  maxBattles?: number;
  /** 每场战斗耗时（默认在线 5 秒） */
  intervalMs?: number;
  /** 经验/银两效率（离线降低，默认 1） */
  efficiency?: number;
}

export interface IdleSettleResult {
  player: Player;
  battles: number;
  /** 击败敌人数量（含群怪） */
  kills: number;
  exp: number;
  silver: number;
  drops: EquipItem[];
  materials: Record<string, number>;
  deaths: number;
  messages: string[];
}

/** 挂机结算（可同时用于在线 tick 与离线补算） */
export function idleSettle(options: IdleSettleOptions): IdleSettleResult {
  const map = MAP_BY_ID[options.mapId];
  const empty: IdleSettleResult = {
    player: options.player,
    battles: 0,
    kills: 0,
    exp: 0,
    silver: 0,
    drops: [],
    materials: {},
    deaths: 0,
    messages: [],
  };
  if (!map) return empty;

  const intervalMs = options.intervalMs ?? IDLE_INTERVAL_MS;
  const efficiency = options.efficiency ?? 1;
  const total = Math.floor(options.elapsedMs / intervalMs);
  const battles = Math.min(total, options.maxBattles ?? total);
  let player = options.player;
  let kills = 0;
  let exp = 0;
  let silver = 0;
  let deaths = 0;
  const drops: EquipItem[] = [];
  const materials: Record<string, number> = {};
  const messages: string[] = [];

  const pool = map.monsters;
  for (let i = 0; i < battles; i += 1) {
    const monsterId = pick(pool);
    const monsterLevel = MONSTER_MAP[monsterId]?.level ?? player.level;
    const group = buildMonsterGroup(
      monsterId,
      monsterGroupSize(monsterLevel, player.level),
    );
    const stats = totalStats(player);
    const fighter: Fighter = {
      name: player.name,
      level: player.level,
      stats,
      skills: player.skills,
      hp: player.hp,
      mp: player.mp,
      potions: sumPotions(player),
    };
    const result = resolveCombat(fighter, group, {
      autoHeal: true,
      healThreshold: 0.45,
      verbose: false,
    });
    if (result.win) kills += group.length;
    exp += Math.round(result.exp * efficiency);
    silver += Math.round(result.silver * efficiency);
    drops.push(...result.drops);
    for (const [id, count] of Object.entries(result.materials)) {
      materials[id] = (materials[id] ?? 0) + count;
    }
    if (result.died) {
      deaths += 1;
      player = { ...player, hp: Math.max(1, Math.round(stats.hp * 0.3)), mp: Math.round(stats.mp * 0.3) };
    } else {
      player = { ...player, hp: Math.max(1, result.hp), mp: result.mp };
    }
  }

  player = addMaterials({ ...player, silver: player.silver + silver }, materials);
  const levelResult = grantExp(player, exp);
  player = levelResult.player;
  messages.push(...levelResult.messages);
  if (deaths > 0) messages.push(`挂机途中有 ${deaths} 次力竭，均已就地调息恢复。`);
  if (drops.length > 0) messages.push(`拾得装备 ${drops.length} 件。`);

  return { player, battles, kills, exp, silver, drops, materials, deaths, messages };
}

function sumPotions(player: Player): number {
  return Object.values(player.potions).reduce((a, b) => a + b, 0);
}

/**
 * 离线结算：按时间戳补算。
 * 离线节奏更慢（25 秒一场），经验与银两只按 12% 结算；
 * 超过 12 小时的部分再减半，避免长时间离线一次性冲级。
 */
export function settleOffline(save: SaveGame, now: number): { save: SaveGame; report: IdleReport | null } {
  // 只取「上次结算时间」与「上次退出时间」的较晚者：
  // 不包含 createdAt，避免新档把离线时长算成 0
  const last = Math.max(save.idle.lastTick, save.lastSeen);
  const elapsed = Math.max(0, now - last);
  if (elapsed < 60_000) return { save, report: null };

  const capped = Math.min(elapsed, OFFLINE_CAP_MS);
  const overflow = Math.max(0, elapsed - OFFLINE_CAP_MS);
  const effective = capped + overflow * 0.5;

  const result = idleSettle({
    player: save.player,
    mapId: save.idle.config.mapId,
    elapsedMs: effective,
    verbose: false,
    intervalMs: OFFLINE_INTERVAL_MS,
    efficiency: OFFLINE_EFFICIENCY,
  });

  const report: IdleReport = {
    minutes: Math.round(elapsed / 60000),
    battles: result.battles,
    kills: result.kills,
    exp: result.exp,
    silver: result.silver,
    drops: result.drops.map((d) => d.name),
    leveledTo: result.player.level,
    deaths: result.deaths,
  };

  const player: Player = {
    ...result.player,
    inventory: [...save.player.inventory, ...result.drops].slice(0, 200),
  };

  return {
    save: {
      ...save,
      player,
      idle: { ...save.idle, lastTick: now, report },
      stats: {
        ...save.stats,
        battles: save.stats.battles + result.battles,
        kills: save.stats.kills + result.kills,
        deaths: save.stats.deaths + result.deaths,
      },
    },
    report,
  };
}

/* ------------------------------ 副本 ------------------------------ */

export function dungeonAvailable(save: SaveGame, dungeonId: string, today: string): number {
  const def = DUNGEON_MAP[dungeonId];
  if (!def) return 0;
  const record = save.dungeonDaily[dungeonId];
  const used = record && record.date === today ? record.used : 0;
  return Math.max(0, def.dailyLimit - used);
}

/* ------------------------------ 成就与称号 ------------------------------ */

export function checkAchievements(save: SaveGame): { achievements: string[]; unlocked: string[] } {
  const unlocked: string[] = [];
  const has = (id: string) => save.achievements.includes(id);
  const tryUnlock = (id: string, cond: boolean) => {
    if (!has(id) && cond) unlocked.push(id);
  };
  const { player, stats } = save;
  tryUnlock("first_blood", stats.kills >= 1);
  tryUnlock("hunter", stats.kills >= 100);
  tryUnlock("slayer", stats.kills >= 1000);
  tryUnlock("dungeon_1", stats.dungeonClears >= 1);
  tryUnlock("dungeon_10", stats.dungeonClears >= 10);
  tryUnlock("epic_gear", Object.values(player.equipment).some((i) => i && QUALITY_ORDER.indexOf(i.quality) >= 3));
  tryUnlock("legend_gear", Object.values(player.equipment).some((i) => i && QUALITY_ORDER.indexOf(i.quality) >= 4));
  tryUnlock("sect_member", player.sect !== null);
  tryUnlock("skill_max", Object.values(player.skills).some((level) => level >= 10));
  tryUnlock("idle_10h", stats.playMs >= 10 * 3600 * 1000);
  tryUnlock("rich", player.silver >= 100000);
  tryUnlock("main_clear", QUESTS_MAIN_COUNT > 0 && save.quests.completed.includes("main_12"));
  return {
    achievements: [...save.achievements, ...unlocked],
    unlocked: unlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id),
  };
}

export const QUESTS_MAIN_COUNT = 12;

export function titleOf(save: SaveGame): string {
  const level = save.player.level;
  let title = TITLES[0].name;
  if (level >= 10) title = TITLES[1].name;
  if (level >= 20) title = TITLES[2].name;
  if (level >= 30) title = TITLES[3].name;
  if (level >= 40) title = TITLES[4].name;
  if (level >= 50) title = TITLES[5].name;
  if (level >= 60) title = TITLES[6].name;
  if (save.quests.completed.includes("main_12")) title = TITLES[7].name;
  return title;
}

/* ------------------------------ 描述工具 ------------------------------ */

export function statsMarkdown(stats: Stats): string {
  return [
    `气血 **${Math.round(stats.hp)}** · 内力 **${Math.round(stats.mp)}**`,
    `攻击 **${Math.round(stats.atk)}** · 防御 **${Math.round(stats.def)}** · 身法 **${Math.round(stats.agi)}**`,
    `暴击 **${(stats.crit * 100).toFixed(1)}%** · 吸血 **${(stats.lifesteal * 100).toFixed(1)}%**`,
  ].join("　|　");
}

export function materialName(id: string): string {
  return MATERIAL_MAP[id]?.name ?? id;
}

export function materialList(materials: Record<string, number>): MaterialDef[] {
  return Object.keys(materials)
    .map((id) => MATERIAL_MAP[id])
    .filter((m): m is MaterialDef => Boolean(m));
}

export function sectName(sect: SectId | null): string {
  if (!sect) return "无门无派";
  return sect;
}

/** 判断能否学习技能 */
export function canLearnSkill(
  player: Player,
  skill: SkillDef,
): { ok: boolean; reason: string } {
  if (player.sect !== skill.sect) return { ok: false, reason: "非本门武学" };
  if (player.level < skill.reqLevel) return { ok: false, reason: `需 ${skill.reqLevel} 级` };
  if (skill.reqSkill && !player.skills[skill.reqSkill]) {
    return { ok: false, reason: `需先学会「${SKILL_MAP[skill.reqSkill]?.name ?? skill.reqSkill}」` };
  }
  if ((player.skills[skill.id] ?? 0) > 0) return { ok: false, reason: "已学会" };
  if (player.silver < skill.cost.silver) return { ok: false, reason: "银两不足" };
  if (player.contribution < skill.cost.contribution) return { ok: false, reason: "门派贡献不足" };
  if (player.exp < skill.cost.exp) return { ok: false, reason: `修为不足（需 ${skill.cost.exp} 经验）` };
  return { ok: true, reason: "" };
}

/** 技能升级消耗（按当前层数递增，同样消耗修为） */
export function skillUpgradeCost(skill: SkillDef, level: number) {
  return {
    silver: Math.round(skill.cost.silver * 0.6 * level),
    contribution: Math.round((skill.cost.contribution || 20) * 0.5 * level),
    exp: Math.round(skill.cost.exp * 0.3 * level),
  };
}

/** 日常任务每日重置：把已完成的日常放回可接取状态 */
export function resetDailies(save: SaveGame, today: string): SaveGame {
  if (save.quests.dailyDate === today) return save;
  const isDaily = (id: string) => {
    const quest = require_quest(id);
    return quest?.kind === "daily";
  };
  const progress = { ...save.quests.progress };
  for (const id of Object.keys(progress)) {
    if (isDaily(id)) delete progress[id];
  }
  return {
    ...save,
    quests: {
      ...save.quests,
      active: save.quests.active.filter((id) => !isDaily(id)),
      completed: save.quests.completed.filter((id) => !isDaily(id)),
      progress,
      dailyDate: today,
    },
  };
}

export function emptyIdle(mapId = "qingshi"): IdleState {
  return {
    config: {
      enabled: false,
      mapId,
      autoHeal: true,
      healThreshold: 0.45,
      fightElite: false,
      collectCommon: false,
    },
    lastTick: Date.now(),
    session: { startedAt: 0, battles: 0, kills: 0, exp: 0, silver: 0, drops: [], deaths: 0 },
    log: [],
    report: null,
  };
}

export function newDungeonRun(dungeonId: string): DungeonRun {
  return {
    dungeonId,
    floor: 0,
    pending: { exp: 0, silver: 0, drops: [], materials: {} },
    log: [`踏入 ${DUNGEON_MAP[dungeonId]?.name ?? dungeonId}。`],
  };
}
