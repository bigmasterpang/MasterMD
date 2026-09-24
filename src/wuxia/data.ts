/**
 * 《Markdown 江湖》内容数据
 *
 * 全部内容（怪物 / 装备 / 门派 / 技能 / 任务 / 副本）都在这里，
 * 后续扩充只需加数据，不用改引擎与界面。
 */

import type {
  DungeonDef,
  MaterialDef,
  MapDef,
  MonsterDef,
  Quality,
  QuestDef,
  SectDef,
  SkillDef,
} from "./types";

/* ------------------------------ 品质 ------------------------------ */

export const QUALITY_ORDER: Quality[] = ["common", "fine", "rare", "epic", "legend", "divine"];

export const QUALITY_META: Record<
  Quality,
  { name: string; color: string; mark: string; mult: number }
> = {
  common: { name: "凡品", color: "#8b949e", mark: "`凡品`", mult: 1 },
  fine: { name: "精良", color: "#3fb950", mark: "**精良**", mult: 1.25 },
  rare: { name: "稀有", color: "#58a6ff", mark: "*稀有*", mult: 1.6 },
  epic: { name: "史诗", color: "#a371f7", mark: "==史诗==", mult: 2.1 },
  legend: { name: "传说", color: "#f0883e", mark: "**==传说==**", mult: 2.8 },
  divine: { name: "神兵", color: "#ff7b72", mark: "**==神兵==**", mult: 3.6 },
};

/* ------------------------------ 地图与怪物 ------------------------------ */

export const MAPS: MapDef[] = [
  {
    id: "qingshi",
    name: "青石镇",
    minLevel: 1,
    recommend: [1, 8],
    desc: "江南小镇，青石板路被雨水磨得发亮。镇口贴着告示：近来山贼猖獗。",
    monsters: ["bandit", "wild_dog", "hooligan"],
    elite: "bandit_chief",
    boss: "bandit_chief",
    unlockNext: "luoxia",
    dungeon: "bandit_camp",
    sideQuests: ["side_herb", "side_sword", "side_thief", "side_hide"],
    npcs: [
      { id: "elder", name: "柳伯", title: "镇长", lines: ["少侠面生，可是初来青石镇？", "近来山贼劫道，若能除去，镇上必有重谢。"] },
      { id: "smith", name: "铁匠陈", title: "铁匠铺", lines: ["我这有把旧剑，你若能凑齐粗铁，我替你重铸。", "兵器如人，需常擦拭。"] },
      { id: "doctor", name: "采药人阿芸", title: "药铺", lines: ["山里蛇虫多，带些金创药吧。", "（她递来一个小瓷瓶）"] },
    ],
  },
  {
    id: "luoxia",
    name: "落霞谷",
    minLevel: 8,
    recommend: [8, 18],
    desc: "黄昏时整条山谷被染成金红，谷中狼群与毒蛇出没，也有采药贼偷挖灵草。",
    monsters: ["wolf", "viper", "herb_thief"],
    elite: "wolf_king",
    boss: "wolf_king",
    unlockNext: "duanhun",
    dungeon: "herb_valley",
    sideQuests: ["side_wolf", "side_poison", "side_medicine"],
    npcs: [
      { id: "hunter", name: "猎户老赵", title: "落霞谷", lines: ["狼王护着一株血参，谁也不敢近前。", "你若要去，记住：狼怕火，人怕贪。"] },
    ],
  },
  {
    id: "duanhun",
    name: "断魂崖",
    minLevel: 18,
    recommend: [18, 28],
    desc: "崖高千仞，栈道残破。传闻崖上住着山魈，也有亡命剑客在此比剑了断恩怨。",
    monsters: ["mountain_spirit", "desperate_swordsman", "cliff_demon"],
    elite: "sword_maniac",
    boss: "sword_maniac",
    unlockNext: "yanyu",
    dungeon: "cliff_trial",
    sideQuests: ["side_cliff", "side_swordman", "side_iron"],
    npcs: [
      { id: "monk", name: "无念禅师", title: "断魂崖", lines: ["崖上看云，心静则剑稳。", "施主身上杀气太重，去学一门内功吧。"] },
    ],
  },
  {
    id: "yanyu",
    name: "烟雨楼",
    minLevel: 28,
    recommend: [28, 38],
    desc: "楼在湖心，烟雨不散。楼中伶人善歌舞，暗处却藏着江湖最冷的刀。",
    monsters: ["assassin", "puppet", "poison_lady"],
    elite: "shadow_blade",
    boss: "shadow_blade",
    unlockNext: "damo",
    dungeon: "yanyu_secret",
    sideQuests: ["side_lady", "side_puppet"],
    npcs: [
      { id: "singer", name: "苏烟", title: "烟雨楼", lines: ["公子听曲么？一曲一两银子。", "……楼里的琴声，有时是信号。"] },
    ],
  },
  {
    id: "damo",
    name: "大漠孤城",
    minLevel: 38,
    recommend: [38, 48],
    desc: "黄沙吞没了旧城，沙盗横行，邪教护法在废墟中搜寻失落的剑谱。",
    monsters: ["sand_bandit", "sand_worm", "cult_guardian"],
    elite: "cult_elder",
    boss: "cult_elder",
    unlockNext: "jianzhong",
    dungeon: "lost_city",
    sideQuests: ["side_sand", "side_cult", "side_armor"],
    npcs: [
      { id: "merchant", name: "商队首领", title: "大漠孤城", lines: ["城里没有水，只有刀。", "邪教在挖东西，挖了很久了。"] },
    ],
  },
  {
    id: "jianzhong",
    name: "无名剑冢",
    minLevel: 48,
    recommend: [48, 60],
    desc: "万剑插地成冢，剑灵游荡。冢心处有一柄无名之剑，据说能斩断一切混乱。",
    monsters: ["sword_spirit", "tomb_keeper", "void_wraith"],
    elite: "sword_guard",
    boss: "tomb_lord",
    dungeon: "tomb_heart",
    sideQuests: ["side_tomb", "side_wraith"],
    npcs: [
      { id: "keeper", name: "守冢老人", title: "无名剑冢", lines: ["剑冢不收凡铁，只收执念。", "你要的那把剑……在等你很久了。"] },
    ],
  },
];

/**
 * 怪物数值由「同等级玩家的期望属性」反推，保证任何等级段的战斗手感一致：
 * - 普通怪：约 4 回合可击杀，两只围攻时每回合损失约 5% 气血
 * - 精英：单只，约 8 回合，每回合损失约 3.5%
 * - Boss：单只，约 16 回合，需配合药品与技能
 * 这样加内容时只需给等级与风格修正，不会破坏平衡。
 */
export const PLAYER_EXPECT = {
  atk: (level: number) => 1.6 * (5 + level * 2.2),
  hp: (level: number) => 1.6 * (60 + level * 26),
  def: (level: number) => 1.4 * (2 + level * 1.1),
};

interface MonsterMods {
  hp?: number;
  atk?: number;
  def?: number;
  agi?: number;
}

function monsterStats(
  level: number,
  tier: "normal" | "elite" | "boss",
  mods: MonsterMods = {},
): Pick<MonsterDef, "hp" | "atk" | "def" | "agi"> {
  const Ae = PLAYER_EXPECT.atk(level);
  const He = PLAYER_EXPECT.hp(level);
  const De = PLAYER_EXPECT.def(level);
  const cfg = {
    normal: { hpMult: 2.6, netPerHit: 0.023, defMult: 0.35 },
    elite: { hpMult: 12, netPerHit: 0.042, defMult: 0.55 },
    boss: { hpMult: 26, netPerHit: 0.05, defMult: 0.7 },
  }[tier];
  return {
    hp: Math.round(Ae * cfg.hpMult * (mods.hp ?? 1)),
    atk: Math.round((He * cfg.netPerHit + 0.6 * De) * (mods.atk ?? 1)),
    def: Math.round(De * cfg.defMult * (mods.def ?? 1)),
    agi: Math.round(3 + level * 0.9 * (mods.agi ?? 1)),
  };
}

function monsterRewards(
  tier: "normal" | "elite" | "boss",
  hp: number,
): Pick<MonsterDef, "exp" | "silver"> {
  const expMult = tier === "boss" ? 1.1 : tier === "elite" ? 0.8 : 0.55;
  const silverMult = tier === "boss" ? 0.8 : tier === "elite" ? 0.35 : 0.18;
  return { exp: Math.round(hp * expMult), silver: Math.round(hp * silverMult) };
}

function makeMonster(
  base: Omit<MonsterDef, "hp" | "atk" | "def" | "agi" | "exp" | "silver">,
  tier: "normal" | "elite" | "boss",
  mods: MonsterMods = {},
): MonsterDef {
  const stats = monsterStats(base.level, tier, mods);
  const rewards = monsterRewards(tier, stats.hp);
  return { ...base, ...stats, ...rewards };
}

export const MONSTERS: MonsterDef[] = [
  // 青石镇
  makeMonster({ id: "bandit", name: "山贼", level: 3, desc: "手持砍刀，腰间挂着抢来的钱袋。", materials: [{ id: "cloth", chance: 0.25, count: [1, 2] }] }, "normal"),
  makeMonster({ id: "wild_dog", name: "野狗", level: 2, desc: "瘦骨嶙峋，成群出没。", materials: [{ id: "raw_hide", chance: 0.3, count: [1, 2] }] }, "normal", { hp: 0.8, agi: 1.25 }),
  makeMonster({ id: "hooligan", name: "地痞", level: 4, desc: "仗着人多欺压百姓。", materials: [{ id: "cloth", chance: 0.3, count: [1, 2] }] }, "normal", { hp: 1.1, atk: 0.95 }),
  makeMonster({ id: "bandit_chief", name: "独眼山贼头目", level: 8, elite: true, desc: "刀疤横贯左脸，出手极狠。", materials: [{ id: "rough_iron", chance: 0.8, count: [2, 4] }] }, "elite", { hp: 1.1 }),
  // 落霞谷
  makeMonster({ id: "wolf", name: "灰狼", level: 10, desc: "扑击迅捷，喜咬咽喉。", materials: [{ id: "raw_hide", chance: 0.4, count: [1, 3] }] }, "normal", { agi: 1.15 }),
  makeMonster({ id: "viper", name: "青花毒蛇", level: 12, desc: "毒牙泛着青气，被咬中会麻痹。", materials: [{ id: "snake_gall", chance: 0.35, count: [1, 2] }] }, "normal", { hp: 0.9, atk: 1.1 }),
  makeMonster({ id: "herb_thief", name: "采药贼", level: 14, desc: "偷挖灵草，身手不弱。", materials: [{ id: "spirit_herb", chance: 0.4, count: [1, 3] }] }, "normal"),
  makeMonster({ id: "wolf_king", name: "血参狼王", level: 18, elite: true, desc: "双目赤红，守护着崖边血参。", materials: [{ id: "spirit_herb", chance: 1, count: [2, 4] }] }, "elite", { hp: 1.15, atk: 1.05 }),
  // 断魂崖
  makeMonster({ id: "mountain_spirit", name: "山魈", level: 20, desc: "夜行如风，笑声刺耳。", materials: [{ id: "dark_iron", chance: 0.3, count: [1, 2] }] }, "normal", { agi: 1.1 }),
  makeMonster({ id: "desperate_swordsman", name: "亡命剑客", level: 23, desc: "剑上刻着仇人的名字。", materials: [{ id: "sword_page", chance: 0.25, count: [1, 1] }] }, "normal", { atk: 1.05 }),
  makeMonster({ id: "cliff_demon", name: "崖魔", level: 26, desc: "被剑冢之气侵蚀的怪影。", materials: [{ id: "dark_iron", chance: 0.4, count: [1, 3] }] }, "normal", { hp: 1.1, def: 1.1 }),
  makeMonster({ id: "sword_maniac", name: "疯剑客·无名", level: 28, elite: true, desc: "他早已忘了自己的名字，只记得剑。", materials: [{ id: "sword_page", chance: 1, count: [1, 2] }] }, "elite", { atk: 1.1, agi: 1.1 }),
  // 烟雨楼
  makeMonster({ id: "assassin", name: "楼中杀手", level: 30, desc: "从阴影里出刀，一击不中便退。", materials: [{ id: "frost_iron", chance: 0.3, count: [1, 2] }] }, "normal", { agi: 1.2 }),
  makeMonster({ id: "puppet", name: "机关傀儡", level: 33, desc: "木壳铁骨，不知疼痛。", materials: [{ id: "frost_iron", chance: 0.35, count: [1, 3] }] }, "normal", { hp: 1.15, def: 1.2, agi: 0.8 }),
  makeMonster({ id: "poison_lady", name: "施毒女伶", level: 36, desc: "水袖里藏着七种毒。", materials: [{ id: "hidden_manual", chance: 0.2, count: [1, 1] }] }, "normal", { atk: 1.05, agi: 1.1 }),
  makeMonster({ id: "shadow_blade", name: "影刃", level: 38, elite: true, desc: "只闻刀风，不见人影。", materials: [{ id: "hidden_manual", chance: 1, count: [1, 2] }] }, "elite", { atk: 1.1, agi: 1.15 }),
  // 大漠孤城
  makeMonster({ id: "sand_bandit", name: "沙盗", level: 40, desc: "刀口舔血，人人有命案在身。", materials: [{ id: "meteor_iron", chance: 0.25, count: [1, 2] }] }, "normal"),
  makeMonster({ id: "sand_worm", name: "沙虫", level: 43, desc: "沙下潜行，张口吞人。", materials: [{ id: "meteor_iron", chance: 0.3, count: [1, 3] }] }, "normal", { hp: 1.2, def: 1.1, agi: 0.8 }),
  makeMonster({ id: "cult_guardian", name: "邪教护法", level: 46, desc: "口中念着古怪的经文。", materials: [{ id: "west_medicine", chance: 0.3, count: [1, 2] }] }, "normal", { atk: 1.05, def: 1.05 }),
  makeMonster({ id: "cult_elder", name: "邪教长老·枯骨", level: 48, elite: true, desc: "瘦如枯柴，掌风却重若山。", materials: [{ id: "west_medicine", chance: 1, count: [2, 3] }] }, "elite", { atk: 1.1, def: 1.1 }),
  // 无名剑冢
  makeMonster({ id: "sword_spirit", name: "剑灵", level: 50, desc: "由剑气凝成，无悲无喜。", materials: [{ id: "sword_essence", chance: 0.3, count: [1, 2] }] }, "normal", { agi: 1.1 }),
  makeMonster({ id: "tomb_keeper", name: "守冢人", level: 53, desc: "守了百年，只为等一个人。", materials: [{ id: "sword_essence", chance: 0.35, count: [1, 3] }] }, "normal", { def: 1.1 }),
  makeMonster({ id: "void_wraith", name: "虚空魍魉", level: 56, desc: "从排版的裂缝里爬出来的东西。", materials: [{ id: "sword_essence", chance: 0.4, count: [1, 3] }] }, "normal", { atk: 1.1 }),
  makeMonster({ id: "sword_guard", name: "剑冢守卫·铁衣", level: 58, elite: true, desc: "铁衣之下，是一柄会呼吸的剑。", materials: [{ id: "sword_essence", chance: 1, count: [3, 5] }] }, "elite", { hp: 1.2, def: 1.15 }),
  // 最终 Boss
  makeMonster({ id: "tomb_lord", name: "剑冢之主·无名", level: 60, boss: true, desc: "万剑朝拜之处，坐着一个与你一模一样的人。", materials: [{ id: "sword_essence", chance: 1, count: [5, 8] }] }, "boss"),
];

export const MONSTER_MAP: Record<string, MonsterDef> = Object.fromEntries(
  MONSTERS.map((m) => [m.id, m]),
);

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

/* ------------------------------ 材料 ------------------------------ */

export const MATERIALS: MaterialDef[] = [
  { id: "cloth", name: "粗布", desc: "裁衣缝补皆可。", price: 3 },
  { id: "raw_hide", name: "兽皮", desc: "制甲的材料。", price: 6 },
  { id: "rough_iron", name: "粗铁", desc: "最常见的锻造料。", price: 12 },
  { id: "spirit_herb", name: "灵草", desc: "可入药，可炼毒。", price: 20 },
  { id: "snake_gall", name: "蛇胆", desc: "清热解毒。", price: 18 },
  { id: "dark_iron", name: "玄铁", desc: "锻造利器所需。", price: 45 },
  { id: "sword_page", name: "剑谱残页", desc: "记载着半式剑招。", price: 60 },
  { id: "frost_iron", name: "寒星铁", desc: "触手生寒。", price: 90 },
  { id: "hidden_manual", name: "暗器秘录", desc: "唐门遗失的手札。", price: 120 },
  { id: "meteor_iron", name: "陨铁", desc: "自天外坠落，坚不可摧。", price: 180 },
  { id: "west_medicine", name: "西域药经", desc: "记载着异域奇方。", price: 220 },
  { id: "sword_essence", name: "剑魄", desc: "剑气凝成的一点精粹。", price: 400 },
];

export const MATERIAL_MAP: Record<string, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
);

/** 药品（按比例恢复，等级越高恢复越多） */
export const POTIONS: Record<
  string,
  { name: string; healPct: number; manaPct: number; price: number; desc: string }
> = {
  jinchuang: { name: "金创药", healPct: 0.3, manaPct: 0, price: 30, desc: "恢复 30% 气血" },
  dahuandan: { name: "大还丹", healPct: 0.55, manaPct: 0, price: 120, desc: "恢复 55% 气血" },
  huichun: { name: "回春散", healPct: 0.85, manaPct: 0, price: 400, desc: "恢复 85% 气血" },
  jingxin: { name: "静心丸", healPct: 0, manaPct: 0.6, price: 90, desc: "恢复 60% 内力" },
};

/* ------------------------------ 装备模板 ------------------------------ */

export interface EquipTemplate {
  id: string;
  name: string;
  slot: EquipSlotForTemplate;
  /** 基础属性系数（会乘以品质与等级） */
  weights: Partial<Record<"atk" | "def" | "agi" | "hp" | "mp", number>>;
  /** 该模板的最低品质 */
  minQuality: Quality;
}

export type EquipSlotForTemplate = "weapon" | "head" | "body" | "hands" | "feet" | "accessory";

export const EQUIP_TEMPLATES: EquipTemplate[] = [
  { id: "sword", name: "长剑", slot: "weapon", weights: { atk: 1, agi: 0.2 }, minQuality: "common" },
  { id: "blade", name: "单刀", slot: "weapon", weights: { atk: 1.1, crit: 0.0 } as never, minQuality: "fine" },
  { id: "staff", name: "铁棍", slot: "weapon", weights: { atk: 0.9, hp: 0.4 }, minQuality: "fine" },
  { id: "dagger", name: "短匕", slot: "weapon", weights: { atk: 0.8, agi: 0.5 }, minQuality: "rare" },
  { id: "helmet", name: "头巾", slot: "head", weights: { def: 0.5, hp: 0.3 }, minQuality: "common" },
  { id: "armor", name: "战衣", slot: "body", weights: { def: 0.9, hp: 0.6 }, minQuality: "common" },
  { id: "bracers", name: "护腕", slot: "hands", weights: { def: 0.4, atk: 0.3 }, minQuality: "common" },
  { id: "boots", name: "快靴", slot: "feet", weights: { agi: 0.7, def: 0.2 }, minQuality: "common" },
  { id: "ring", name: "玉佩", slot: "accessory", weights: { mp: 0.6, crit: 0.0 } as never, minQuality: "fine" },
  { id: "talisman", name: "护身符", slot: "accessory", weights: { hp: 0.7, def: 0.3 }, minQuality: "rare" },
];

/** 品质对应的额外词条数量 */
export const QUALITY_AFFIX_COUNT: Record<Quality, number> = {
  common: 0,
  fine: 1,
  rare: 2,
  epic: 2,
  legend: 3,
  divine: 4,
};

/* ------------------------------ 门派与技能 ------------------------------ */

export const SECTS: SectDef[] = [
  {
    id: "qingcheng",
    name: "青城剑派",
    motto: "剑走轻灵，意在剑先",
    desc: "以剑法著称，攻守均衡，适合初入江湖者。",
    mapId: "qingshi",
    minLevel: 3,
    trial: "bandit_chief",
    skills: ["qc_1", "qc_2", "qc_3", "qc_4"],
  },
  {
    id: "shaolin",
    name: "少林",
    motto: "禅武合一，金刚不坏",
    desc: "拳掌刚猛，气血与防御极高，越战越稳。",
    mapId: "luoxia",
    minLevel: 10,
    trial: "wolf_king",
    skills: ["sl_1", "sl_2", "sl_3", "sl_4"],
  },
  {
    id: "tangmen",
    name: "唐门",
    motto: "见血封喉，例不虚发",
    desc: "暗器与毒术，暴击极高，擅长速杀。",
    mapId: "yanyu",
    minLevel: 28,
    trial: "shadow_blade",
    skills: ["tm_1", "tm_2", "tm_3", "tm_4"],
  },
  {
    id: "xiaoyao",
    name: "逍遥谷",
    motto: "乘天地之正，御六气之辩",
    desc: "内功深厚，能吸血回气，久战不衰。",
    mapId: "damo",
    minLevel: 38,
    trial: "cult_elder",
    skills: ["xy_1", "xy_2", "xy_3", "xy_4"],
  },
];

export const SECT_BY_ID: Record<string, SectDef> = Object.fromEntries(
  SECTS.map((s) => [s.id, s]),
);

export const SKILLS: SkillDef[] = [
  // 青城剑派
  { id: "qc_1", name: "青城基础剑法", sect: "qingcheng", tier: 1, reqLevel: 3, cost: { contribution: 0, silver: 100, exp: 220 }, mp: 8, coef: 1.35, kind: "damage", desc: "一剑直刺，攻击系数 135%。" },
  { id: "qc_2", name: "松风剑诀", sect: "qingcheng", tier: 2, reqLevel: 10, reqSkill: "qc_1", cost: { contribution: 120, silver: 600, exp: 1400 }, mp: 16, coef: 0.95, kind: "damage", effect: { hits: 2 }, desc: "两段连击，每段系数 95%。" },
  { id: "qc_3", name: "风卷残云", sect: "qingcheng", tier: 3, reqLevel: 22, reqSkill: "qc_2", cost: { contribution: 400, silver: 2200, exp: 5200 }, mp: 28, coef: 1.5, kind: "aoe", effect: { aoe: true, critBonus: 0.1 }, desc: "群体剑势，系数 150%，暴击 +10%。" },
  { id: "qc_4", name: "青城十三剑", sect: "qingcheng", tier: 4, reqLevel: 38, reqSkill: "qc_3", cost: { contribution: 1200, silver: 8000, exp: 13000 }, mp: 48, coef: 0.62, kind: "damage", effect: { hits: 4, critBonus: 0.15 }, desc: "绝学：四段连击，每段系数 62%，暴击 +15%。" },
  // 少林
  { id: "sl_1", name: "罗汉拳", sect: "shaolin", tier: 1, reqLevel: 10, cost: { contribution: 0, silver: 200, exp: 1400 }, mp: 10, coef: 1.25, kind: "damage", effect: { shield: 0.1 }, desc: "拳出如锤，减伤 10%（本场）。" },
  { id: "sl_2", name: "金刚杵", sect: "shaolin", tier: 2, reqLevel: 18, reqSkill: "sl_1", cost: { contribution: 150, silver: 900, exp: 3600 }, mp: 18, coef: 1.6, kind: "damage", effect: { shield: 0.15 }, desc: "重击，系数 160%，减伤 15%。" },
  { id: "sl_3", name: "韦陀掌", sect: "shaolin", tier: 3, reqLevel: 30, reqSkill: "sl_2", cost: { contribution: 450, silver: 2600, exp: 8600 }, mp: 30, coef: 1.4, kind: "aoe", effect: { aoe: true, shield: 0.2 }, desc: "群体掌力，系数 140%，减伤 20%。" },
  { id: "sl_4", name: "金刚伏魔", sect: "shaolin", tier: 4, reqLevel: 44, reqSkill: "sl_3", cost: { contribution: 1400, silver: 9000, exp: 16000 }, mp: 45, coef: 1.9, kind: "damage", effect: { shield: 0.3, reflect: 0.3 }, desc: "绝学：系数 190%，减伤 30% 且反弹 30% 伤害。" },
  // 唐门
  { id: "tm_1", name: "淬毒飞针", sect: "tangmen", tier: 1, reqLevel: 28, cost: { contribution: 0, silver: 400, exp: 7600 }, mp: 12, coef: 1.2, kind: "damage", effect: { poison: 0.35 }, desc: "附加中毒（每回合 35% 攻击，3 回合）。" },
  { id: "tm_2", name: "追魂夺命", sect: "tangmen", tier: 2, reqLevel: 33, reqSkill: "tm_1", cost: { contribution: 200, silver: 1500, exp: 10000 }, mp: 22, coef: 1.8, kind: "damage", effect: { critBonus: 0.25 }, desc: "系数 180%，暴击 +25%。" },
  { id: "tm_3", name: "漫天花雨", sect: "tangmen", tier: 3, reqLevel: 40, reqSkill: "tm_2", cost: { contribution: 500, silver: 3200, exp: 13000 }, mp: 34, coef: 1.35, kind: "aoe", effect: { aoe: true, poison: 0.25 }, desc: "群体暗器并施毒。" },
  { id: "tm_4", name: "满天花雨", sect: "tangmen", tier: 4, reqLevel: 50, reqSkill: "tm_3", cost: { contribution: 1600, silver: 11000, exp: 19000 }, mp: 52, coef: 0.85, kind: "damage", effect: { hits: 3, poison: 0.5, critBonus: 0.2 }, desc: "绝学：三段暗器，每段 85%，剧毒 +50%，暴击 +20%。" },
  // 逍遥谷
  { id: "xy_1", name: "吐纳术", sect: "xiaoyao", tier: 1, reqLevel: 38, cost: { contribution: 0, silver: 500, exp: 12000 }, mp: 6, coef: 0.9, kind: "buff", effect: { heal: 0.15 }, desc: "回气养身：攻击系数 90%，回复 15% 气血。" },
  { id: "xy_2", name: "北冥神功", sect: "xiaoyao", tier: 2, reqLevel: 42, reqSkill: "xy_1", cost: { contribution: 250, silver: 2000, exp: 14000 }, mp: 20, coef: 1.3, kind: "damage", effect: { lifesteal: 0.25 }, desc: "吸人内力：系数 130%，吸血 +25%。" },
  { id: "xy_3", name: "凌波微步", sect: "xiaoyao", tier: 3, reqLevel: 48, reqSkill: "xy_2", cost: { contribution: 600, silver: 4000, exp: 17000 }, mp: 26, coef: 1.45, kind: "damage", effect: { dodgeUp: 0.25, lifesteal: 0.15 }, desc: "系数 145%，闪避 +25% 并吸血 15%。" },
  { id: "xy_4", name: "北冥吞天", sect: "xiaoyao", tier: 4, reqLevel: 55, reqSkill: "xy_3", cost: { contribution: 1800, silver: 13000, exp: 23000 }, mp: 55, coef: 1.7, kind: "aoe", effect: { aoe: true, lifesteal: 0.4, heal: 0.1 }, desc: "绝学：群体 170%，吸血 40%，回气 10%。" },
];

export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/* ------------------------------ 副本 ------------------------------ */

export const DUNGEONS: DungeonDef[] = [
  {
    id: "bandit_camp",
    name: "山贼营地",
    mapId: "qingshi",
    minLevel: 3,
    desc: "山贼把抢来的东西都堆在这里，守备却不算松懈。",
    floors: ["bandit", "bandit", "bandit_chief"],
    dailyLimit: 3,
    reward: { exp: 320, silver: 180, equip: "fine", materials: [{ id: "rough_iron", count: 3 }] },
  },
  {
    id: "herb_valley",
    name: "灵草秘境",
    mapId: "luoxia",
    minLevel: 10,
    desc: "谷中有灵草生长，也有毒物守护。",
    floors: ["viper", "herb_thief", "wolf_king"],
    dailyLimit: 3,
    reward: { exp: 900, silver: 420, equip: "rare", materials: [{ id: "spirit_herb", count: 3 }] },
  },
  {
    id: "cliff_trial",
    name: "断魂试炼",
    mapId: "duanhun",
    minLevel: 20,
    desc: "崖上试剑，败者坠崖，胜者留名。",
    floors: ["desperate_swordsman", "cliff_demon", "sword_maniac"],
    dailyLimit: 3,
    reward: { exp: 2200, silver: 900, equip: "epic", materials: [{ id: "dark_iron", count: 4 }] },
  },
  {
    id: "yanyu_secret",
    name: "烟雨密室",
    mapId: "yanyu",
    minLevel: 30,
    desc: "楼中密道，尽头是一间不该存在的兵器房。",
    floors: ["puppet", "poison_lady", "shadow_blade"],
    dailyLimit: 3,
    reward: { exp: 5200, silver: 1800, equip: "epic", materials: [{ id: "frost_iron", count: 4 }] },
  },
  {
    id: "lost_city",
    name: "失落王城",
    mapId: "damo",
    minLevel: 40,
    desc: "黄沙之下的旧城，邪教正在挖掘什么。",
    floors: ["sand_worm", "cult_guardian", "cult_elder"],
    dailyLimit: 3,
    reward: { exp: 11000, silver: 3600, equip: "legend", materials: [{ id: "meteor_iron", count: 4 }] },
  },
  {
    id: "tomb_heart",
    name: "剑冢之心",
    mapId: "jianzhong",
    minLevel: 50,
    desc: "万剑环伺，只有胜者能走到那柄无名之剑前。",
    floors: ["tomb_keeper", "void_wraith", "sword_guard"],
    dailyLimit: 2,
    reward: { exp: 26000, silver: 9000, equip: "divine", materials: [{ id: "sword_essence", count: 6 }] },
  },
];

export const DUNGEON_MAP: Record<string, DungeonDef> = Object.fromEntries(
  DUNGEONS.map((d) => [d.id, d]),
);

/* ------------------------------ 任务 ------------------------------ */

export const QUESTS: QuestDef[] = [
  // 主线 12 章
  {
    id: "main_1",
    kind: "main",
    chapter: 1,
    title: "初入江湖",
    giver: "柳伯（青石镇镇长）",
    mapId: "qingshi",
    story: [
      "雨后的青石镇安静得出奇。柳伯把一盏热茶推到你面前。",
      "「少侠，近来山贼闹得厉害，镇上夜里都不敢开门。」",
      "「你若肯出手，我这儿有把旧剑，还有一册入门剑谱。」",
    ],
    objective: { type: "kill", monsterId: "bandit", count: 5 },
    reward: { exp: 120, silver: 80, equip: "common", potions: [{ id: "jinchuang", count: 3 }] },
    next: "main_2",
  },
  {
    id: "main_2",
    kind: "main",
    chapter: 2,
    title: "山贼之患",
    giver: "柳伯（青石镇镇长）",
    mapId: "qingshi",
    story: [
      "「山贼的头目是个独眼汉子，前年打劫商队时杀过人。」",
      "「他在镇外扎了营，少侠务必小心。」",
    ],
    objective: { type: "kill", monsterId: "bandit_chief", count: 1 },
    reward: { exp: 300, silver: 220, equip: "fine", contribution: 20 },
    next: "main_3",
  },
  {
    id: "main_3",
    kind: "main",
    chapter: 3,
    title: "落霞谷的狼群",
    giver: "猎户老赵",
    mapId: "luoxia",
    story: [
      "老赵的猎犬死在谷口，伤口是被狼撕开的。",
      "「狼王护着一株血参，谁靠近就咬谁。」",
      "「你若能除了它，我把祖传的甲片送你。」",
    ],
    objective: { type: "kill", monsterId: "wolf", count: 8 },
    reward: { exp: 460, silver: 300, equip: "fine" },
    next: "main_4",
  },
  {
    id: "main_4",
    kind: "main",
    chapter: 4,
    title: "血参狼王",
    giver: "猎户老赵",
    mapId: "luoxia",
    story: ["血参红得像一团火。狼王的眼中也有火。"],
    objective: { type: "kill", monsterId: "wolf_king", count: 1 },
    reward: { exp: 900, silver: 500, equip: "rare", contribution: 40 },
    next: "main_5",
  },
  {
    id: "main_5",
    kind: "main",
    chapter: 5,
    title: "断魂崖的剑客",
    giver: "无念禅师",
    mapId: "duanhun",
    story: [
      "禅师指着崖上的身影：「他曾在江湖上败给一个人，从此记不得自己的名字。」",
      "「你若能让他放下剑，也算功德一件。」",
    ],
    objective: { type: "kill", monsterId: "desperate_swordsman", count: 6 },
    reward: { exp: 1200, silver: 700, equip: "rare" },
    next: "main_6",
  },
  {
    id: "main_6",
    kind: "main",
    chapter: 6,
    title: "疯剑客·无名",
    giver: "无念禅师",
    mapId: "duanhun",
    story: ["「他已经在崖上等了十年，等一个能接住他十三剑的人。」"],
    objective: { type: "kill", monsterId: "sword_maniac", count: 1 },
    reward: { exp: 2400, silver: 1200, equip: "epic", contribution: 80 },
    next: "main_7",
  },
  {
    id: "main_7",
    kind: "main",
    chapter: 7,
    title: "烟雨楼密信",
    giver: "苏烟（烟雨楼歌女）",
    mapId: "yanyu",
    story: [
      "苏烟把一张薄纸塞进你掌心，指尖冰冷。",
      "「楼里有杀手的名单……我不敢看。」",
      "「你替我看看，有没有我哥哥的名字。」",
    ],
    objective: { type: "kill", monsterId: "assassin", count: 8 },
    reward: { exp: 3000, silver: 1600, equip: "epic" },
    next: "main_8",
  },
  {
    id: "main_8",
    kind: "main",
    chapter: 8,
    title: "影刃",
    giver: "苏烟（烟雨楼歌女）",
    mapId: "yanyu",
    story: ["「影刃是楼里最冷的刀。听说……他从不留活口。」"],
    objective: { type: "kill", monsterId: "shadow_blade", count: 1 },
    reward: { exp: 5200, silver: 2600, equip: "epic", contribution: 140 },
    next: "main_9",
  },
  {
    id: "main_9",
    kind: "main",
    chapter: 9,
    title: "大漠孤城",
    giver: "商队首领",
    mapId: "damo",
    story: [
      "「邪教在这挖了三年，挖出一座旧城，也挖出一堆死人。」",
      "「他们说要找一本剑谱，可那本剑谱……据说会杀人。」",
    ],
    objective: { type: "kill", monsterId: "cult_guardian", count: 10 },
    reward: { exp: 8000, silver: 3800, equip: "legend" },
    next: "main_10",
  },
  {
    id: "main_10",
    kind: "main",
    chapter: 10,
    title: "枯骨长老",
    giver: "商队首领",
    mapId: "damo",
    story: ["「那老东西瘦得只剩骨头，掌风却能掀翻骆驼。」"],
    objective: { type: "kill", monsterId: "cult_elder", count: 1 },
    reward: { exp: 14000, silver: 6000, equip: "legend", contribution: 260 },
    next: "main_11",
  },
  {
    id: "main_11",
    kind: "main",
    chapter: 11,
    title: "无名剑冢",
    giver: "守冢老人",
    mapId: "jianzhong",
    story: [
      "「这里的每一柄剑，都等过一个主人。」",
      "「你的剑，也在等你。」",
    ],
    objective: { type: "kill", monsterId: "sword_spirit", count: 12 },
    reward: { exp: 22000, silver: 9000, equip: "legend" },
    next: "main_12",
  },
  {
    id: "main_12",
    kind: "main",
    chapter: 12,
    title: "剑冢之主",
    giver: "守冢老人",
    mapId: "jianzhong",
    story: [
      "「万剑朝拜之处，坐着一个人。」",
      "「他与你长得一模一样——因为他是你不敢面对的那部分。」",
      "「去吧。这一战，无人能替你。」",
    ],
    objective: { type: "kill", monsterId: "tomb_lord", count: 1 },
    reward: { exp: 60000, silver: 30000, equip: "divine", contribution: 800 },
  },

  // 支线
  {
    id: "side_herb",
    kind: "side",
    title: "阿芸的药方",
    giver: "采药人阿芸",
    mapId: "qingshi",
    story: ["「配一副药还差几味，你若能带些粗布回来，我给你煎一剂好药。」"],
    objective: { type: "collect", materialId: "cloth", count: 4 },
    reward: { exp: 90, silver: 60, potions: [{ id: "jinchuang", count: 3 }] },
  },
  {
    id: "side_sword",
    kind: "side",
    title: "铁匠的重铸",
    giver: "铁匠陈",
    mapId: "qingshi",
    story: ["「那把旧剑缺了铁。给我弄些粗铁来，我给你打一柄好的。」"],
    objective: { type: "collect", materialId: "rough_iron", count: 5 },
    reward: { exp: 160, silver: 120, equip: "fine" },
  },
  {
    id: "side_thief",
    kind: "side",
    title: "顽劣之徒",
    giver: "柳伯（青石镇镇长）",
    mapId: "qingshi",
    story: ["「那几个地痞又在街头闹事，替我教训教训他们。」"],
    objective: { type: "kill", monsterId: "hooligan", count: 6 },
    reward: { exp: 140, silver: 100, equip: "common" },
  },
  {
    id: "side_hide",
    kind: "side",
    title: "皮货生意",
    giver: "铁匠陈",
    mapId: "qingshi",
    story: ["「野狗的皮子能硝制护腕，给我弄几张来，我教你几手护身的法子。」"],
    objective: { type: "collect", materialId: "raw_hide", count: 5 },
    reward: { exp: 180, silver: 140, potions: [{ id: "jinchuang", count: 5 }] },
  },
  {
    id: "side_wolf",
    kind: "side",
    title: "狼皮生意",
    giver: "猎户老赵",
    mapId: "luoxia",
    story: ["「狼皮值钱，可也得有命去剥。」"],
    objective: { type: "collect", materialId: "raw_hide", count: 8 },
    reward: { exp: 380, silver: 260, potions: [{ id: "jinchuang", count: 5 }] },
  },
  {
    id: "side_poison",
    kind: "side",
    title: "解毒之需",
    giver: "猎户老赵",
    mapId: "luoxia",
    story: ["「谷里蛇多，蛇胆能解百毒，帮我收几个。」"],
    objective: { type: "collect", materialId: "snake_gall", count: 5 },
    reward: { exp: 420, silver: 300, equip: "rare" },
  },
  {
    id: "side_medicine",
    kind: "side",
    title: "药理初窥",
    giver: "采药人阿芸",
    mapId: "luoxia",
    story: ["「灵草晒干研末，能炼大还丹。你替我采些回来，我教你辨药。」"],
    objective: { type: "collect", materialId: "spirit_herb", count: 6 },
    reward: { exp: 520, silver: 360, potions: [{ id: "dahuandan", count: 5 }] },
  },
  {
    id: "side_cliff",
    kind: "side",
    title: "崖上残剑",
    giver: "无念禅师",
    mapId: "duanhun",
    story: ["「崖上散落着断剑，剑上刻着名字。那是他们的墓碑。」"],
    objective: { type: "collect", materialId: "sword_page", count: 4 },
    reward: { exp: 1400, silver: 900, equip: "rare" },
  },
  {
    id: "side_swordman",
    kind: "side",
    title: "十年之约",
    giver: "无念禅师",
    mapId: "duanhun",
    story: ["「山魈夜行，剑客昼出。你若能在夜里胜十场，便知崖上为何有人不肯走。」"],
    objective: { type: "kill", monsterId: "mountain_spirit", count: 10 },
    reward: { exp: 1800, silver: 1100, materials: [{ id: "dark_iron", count: 5 }] },
  },
  {
    id: "side_iron",
    kind: "side",
    title: "玄铁之约",
    giver: "铁匠陈",
    mapId: "duanhun",
    story: ["「崖下溪水里有玄铁砂，你若能淘些回来，我替你打件趁手的兵器。」"],
    objective: { type: "collect", materialId: "dark_iron", count: 6 },
    reward: { exp: 2000, silver: 1300, equip: "epic" },
  },
  {
    id: "side_lady",
    kind: "side",
    title: "苏烟的琴",
    giver: "苏烟（烟雨楼歌女）",
    mapId: "yanyu",
    story: ["「我的琴被人砸了。砸琴的人，指甲缝里有寒星铁的碎屑。」"],
    objective: { type: "collect", materialId: "frost_iron", count: 6 },
    reward: { exp: 3600, silver: 2000, equip: "epic" },
  },
  {
    id: "side_puppet",
    kind: "side",
    title: "机关之术",
    giver: "苏烟（烟雨楼歌女）",
    mapId: "yanyu",
    story: ["「楼里的傀儡会自己走，木头不会自己走。」"],
    objective: { type: "kill", monsterId: "puppet", count: 8 },
    reward: { exp: 4200, silver: 2200, materials: [{ id: "hidden_manual", count: 3 }] },
  },
  {
    id: "side_sand",
    kind: "side",
    title: "沙下之骨",
    giver: "商队首领",
    mapId: "damo",
    story: ["「沙虫吃得太多，把骆驼和人都吞了。」"],
    objective: { type: "kill", monsterId: "sand_worm", count: 10 },
    reward: { exp: 9000, silver: 4200, equip: "legend" },
  },
  {
    id: "side_cult",
    kind: "side",
    title: "邪教药经",
    giver: "商队首领",
    mapId: "damo",
    story: ["「那药经是害人的东西，可也是救人的东西。看落在谁手里。」"],
    objective: { type: "collect", materialId: "west_medicine", count: 4 },
    reward: { exp: 11000, silver: 5000, equip: "legend" },
  },
  {
    id: "side_armor",
    kind: "side",
    title: "沙虫之患",
    giver: "商队首领",
    mapId: "damo",
    story: ["「沙虫的甲壳能制重甲，可也得有人去取。」"],
    objective: { type: "kill", monsterId: "sand_worm", count: 8 },
    reward: { exp: 9500, silver: 4600, equip: "legend" },
  },
  {
    id: "side_tomb",
    kind: "side",
    title: "守冢人的托付",
    giver: "守冢老人",
    mapId: "jianzhong",
    story: ["「剑魄是剑的执念。收集一些来，我替你融进你自己的剑里。」"],
    objective: { type: "collect", materialId: "sword_essence", count: 8 },
    reward: { exp: 30000, silver: 14000, equip: "divine" },
  },
  {
    id: "side_wraith",
    kind: "side",
    title: "裂缝中的东西",
    giver: "守冢老人",
    mapId: "jianzhong",
    story: ["「排版裂缝里爬出来的魍魉越来越多。它们怕的不是剑，是秩序。」"],
    objective: { type: "kill", monsterId: "void_wraith", count: 10 },
    reward: { exp: 26000, silver: 12000, materials: [{ id: "sword_essence", count: 6 }] },
  },

  // 门派任务（可循环，需加入对应门派）
  {
    id: "sect_qingcheng",
    kind: "sect",
    sect: "qingcheng",
    title: "门派·除患青石",
    giver: "青城执事",
    mapId: "qingshi",
    story: ["「青城立派于此，镇上的安宁便是本门脸面。去吧，替本门清理门户。」"],
    objective: { type: "kill", monsterId: "hooligan", count: 10 },
    reward: { exp: 220, silver: 160, contribution: 30, potions: [{ id: "jinchuang", count: 3 }] },
    repeatDaily: 5,
  },
  {
    id: "sect_shaolin",
    kind: "sect",
    sect: "shaolin",
    title: "门派·降狼护谷",
    giver: "少林知客僧",
    mapId: "luoxia",
    story: ["「狼群伤人，亦是众生。送它们一程，便是慈悲。」"],
    objective: { type: "kill", monsterId: "wolf", count: 12 },
    reward: { exp: 1600, silver: 1000, contribution: 60, potions: [{ id: "dahuandan", count: 2 }] },
    repeatDaily: 5,
  },
  {
    id: "sect_tangmen",
    kind: "sect",
    sect: "tangmen",
    title: "门派·试器烟雨",
    giver: "唐门执令弟子",
    mapId: "yanyu",
    story: ["「新淬的毒针要试锋。楼里的杀手，正好做靶子。」"],
    objective: { type: "kill", monsterId: "assassin", count: 12 },
    reward: { exp: 5200, silver: 3600, contribution: 120, materials: [{ id: "hidden_manual", count: 1 }] },
    repeatDaily: 5,
  },
  {
    id: "sect_xiaoyao",
    kind: "sect",
    sect: "xiaoyao",
    title: "门派·问道大漠",
    giver: "逍遥谷长老",
    mapId: "damo",
    story: ["「邪教所求，不过是逆天改命。大道自然，你去让他们明白这个道理。」"],
    objective: { type: "kill", monsterId: "cult_guardian", count: 12 },
    reward: { exp: 13000, silver: 9000, contribution: 200, potions: [{ id: "huichun", count: 3 }] },
    repeatDaily: 5,
  },

  // 循环任务（每张地图一个，可反复提交）
  {
    id: "rep_qingshi",
    kind: "repeat",
    title: "循环·山道清剿",
    giver: "青石镇差役",
    mapId: "qingshi",
    story: ["「山道上的贼人杀不尽，杀一批，来一批。」"],
    objective: { type: "kill", monsterId: "bandit", count: 8 },
    reward: { exp: 130, silver: 100 },
    repeatDaily: 10,
  },
  {
    id: "rep_luoxia",
    kind: "repeat",
    title: "循环·灵草采集",
    giver: "采药人阿芸",
    mapId: "luoxia",
    story: ["「灵草永远不嫌多，有多少我收多少。」"],
    objective: { type: "collect", materialId: "spirit_herb", count: 5 },
    reward: { exp: 520, silver: 420 },
    repeatDaily: 10,
  },
  {
    id: "rep_duanhun",
    kind: "repeat",
    title: "循环·剑客挑战",
    giver: "无念禅师",
    mapId: "duanhun",
    story: ["「崖上亡命之徒，皆有心结。你替他们解开，也是修行。」"],
    objective: { type: "kill", monsterId: "desperate_swordsman", count: 8 },
    reward: { exp: 1700, silver: 1300 },
    repeatDaily: 10,
  },
  {
    id: "rep_yanyu",
    kind: "repeat",
    title: "循环·铁料回收",
    giver: "铁匠陈",
    mapId: "yanyu",
    story: ["「寒星铁碎屑落了一地，捡回来能打不少暗器。」"],
    objective: { type: "collect", materialId: "frost_iron", count: 5 },
    reward: { exp: 4400, silver: 3300 },
    repeatDaily: 10,
  },
  {
    id: "rep_damo",
    kind: "repeat",
    title: "循环·沙盗清剿",
    giver: "商队首领",
    mapId: "damo",
    story: ["「商路要通，就得让沙盗知道怕。」"],
    objective: { type: "kill", monsterId: "sand_bandit", count: 10 },
    reward: { exp: 11500, silver: 8800 },
    repeatDaily: 10,
  },
  {
    id: "rep_jianzhong",
    kind: "repeat",
    title: "循环·剑魄收集",
    giver: "守冢老人",
    mapId: "jianzhong",
    story: ["「剑魄是执念的残片。收拢它们，冢里才会安静。」"],
    objective: { type: "collect", materialId: "sword_essence", count: 5 },
    reward: { exp: 27000, silver: 19000 },
    repeatDaily: 10,
  },

  // 日常
  {
    id: "daily_kill",
    kind: "daily",
    title: "日常·除魔卫道",
    giver: "江湖告示",
    mapId: "qingshi",
    story: ["告示上写着：凡除魔五十者，可往衙门领赏。"],
    objective: { type: "kill", monsterId: "bandit", count: 50 },
    reward: { exp: 8000, silver: 6000, contribution: 60 },
  },
  {
    id: "daily_dungeon",
    kind: "daily",
    title: "日常·秘境历练",
    giver: "江湖告示",
    mapId: "qingshi",
    story: ["秘境历练可固本培元。"],
    objective: { type: "dungeon", dungeonId: "bandit_camp" },
    reward: { exp: 6000, silver: 4000, contribution: 40 },
  },
  {
    id: "daily_level",
    kind: "daily",
    title: "日常·勤修不辍",
    giver: "江湖告示",
    mapId: "qingshi",
    story: ["每日精进，方成大器。"],
    objective: { type: "level", level: 30 },
    reward: { exp: 3000, silver: 2000, contribution: 30 },
  },
];

export const QUEST_MAP: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

/** 起始可承接的主线 */
export const FIRST_MAIN_QUEST = "main_1";

/* ------------------------------ 境界 / 称号 / 成就 ------------------------------ */

export const REALMS: Array<{ level: number; name: string; bonus: number }> = [
  { level: 1, name: "初窥门径", bonus: 0 },
  { level: 11, name: "略有小成", bonus: 0.05 },
  { level: 21, name: "融会贯通", bonus: 0.1 },
  { level: 31, name: "登堂入室", bonus: 0.16 },
  { level: 41, name: "炉火纯青", bonus: 0.22 },
  { level: 51, name: "出神入化", bonus: 0.3 },
];

export const TITLES: Array<{ id: string; name: string; cond: string }> = [
  { id: "newbie", name: "江湖新兵", cond: "初入江湖" },
  { id: "roamer", name: "初出茅庐", cond: "达到 10 级" },
  { id: "known", name: "小有名气", cond: "达到 20 级" },
  { id: "famous", name: "声名鹊起", cond: "达到 30 级" },
  { id: "warlord", name: "威震一方", cond: "达到 40 级" },
  { id: "world", name: "天下闻名", cond: "达到 50 级" },
  { id: "grandmaster", name: "一代宗师", cond: "达到 60 级" },
  { id: "swordsaint", name: "剑冢之主", cond: "击败剑冢之主·无名" },
];

export const ACHIEVEMENTS: Array<{ id: string; name: string; desc: string }> = [
  { id: "first_blood", name: "初试锋芒", desc: "首次击败敌人" },
  { id: "hunter", name: "百战之身", desc: "累计击败 100 名敌人" },
  { id: "slayer", name: "千锤百炼", desc: "累计击败 1000 名敌人" },
  { id: "dungeon_1", name: "秘境初探", desc: "通关任意秘境一次" },
  { id: "dungeon_10", name: "秘境常客", desc: "累计通关秘境 10 次" },
  { id: "epic_gear", name: "神兵初成", desc: "获得一件史诗或更高品质装备" },
  { id: "legend_gear", name: "利器在身", desc: "获得一件传说或更高品质装备" },
  { id: "sect_member", name: "名门正派", desc: "加入一个门派" },
  { id: "skill_max", name: "武学大成", desc: "将任一技能练至 10 层" },
  { id: "idle_10h", name: "闭关苦修", desc: "累计挂机 10 小时" },
  { id: "rich", name: "富甲一方", desc: "持有银两超过 10 万" },
  { id: "main_clear", name: "江湖再见", desc: "完成全部主线" },
];
