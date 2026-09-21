/**
 * 《Markdown 江湖》类型定义
 *
 * 设计原则：引擎为纯函数（不依赖 DOM），数据全部放在 data.ts，
 * 便于后续只加数据不加代码地扩充内容。
 */

/** 装备品质 */
export type Quality = "common" | "fine" | "rare" | "epic" | "legend" | "divine";

/** 装备部位 */
export type EquipSlot = "weapon" | "head" | "body" | "hands" | "feet" | "accessory";

/** 门派 */
export type SectId = "qingcheng" | "shaolin" | "tangmen" | "xiaoyao";

/** 可加成属性 */
export interface Stats {
  /** 攻击 */
  atk: number;
  /** 防御 */
  def: number;
  /** 身法（闪避与出手） */
  agi: number;
  /** 气血上限 */
  hp: number;
  /** 内力上限 */
  mp: number;
  /** 暴击率（0~0.6） */
  crit: number;
  /** 吸血（0~0.3） */
  lifesteal: number;
}

export const ZERO_STATS: Stats = {
  atk: 0,
  def: 0,
  agi: 0,
  hp: 0,
  mp: 0,
  crit: 0,
  lifesteal: 0,
};

export interface EquipItem {
  uid: string;
  name: string;
  slot: EquipSlot;
  quality: Quality;
  /** 需求等级 */
  reqLevel: number;
  stats: Stats;
  /** 强化等级 0~10 */
  enhance: number;
  /** 售价（银两） */
  price: number;
  /** 出处说明 */
  from?: string;
}

/** 怪物模板 */
export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  agi: number;
  exp: number;
  silver: number;
  elite?: boolean;
  boss?: boolean;
  desc: string;
  /** 额外掉落材料 id */
  materials?: Array<{ id: string; chance: number; count: [number, number] }>;
}

/** 地图（区域） */
export interface MapDef {
  id: string;
  name: string;
  /** 进入所需等级 */
  minLevel: number;
  recommend: [number, number];
  desc: string;
  monsters: string[];
  elite?: string;
  dungeon?: string;
  /** 该地图的支线任务 */
  sideQuests: string[];
  /** 该地图的 NPC */
  npcs: Array<{ id: string; name: string; title: string; lines: string[] }>;
}

/** 技能效果 */
export interface SkillEffect {
  /** 多段攻击次数 */
  hits?: number;
  /** 群体攻击 */
  aoe?: boolean;
  /** 附加中毒（每回合伤害，持续 3 回合） */
  poison?: number;
  /** 治疗自己（最大气血比例） */
  heal?: number;
  /** 本场战斗减伤（比例） */
  shield?: number;
  /** 提升闪避（本场战斗） */
  dodgeUp?: number;
  /** 额外暴击率 */
  critBonus?: number;
  /** 吸血加成 */
  lifesteal?: number;
  /** 反击（受到攻击时反弹比例） */
  reflect?: number;
}

export interface SkillDef {
  id: string;
  name: string;
  sect: SectId;
  /** 技能树层级 */
  tier: number;
  reqLevel: number;
  /** 前置技能 */
  reqSkill?: string;
  /** 学习消耗：门派贡献 / 银两 / 修为（经验） */
  cost: { contribution: number; silver: number; exp: number };
  /** 内力消耗 */
  mp: number;
  /** 伤害系数 */
  coef: number;
  kind: "damage" | "aoe" | "heal" | "buff";
  effect?: SkillEffect;
  desc: string;
}

export interface SectDef {
  id: SectId;
  name: string;
  motto: string;
  desc: string;
  /** 门派所在地图 */
  mapId: string;
  /** 加入条件：等级 */
  minLevel: number;
  /** 入门试炼（需要击败的怪物） */
  trial?: string;
  skills: string[];
}

/** 任务目标 */
export type QuestObjective =
  | { type: "kill"; monsterId: string; count: number }
  | { type: "collect"; materialId: string; count: number }
  | { type: "dungeon"; dungeonId: string }
  | { type: "level"; level: number };

export interface QuestDef {
  id: string;
  kind: "main" | "side" | "daily";
  /** 主线章节 1~12 */
  chapter?: number;
  title: string;
  giver: string;
  mapId: string;
  /** 剧情（Markdown 引用块内容，逐段展示） */
  story: string[];
  objective: QuestObjective;
  reward: {
    exp: number;
    silver: number;
    contribution?: number;
    /** 保底装备品质 */
    equip?: Quality;
    materials?: Array<{ id: string; count: number }>;
  };
  /** 完成后解锁的地图 */
  unlockMap?: string;
  /** 下一章 */
  next?: string;
}

export interface DungeonDef {
  id: string;
  name: string;
  mapId: string;
  minLevel: number;
  desc: string;
  /** 每层怪物 */
  floors: string[];
  /** 每日可挑战次数 */
  dailyLimit: number;
  /** 通关奖励 */
  reward: {
    exp: number;
    silver: number;
    equip: Quality;
    materials?: Array<{ id: string; count: number }>;
    contribution?: number;
  };
}

export interface MaterialDef {
  id: string;
  name: string;
  desc: string;
  price: number;
}

/* ------------------------------ 玩家与存档 ------------------------------ */

export interface Player {
  name: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  silver: number;
  contribution: number;
  sect: SectId | null;
  /** 已学技能：skillId -> 等级(1~10) */
  skills: Record<string, number>;
  equipment: Partial<Record<EquipSlot, EquipItem>>;
  inventory: EquipItem[];
  /** 药品：potionId -> 数量 */
  potions: Record<string, number>;
  materials: Record<string, number>;
}

export interface QuestState {
  active: string[];
  progress: Record<string, number>;
  completed: string[];
  /** 日常任务最近重置日期（YYYY-MM-DD） */
  dailyDate?: string;
}

export interface IdleConfig {
  enabled: boolean;
  mapId: string;
  /** 是否自动使用金创药 */
  autoHeal: boolean;
  /** 气血低于该比例时用药 */
  healThreshold: number;
  /** 是否挑战精英 */
  fightElite: boolean;
  /** 是否拾取凡品装备 */
  collectCommon: boolean;
}

export interface IdleReport {
  minutes: number;
  battles: number;
  kills: number;
  exp: number;
  silver: number;
  drops: string[];
  leveledTo: number;
  deaths: number;
}

export interface IdleState {
  config: IdleConfig;
  /** 最近一次结算时间戳 */
  lastTick: number;
  /** 本次挂机累计 */
  session: { startedAt: number; battles: number; kills: number; exp: number; silver: number; drops: string[]; deaths: number };
  /** 日志（最近 200 行） */
  log: string[];
  /** 离线/挂机报告 */
  report: IdleReport | null;
}

export interface DungeonRun {
  dungeonId: string;
  floor: number;
  /** 已获得但未入账的奖励（撤退也保留） */
  pending: { exp: number; silver: number; drops: EquipItem[]; materials: Record<string, number> };
  log: string[];
}

export interface SaveGame {
  version: number;
  createdAt: number;
  lastSeen: number;
  player: Player;
  quests: QuestState;
  /** 已解锁地图 */
  maps: string[];
  idle: IdleState;
  dungeonRun: DungeonRun | null;
  /** 副本今日剩余次数 */
  dungeonDaily: Record<string, { date: string; used: number }>;
  stats: {
    kills: number;
    deaths: number;
    dungeonClears: number;
    battles: number;
    playMs: number;
  };
  achievements: string[];
  title: string;
}

/* ------------------------------ 引擎输入输出 ------------------------------ */

export interface CombatOptions {
  /** 可用药品数量 */
  potions: number;
  autoHeal: boolean;
  healThreshold: number;
  /** 是否挑战精英 */
  elite: boolean;
}

export interface CombatResult {
  win: boolean;
  rounds: string[];
  exp: number;
  silver: number;
  drops: EquipItem[];
  materials: Record<string, number>;
  hp: number;
  mp: number;
  potionsUsed: number;
  /** 玩家是否阵亡 */
  died: boolean;
  monster: MonsterDef;
}
