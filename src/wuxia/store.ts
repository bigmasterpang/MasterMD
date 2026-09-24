import { create } from "zustand";
import {
  DUNGEON_MAP,
  MAPS,
  MAP_BY_ID,
  MONSTER_MAP,
  POTIONS,
  QUALITY_META,
  QUALITY_ORDER,
  QUEST_MAP,
  SECT_BY_ID,
  SKILL_MAP,
  SKILLS,
} from "./data";
import { EQUIP_SLOTS } from "./engine";
import {
  IDLE_INTERVAL_MS,
  addMaterials,
  addPotions,
  autoEquipBest,
  buildMonsterGroup,
  canLearnSkill,
  checkAchievements,
  clamp,
  consumeRepeat,
  dungeonAvailable,
  enhanceCost,
  enhancedStats,
  equipItem,
  generateEquip,
  grantExp,
  idleSettle,
  isRepeatable,
  itemScore,
  monsterGroupSize,
  newDungeonRun,
  pickPotion,
  powerOf,
  progressCollect,
  progressDungeon,
  progressKill,
  progressLevel,
  questNeed,
  questProgress,
  questReady,
  rand,
  registerQuestLookup,
  repeatRemaining,
  resetDailies,
  resolveCombat,
  settleOffline,
  skillUpgradeCost,
  titleOf,
  totalStats,
  unlockMapsByBoss,
  type Fighter,
} from "./engine";
import { clearSave, loadGame, newGame, saveGame, todayKey } from "./save";
import type { BattleBrief, EquipItem, EquipSlot, Quality, SaveGame, SectId } from "./types";

// 让任务进度函数能查到任务定义（避免 engine 依赖 data）
registerQuestLookup((id) => QUEST_MAP[id]);

export type WuxiaTab = "map" | "battle" | "bag" | "skill" | "quest" | "sect" | "dungeon" | "idle";

/** 最近一场手动战斗的完整过程 */
export interface BattleRecord {
  at: number;
  win: boolean;
  title: string;
  rounds: string[];
  exp: number;
  silver: number;
  drops: EquipItem[];
  died: boolean;
}

interface WuxiaState {
  tab: WuxiaTab;
  /** 当前选择的挂机/挑战地图 */
  selectedMap: string;
  /** 最近一场战斗（只保留过程与掉落） */
  battle: BattleRecord | null;
  /** 近期战绩（精简） */
  recentBattles: BattleBrief[];
  toast: string;
  save: SaveGame;

  ensureLoaded: () => void;
  setTab: (tab: WuxiaTab) => void;
  selectMap: (mapId: string) => void;
  dismissToast: () => void;
  setAutoAccept: (value: boolean) => void;

  rename: (name: string) => void;
  resetGame: () => void;

  fight: (elite?: boolean) => void;
  toggleIdle: () => void;
  tickIdle: () => void;
  buyPotion: (potionId: string, count: number) => void;
  usePotion: (potionId: string) => void;
  sellItem: (uid: string) => void;
  sellAllCommon: () => void;
  /** 一键出售：品质不高于 maxQuality 的装备（可保护每部位最优） */
  sellBelow: (maxQuality: Quality, protectUpgrades: boolean) => void;
  equip: (uid: string) => void;
  /** 一键装备：所有部位换上背包中最强的 */
  equipBest: () => void;
  /** 指定部位换上背包中最强的一件 */
  equipBestSlot: (slot: EquipSlot) => void;
  unequip: (slot: EquipSlot) => void;
  enhance: (uid: string) => void;
  learnSkill: (skillId: string) => void;
  upgradeSkill: (skillId: string) => void;
  joinSect: (sect: SectId) => void;
  acceptQuest: (questId: string) => void;
  claimQuest: (questId: string) => void;
  enterDungeon: (dungeonId: string) => void;
  dungeonNext: () => void;
  dungeonRetreat: () => void;
}

let idleTimer: number | null = null;
/** 本次运行是否已读取过存档（避免反复重读与重复离线结算） */
let loadedOnce = false;

function makeFighter(save: SaveGame): Fighter {
  const stats = totalStats(save.player);
  return {
    name: save.player.name,
    level: save.player.level,
    stats,
    skills: save.player.skills,
    hp: save.player.hp,
    mp: save.player.mp,
    potions: Object.values(save.player.potions).reduce((a, b) => a + b, 0),
  };
}

/** 处理经验/等级/成就/任务进度等公共后置逻辑 */
function applyPost(
  save: SaveGame,
  patch: Partial<SaveGame>,
  hooks?: { kills?: string[]; materials?: Record<string, number>; dungeonId?: string },
): SaveGame {
  let next: SaveGame = { ...save, ...patch, player: patch.player ?? save.player };

  // 任务进度
  let quests = next.quests;
  if (hooks?.kills) {
    for (const monsterId of hooks.kills) quests = progressKill(quests, monsterId, 1);
  }
  if (hooks?.materials) {
    for (const [id, count] of Object.entries(hooks.materials)) {
      quests = progressCollect(quests, id, count);
    }
  }
  if (hooks?.dungeonId) quests = progressDungeon(quests, hooks.dungeonId);
  quests = progressLevel(quests, next.player.level);
  next = { ...next, quests };

  // 成就与称号
  const achieved = checkAchievements(next);
  next = { ...next, achievements: achieved.achievements, title: titleOf(next) };
  if (achieved.unlocked.length > 0) {
    useWuxiaStore.setState({ toast: `🏅 解锁成就：${achieved.unlocked.join("、")}` });
  }
  // 地图解锁由任务奖励处理（claimQuest）
  return next;
}

export const useWuxiaStore = create<WuxiaState>((set, get) => ({
  tab: "map",
  selectedMap: "qingshi",
  battle: null,
  recentBattles: [],
  toast: "",
  save: newGame(),

  ensureLoaded: () => {
    if (loadedOnce) return;
    loadedOnce = true;
    const existing = loadGame();
    if (existing) {
      // 日常任务每日重置 → 离线补算
      const reset = resetDailies(existing, todayKey());
      const { save, report } = settleOffline(reset, Date.now());
      set({
        save,
        selectedMap: save.idle.config.mapId,
        toast: report
          ? `离线 ${report.minutes} 分钟：${report.battles} 场战斗，击败 ${report.kills} 人，经验 +${
              report.exp
            }，银两 +${report.silver}${
              report.unlocked && report.unlocked.length > 0
                ? `，解锁 ${report.unlocked.map((id) => MAP_BY_ID[id]?.name ?? id).join("、")}`
                : ""
            }`
          : "",
      });
      if (save.idle.config.enabled) ensureIdleTimer(get, set);
      saveGame(save);
      acceptAvailableQuests(get, set);
      return;
    }
    const fresh = newGame();
    set({ save: fresh });
    saveGame(fresh);
  },

  setTab: (tab) => set({ tab }),
  selectMap: (mapId) => set({ selectedMap: mapId }),
  dismissToast: () => set({ toast: "" }),

  setAutoAccept: (value) => {
    const save = { ...get().save, autoAccept: value };
    set({ save, toast: value ? "已开启自动接取任务" : "已关闭自动接取任务" });
    persist(get);
    if (value) acceptAvailableQuests(get, set);
  },

  rename: (name) => {
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    set({ save: { ...get().save, player: { ...get().save.player, name: trimmed } } });
    persist(get);
  },

  resetGame: () => {
    clearSave();
    const fresh = newGame();
    set({ save: fresh, battle: null, recentBattles: [], selectedMap: "qingshi", toast: "江湖已重开" });
    saveGame(fresh);
  },
  fight: (elite = false) => {
    const state = get();
    const save = state.save;
    const map = MAP_BY_ID[state.selectedMap];
    if (!map) return;
    const pool = elite && map.elite ? [map.elite] : map.monsters;
    const monsterId = pool[rand(0, pool.length - 1)];
    const monsterLevel = MONSTER_MAP[monsterId]?.level ?? save.player.level;
    const group = buildMonsterGroup(
      monsterId,
      elite ? 1 : monsterGroupSize(monsterLevel, save.player.level),
    );
    const fighter = makeFighter(save);
    const potion = pickPotion(save.player);
    const result = resolveCombat(fighter, group, {
      autoHeal: save.idle.config.autoHeal && potion != null,
      healThreshold: save.idle.config.healThreshold,
      verbose: true,
      potion,
    });

    let player = {
      ...save.player,
      hp: result.hp,
      mp: result.mp,
      silver: save.player.silver + result.silver,
    };
    player = addMaterials(player, result.materials);
    if (potion && result.potionsUsed > 0) {
      const potions = { ...player.potions };
      potions[potion.id] = Math.max(0, (potions[potion.id] ?? 0) - result.potionsUsed);
      if (potions[potion.id] === 0) delete potions[potion.id];
      player = { ...player, potions };
    }
    const leveled = grantExp(player, result.exp);
    player = leveled.player;
    if (result.died) {
      player = { ...player, hp: Math.max(1, Math.round(totalStats(player).hp * 0.3)) };
    }

    const inventory = [...player.inventory, ...result.drops].slice(0, 200);
    const killedIds = result.win ? group.map((m) => m.id) : [];

    let next: SaveGame = applyPost(
      save,
      {
        player: { ...player, inventory },
        stats: {
          ...save.stats,
          battles: save.stats.battles + 1,
          kills: save.stats.kills + (result.win ? group.length : 0),
          deaths: save.stats.deaths + (result.died ? 1 : 0),
        },
      },
      {
        kills: killedIds,
        materials: result.materials,
      },
    );

    // 击败地图首领 → 解锁下一地区
    const unlock = unlockMapsByBoss(next.maps, killedIds);
    const unlockNames = unlock.unlocked
      .map((id) => MAP_BY_ID[id]?.name ?? id)
      .filter(Boolean);
    if (unlockNames.length > 0) {
      next = { ...next, maps: unlock.maps };
    }

    const dropLine =
      result.drops.length > 0
        ? `> 拾得：${result.drops
            .map((d) => `${QUALITY_META[d.quality].mark} ${d.name}（评分 ${itemScore(d)}）`)
            .join("、")}`
        : "> 本场没有装备掉落。";
    const rounds = [
      `#### ${result.win ? "战斗胜利" : "战斗失利"} · ${result.monster.name}${
        group.length > 1 ? ` ×${group.length}` : ""
      }`,
      "",
      ...result.rounds.map((line) => `- ${line}`),
      "",
      result.win
        ? `> 经验 **+${result.exp}**　银两 **+${result.silver}**${
            potion && result.potionsUsed > 0 ? `　${potion.name} **-${result.potionsUsed}**` : ""
          }`
        : "> 你力竭退下，调息片刻即可再战。",
      result.win ? dropLine : "",
    ].filter((line) => line !== "");

    const brief: BattleBrief = {
      at: Date.now(),
      win: result.win,
      monster: result.monster.name,
      count: group.length,
      exp: result.exp,
      silver: result.silver,
      drops: result.drops.map((d) => d.name),
      died: result.died,
    };

    const toasts = [leveled.messages.join("；")].filter(Boolean);
    if (unlockNames.length > 0) toasts.push(`击败首领，解锁新区域：${unlockNames.join("、")}`);

    set({
      save: next,
      battle: {
        at: brief.at,
        win: result.win,
        title: `${result.monster.name}${group.length > 1 ? ` ×${group.length}` : ""}`,
        rounds,
        exp: result.exp,
        silver: result.silver,
        drops: result.drops,
        died: result.died,
      },
      recentBattles: [brief, ...state.recentBattles].slice(0, 12),
      toast: toasts.join("；") || state.toast,
    });
    persist(get);
    acceptAvailableQuests(get, set);
  },

  toggleIdle: () => {
    const state = get();
    const save = state.save;
    const enabled = !save.idle.config.enabled;
    const idle = {
      ...save.idle,
      config: { ...save.idle.config, enabled, mapId: state.selectedMap },
      lastTick: Date.now(),
      session: enabled
        ? { startedAt: Date.now(), battles: 0, kills: 0, exp: 0, silver: 0, drops: [], deaths: 0 }
        : save.idle.session,
      log: enabled ? [`开始挂机：${MAP_BY_ID[state.selectedMap]?.name ?? ""}`] : save.idle.log,
    };
    set({ save: { ...save, idle }, toast: enabled ? "已开始挂机（每 5 秒一场）" : "已停止挂机" });
    if (enabled) ensureIdleTimer(get, set);
    else stopIdleTimer();
    persist(get);
  },

  tickIdle: () => {
    const state = get();
    const save = state.save;
    if (!save.idle.config.enabled) return;
    const now = Date.now();
    const elapsed = Math.max(0, now - save.idle.lastTick);
    if (elapsed < IDLE_INTERVAL_MS) return;

    const result = idleSettle({
      player: save.player,
      mapId: save.idle.config.mapId,
      elapsedMs: elapsed,
      verbose: false,
      potion: save.idle.config.autoHeal ? pickPotion(save.player) : undefined,
      elite: save.idle.config.fightElite,
    });

    const unlock = unlockMapsByBoss(save.maps, result.killedIds);
    const unlockNames = unlock.unlocked
      .map((id) => MAP_BY_ID[id]?.name ?? id)
      .filter(Boolean);

    const battleLines = [
      `- ${new Date(now).toLocaleTimeString()}：${result.battles} 场战斗，击败 ${result.kills} 人，经验 +${result.exp}，银两 +${result.silver}${
        result.drops.length > 0 ? `，拾得 ${result.drops.map((d) => d.name).join("、")}` : ""
      }${result.deaths > 0 ? `（力竭 ${result.deaths} 次）` : ""}${
        unlockNames.length > 0 ? `，==解锁 ${unlockNames.join("、")}==` : ""
      }`,
    ];

    const inventory = [...save.player.inventory, ...result.drops]
      .filter((item) => save.idle.config.collectCommon || item.quality !== "common" || itemScore(item) > 0)
      .slice(0, 200);

    let next: SaveGame = applyPost(
      save,
      {
        player: { ...result.player, inventory },
        idle: {
          ...save.idle,
          lastTick: now,
          log: [...battleLines, ...save.idle.log].slice(0, 200),
          session: {
            ...save.idle.session,
            battles: save.idle.session.battles + result.battles,
            kills: (save.idle.session.kills ?? 0) + result.kills,
            exp: save.idle.session.exp + result.exp,
            silver: save.idle.session.silver + result.silver,
            drops: [...save.idle.session.drops, ...result.drops.map((d) => d.name)].slice(-50),
            deaths: save.idle.session.deaths + result.deaths,
          },
        },
        stats: {
          ...save.stats,
          battles: save.stats.battles + result.battles,
          kills: save.stats.kills + result.kills,
          deaths: save.stats.deaths + result.deaths,
        },
      },
      { materials: result.materials },
    );
    if (unlock.unlocked.length > 0) {
      next = { ...next, maps: unlock.maps };
    }

    const toasts = [...result.messages];
    if (unlockNames.length > 0) toasts.push(`击败首领，解锁新区域：${unlockNames.join("、")}`);
    set({ save: next });
    if (toasts.length > 0) {
      set({ toast: toasts.join("；") });
    }
    persist(get);
    acceptAvailableQuests(get, set);
  },

  buyPotion: (potionId, count) => {
    const state = get();
    const save = state.save;
    const potion = POTIONS[potionId];
    if (!potion) return;
    const total = potion.price * count;
    if (save.player.silver < total) {
      set({ toast: "银两不足" });
      return;
    }
    const potions = { ...save.player.potions };
    potions[potionId] = (potions[potionId] ?? 0) + count;
    set({
      save: {
        ...save,
        player: { ...save.player, silver: save.player.silver - total, potions },
      },
      toast: `购入 ${potion.name} ×${count}`,
    });
    persist(get);
  },

  usePotion: (potionId) => {
    const state = get();
    const save = state.save;
    const potion = POTIONS[potionId];
    if (!potion || (save.player.potions[potionId] ?? 0) <= 0) return;
    const stats = totalStats(save.player);
    const potions = { ...save.player.potions, [potionId]: save.player.potions[potionId] - 1 };
    set({
      save: {
        ...save,
        player: {
          ...save.player,
      hp: clamp(save.player.hp + Math.round(stats.hp * potion.healPct), 1, stats.hp),
      mp: clamp(save.player.mp + Math.round(stats.mp * potion.manaPct), 0, stats.mp),
          potions,
        },
      },
      toast: `服下 ${potion.name}`,
    });
    persist(get);
  },

  sellItem: (uid) => {
    const state = get();
    const save = state.save;
    const item = save.player.inventory.find((i) => i.uid === uid);
    if (!item) return;
    set({
      save: {
        ...save,
        player: {
          ...save.player,
          inventory: save.player.inventory.filter((i) => i.uid !== uid),
          silver: save.player.silver + item.price,
        },
      },
      toast: `卖出 ${item.name}，得银两 ${item.price}`,
    });
    persist(get);
  },

  sellAllCommon: () => {
    get().sellBelow("common", false);
  },

  sellBelow: (maxQuality, protectUpgrades) => {
    const state = get();
    const save = state.save;
    const order = QUALITY_ORDER.indexOf(maxQuality);
    const inRange = save.player.inventory.filter(
      (i) => QUALITY_ORDER.indexOf(i.quality) <= order,
    );
    // 保护策略：每个部位保留评分最高的一件，强化过的装备一律保留
    const keep = new Set<string>();
    if (protectUpgrades) {
      for (const slot of EQUIP_SLOTS) {
        const best = inRange
          .filter((i) => i.slot === slot)
          .reduce<EquipItem | null>((a, b) => (!a || itemScore(b) > itemScore(a) ? b : a), null);
        if (best) keep.add(best.uid);
      }
      for (const i of inRange) if (i.enhance > 0) keep.add(i.uid);
    }
    const targets = inRange.filter((i) => !keep.has(i.uid));
    if (targets.length === 0) {
      set({
        toast:
          inRange.length > 0
            ? "符合条件的装备都被保护（每部位最优 / 已强化），未出售"
            : "没有可批量出售的装备",
      });
      return;
    }
    const sold = new Set(targets.map((i) => i.uid));
    const gain = targets.reduce((sum, i) => sum + i.price, 0);
    set({
      save: {
        ...save,
        player: {
          ...save.player,
          inventory: save.player.inventory.filter((i) => !sold.has(i.uid)),
          silver: save.player.silver + gain,
        },
      },
      toast: `卖出 ${targets.length} 件${QUALITY_META[maxQuality].name}及以下装备，得银两 ${gain}`,
    });
    persist(get);
  },

  equip: (uid) => {
    const state = get();
    const save = state.save;
    const item = save.player.inventory.find((i) => i.uid === uid);
    if (!item) return;
    if (save.player.level < item.reqLevel) {
      set({ toast: `需要 ${item.reqLevel} 级才能装备` });
      return;
    }
    const { player } = equipItem(save.player, item);
    const stats = totalStats(player);
    set({
      save: {
        ...save,
        player: { ...player, hp: Math.min(player.hp, stats.hp), mp: Math.min(player.mp, stats.mp) },
      },
      toast: `已装备 ${item.name}`,
    });
    persist(get);
  },

  equipBest: () => {
    const state = get();
    const save = state.save;
    const { player, equipped } = autoEquipBest(save.player);
    if (equipped.length === 0) {
      set({ toast: "当前装备已是最优（或背包中没有等级足够的更好装备）" });
      return;
    }
    const stats = totalStats(player);
    set({
      save: {
        ...save,
        player: { ...player, hp: Math.min(player.hp, stats.hp), mp: Math.min(player.mp, stats.mp) },
      },
      toast: `一键换装：${equipped.join("、")}`,
    });
    persist(get);
  },

  equipBestSlot: (slot) => {
    const state = get();
    const save = state.save;
    const candidates = save.player.inventory.filter(
      (i) => i.slot === slot && i.reqLevel <= save.player.level,
    );
    if (candidates.length === 0) {
      set({ toast: "背包里没有该部位可穿的装备" });
      return;
    }
    const best = candidates.reduce((a, b) => (itemScore(b) > itemScore(a) ? b : a));
    const current = save.player.equipment[slot];
    if (current && itemScore(current) >= itemScore(best)) {
      set({ toast: `该部位已是当前最优（${current.name}）` });
      return;
    }
    const { player } = equipItem(save.player, best);
    const stats = totalStats(player);
    set({
      save: {
        ...save,
        player: { ...player, hp: Math.min(player.hp, stats.hp), mp: Math.min(player.mp, stats.mp) },
      },
      toast: `已换上 ${best.name}（评分 ${itemScore(best)}）`,
    });
    persist(get);
  },

  unequip: (slot) => {
    const state = get();
    const save = state.save;
    const item = save.player.equipment[slot];
    if (!item) return;
    const equipment = { ...save.player.equipment };
    delete equipment[slot];
    const player = { ...save.player, equipment, inventory: [...save.player.inventory, item].slice(0, 200) };
    const stats = totalStats(player);
    set({
      save: { ...save, player: { ...player, hp: Math.min(player.hp, stats.hp) } },
      toast: `已卸下 ${item.name}`,
    });
    persist(get);
  },

  enhance: (uid) => {
    const state = get();
    const save = state.save;
    const equipped = Object.values(save.player.equipment).find((i) => i?.uid === uid);
    const item = equipped ?? save.player.inventory.find((i) => i.uid === uid);
    if (!item) return;
    if (item.enhance >= 10) {
      set({ toast: "已达最高强化等级" });
      return;
    }
    const cost = enhanceCost(item);
    if (save.player.silver < cost.silver || (save.player.materials.rough_iron ?? 0) + (save.player.materials.dark_iron ?? 0) < cost.iron) {
      set({ toast: "银两或锻造材料不足" });
      return;
    }
    const materials = { ...save.player.materials };
    let need = cost.iron;
    for (const key of ["rough_iron", "dark_iron", "meteor_iron"]) {
      const have = materials[key] ?? 0;
      const use = Math.min(have, need);
      if (use > 0) {
        materials[key] = have - use;
        need -= use;
        if (materials[key] <= 0) delete materials[key];
      }
      if (need <= 0) break;
    }
    const upgraded: EquipItem = { ...item, enhance: item.enhance + 1 };
    const equipment = { ...save.player.equipment };
    let inventory = save.player.inventory;
    if (equipped) equipment[item.slot] = upgraded;
    else inventory = inventory.map((i) => (i.uid === uid ? upgraded : i));
    const player = {
      ...save.player,
      silver: save.player.silver - cost.silver,
      materials,
      equipment,
      inventory,
    };
    const stats = totalStats(player);
    set({
      save: { ...save, player: { ...player, hp: Math.min(player.hp, stats.hp) } },
      toast: `${item.name} 强化至 +${upgraded.enhance}`,
    });
    persist(get);
  },

  learnSkill: (skillId) => {
    const state = get();
    const save = state.save;
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    const check = canLearnSkill(save.player, skill);
    if (!check.ok) {
      set({ toast: check.reason });
      return;
    }
    const player = {
      ...save.player,
      silver: save.player.silver - skill.cost.silver,
      contribution: save.player.contribution - skill.cost.contribution,
      exp: save.player.exp - skill.cost.exp,
      skills: { ...save.player.skills, [skillId]: 1 },
    };
    set({
      save: applyPost(save, { player }),
      toast: `习得「${skill.name}」`,
    });
    persist(get);
  },

  upgradeSkill: (skillId) => {
    const state = get();
    const save = state.save;
    const skill = SKILL_MAP[skillId];
    const level = save.player.skills[skillId] ?? 0;
    if (!skill || level <= 0) return;
    if (level >= 10) {
      set({ toast: "该武学已至化境" });
      return;
    }
    const cost = skillUpgradeCost(skill, level);
    if (save.player.silver < cost.silver || save.player.contribution < cost.contribution) {
      set({ toast: "银两或门派贡献不足" });
      return;
    }
    if (save.player.exp < cost.exp) {
      set({ toast: `修为不足（需 ${cost.exp} 经验）` });
      return;
    }
    const player = {
      ...save.player,
      silver: save.player.silver - cost.silver,
      contribution: save.player.contribution - cost.contribution,
      exp: save.player.exp - cost.exp,
      skills: { ...save.player.skills, [skillId]: level + 1 },
    };
    set({ save: applyPost(save, { player }), toast: `「${skill.name}」提升至 ${level + 1} 层` });
    persist(get);
  },

  joinSect: (sect) => {
    const state = get();
    const save = state.save;
    const def = SECT_BY_ID[sect];
    if (!def) return;
    if (save.player.level < def.minLevel) {
      set({ toast: `需 ${def.minLevel} 级方可拜入${def.name}` });
      return;
    }
    if (save.player.sect) {
      set({ toast: "你已有门派，需先叛门（贡献清零）" });
      return;
    }
    set({
      save: applyPost(save, {
        player: { ...save.player, sect: sect, contribution: save.player.contribution + 50 },
      }),
      toast: `你已拜入${def.name}，获赠贡献 50`,
    });
    persist(get);
  },

  acceptQuest: (questId) => {
    const state = get();
    const save = state.save;
    const quest = QUEST_MAP[questId];
    if (!quest) return;
    if (save.quests.completed.includes(questId) || save.quests.active.includes(questId)) return;
    const quests = {
      ...save.quests,
      active: [...save.quests.active, questId],
      progress: { ...save.quests.progress, [questId]: save.quests.progress[questId] ?? 0 },
    };
    set({ save: { ...save, quests }, toast: `已接取「${quest.title}」` });
    persist(get);
  },

  claimQuest: (questId) => {
    const state = get();
    const save = state.save;
    const quest = QUEST_MAP[questId];
    if (!quest) return;
    const today = todayKey();
    const repeat = isRepeatable(questId);
    if (repeat && repeatRemaining(save, questId, today) <= 0) {
      set({ toast: `「${quest.title}」今日次数已用完，明日再来` });
      return;
    }
    if (!questReady(save, questId)) {
      set({ toast: `目标未完成（${Math.min(questProgress(save, questId), questNeed(questId))}/${questNeed(questId)}）` });
      return;
    }
    // 收集类任务扣除材料（进度按背包持有量计算）
    let player = save.player;
    if (quest.objective.type === "collect") {
      const need = quest.objective.count;
      const materials = { ...player.materials };
      if ((materials[quest.objective.materialId] ?? 0) < need) {
        set({ toast: "材料不足" });
        return;
      }
      materials[quest.objective.materialId] -= need;
      if (materials[quest.objective.materialId] <= 0) delete materials[quest.objective.materialId];
      player = { ...player, materials };
    }

    player = {
      ...player,
      silver: player.silver + quest.reward.silver,
      contribution: player.contribution + (quest.reward.contribution ?? 0),
    };
    const leveled = grantExp(player, quest.reward.exp);
    player = leveled.player;

    const drops: EquipItem[] = [];
    if (quest.reward.equip) {
      drops.push(
        generateEquip({
          level: Math.max(3, player.level),
          quality: quest.reward.equip,
          from: `任务·${quest.title}`,
        }),
      );
    }
    if (quest.reward.materials) {
      const gained: Record<string, number> = {};
      for (const mat of quest.reward.materials) {
        if (mat.count > 0) gained[mat.id] = (gained[mat.id] ?? 0) + mat.count;
      }
      player = addMaterials(player, gained);
    }
    if (quest.reward.potions) {
      const gained: Record<string, number> = {};
      for (const potion of quest.reward.potions) {
        if (potion.count > 0) gained[potion.id] = (gained[potion.id] ?? 0) + potion.count;
      }
      player = addPotions(player, gained);
    }
    player = { ...player, inventory: [...player.inventory, ...drops].slice(0, 200) };

    let nextQuests = {
      ...save.quests,
      progress: { ...save.quests.progress },
    };
    if (repeat) {
      // 循环/门派任务：记录次数、重置进度，可立即再接
      nextQuests = consumeRepeat(nextQuests, questId, today);
      nextQuests.progress[questId] = 0;
    } else {
      nextQuests = {
        ...nextQuests,
        active: nextQuests.active.filter((id) => id !== questId),
        completed: [...nextQuests.completed, questId],
      };
      if (quest.next && !nextQuests.active.includes(quest.next) && !nextQuests.completed.includes(quest.next)) {
        nextQuests.active = [...nextQuests.active, quest.next];
      }
    }

    const toasts = [`完成「${quest.title}」`];
    if (drops.length > 0) toasts.push(`获得 ${drops.map((d) => d.name).join("、")}`);
    if (quest.reward.potions?.length) {
      toasts.push(`药品 ${quest.reward.potions.map((p) => `${POTIONS[p.id]?.name ?? p.id}×${p.count}`).join("、")}`);
    }
    if (repeat) {
      const left = repeatRemaining({ ...save, quests: nextQuests }, questId, today);
      toasts.push(`今日剩余 ${left} 次`);
    }
    if (quest.next) toasts.push(`新任务：${QUEST_MAP[quest.next]?.title ?? ""}`);

    set({
      save: applyPost(save, { player, quests: nextQuests }),
      toast: toasts.join("；"),
    });
    persist(get);
    acceptAvailableQuests(get, set);
  },

  enterDungeon: (dungeonId) => {
    const state = get();
    const save = state.save;
    const def = DUNGEON_MAP[dungeonId];
    if (!def) return;
    if (save.player.level < def.minLevel) {
      set({ toast: `需 ${def.minLevel} 级方可挑战${def.name}` });
      return;
    }
    if (dungeonAvailable(save, dungeonId, todayKey()) <= 0) {
      set({ toast: "今日挑战次数已用尽" });
      return;
    }
    set({
      save: { ...save, dungeonRun: newDungeonRun(dungeonId) },
      tab: "dungeon",
      toast: `进入 ${def.name}`,
    });
    persist(get);
  },

  dungeonNext: () => {
    const state = get();
    const save = state.save;
    const run = save.dungeonRun;
    if (!run) return;
    const def = DUNGEON_MAP[run.dungeonId];
    if (!def) return;
    const monsterId = def.floors[Math.min(run.floor, def.floors.length - 1)];
    const group = buildMonsterGroup(monsterId, 1);
    const fighter = makeFighter(save);
    const potion = pickPotion(save.player);
    const result = resolveCombat(fighter, group, {
      autoHeal: potion != null,
      healThreshold: 0.5,
      verbose: true,
      potion,
    });

    let player = { ...save.player, hp: result.hp, mp: result.mp };
    if (potion && result.potionsUsed > 0) {
      const potions = { ...player.potions };
      potions[potion.id] = Math.max(0, (potions[potion.id] ?? 0) - result.potionsUsed);
      if (potions[potion.id] === 0) delete potions[potion.id];
      player = { ...player, potions };
    }
    const dungeonBrief: BattleBrief = {
      at: Date.now(),
      win: result.win,
      monster: `${result.monster.name}（${def.name} 第 ${run.floor + 1} 层）`,
      count: group.length,
      exp: result.exp,
      silver: result.silver,
      drops: result.drops.map((d) => d.name),
      died: result.died,
    };
    if (result.died) {
      player = { ...player, hp: Math.max(1, Math.round(totalStats(player).hp * 0.35)) };
      set({
        save: { ...save, player, dungeonRun: null },
        toast: `你在${def.name}第 ${run.floor + 1} 层力竭，被送出秘境（已得奖励保留）`,
      });
      persist(get);
      return;
    }

    const pending = {
      exp: run.pending.exp + result.exp,
      silver: run.pending.silver + result.silver,
      drops: [...run.pending.drops, ...result.drops],
      materials: addMaterials({ ...player, materials: run.pending.materials } as never, result.materials).materials as Record<string, number>,
    };

    const nextFloor = run.floor + 1;
    const cleared = nextFloor >= def.floors.length;
    if (cleared) {
      pending.exp += def.reward.exp;
      pending.silver += def.reward.silver;
      pending.drops.push(
        generateEquip({ level: def.minLevel + 6, quality: def.reward.equip, from: def.name }),
      );
      for (const mat of def.reward.materials ?? []) {
        pending.materials[mat.id] = (pending.materials[mat.id] ?? 0) + mat.count;
      }
      player = addMaterials(
        { ...player, silver: player.silver + pending.silver },
        pending.materials,
      );
      const leveled = grantExp(player, pending.exp);
      player = leveled.player;
      player = { ...player, inventory: [...player.inventory, ...pending.drops].slice(0, 200) };

      const record = save.dungeonDaily[def.id];
      const today = todayKey();
      const used = record && record.date === today ? record.used + 1 : 1;
      const next = applyPost(
        save,
        {
          player,
          dungeonRun: null,
          dungeonDaily: { ...save.dungeonDaily, [def.id]: { date: today, used } },
          stats: {
            ...save.stats,
            dungeonClears: save.stats.dungeonClears + 1,
            battles: save.stats.battles + def.floors.length,
            kills: save.stats.kills + def.floors.length,
          },
        },
        { dungeonId: def.id },
      );
      set({
        save: next,
        recentBattles: [dungeonBrief, ...state.recentBattles].slice(0, 12),
        toast: `通关「${def.name}」！经验 +${pending.exp}，银两 +${pending.silver}，获得 ${pending.drops
          .map((d) => d.name)
          .join("、")}`,
      });
      persist(get);
      acceptAvailableQuests(get, set);
      return;
    }

    set({
      save: {
        ...save,
        player,
        dungeonRun: {
          ...run,
          floor: nextFloor,
          pending,
          log: [
            `第 ${nextFloor} 层：击败 ${result.monster.name}，累计经验 ${pending.exp}、银两 ${pending.silver}`,
            ...run.log,
          ].slice(0, 20),
        },
      },
      recentBattles: [dungeonBrief, ...state.recentBattles].slice(0, 12),
      toast: `通过第 ${nextFloor} 层`,
    });
    persist(get);
  },

  dungeonRetreat: () => {
    const state = get();
    const save = state.save;
    const run = save.dungeonRun;
    if (!run) return;
    const def = DUNGEON_MAP[run.dungeonId];
    let player = addMaterials(
      { ...save.player, silver: save.player.silver + run.pending.silver },
      run.pending.materials,
    );
    const leveled = grantExp(player, run.pending.exp);
    player = leveled.player;
    player = { ...player, inventory: [...player.inventory, ...run.pending.drops].slice(0, 200) };
    set({
      save: applyPost(save, { player, dungeonRun: null }),
      toast: `撤退成功：带出经验 ${run.pending.exp}、银两 ${run.pending.silver}${
        def ? `（${def.name}）` : ""
      }`,
    });
    persist(get);
  },
}));

/** 自动接取所有可接任务（开启后每次战斗/挂机都会检查） */
function acceptAvailableQuests(
  get: () => WuxiaState,
  set: (patch: Partial<WuxiaState>) => void,
): void {
  const save = get().save;
  if (!save.autoAccept) return;
  const offerable = offerableQuests(save);
  if (offerable.length === 0) return;
  const quests = {
    ...save.quests,
    active: [...save.quests.active, ...offerable.map((q) => q.id)],
    progress: { ...save.quests.progress },
  };
  for (const quest of offerable) {
    if (quests.progress[quest.id] === undefined) quests.progress[quest.id] = 0;
  }
  set({ save: { ...save, quests } });
  saveGame(get().save);
}

function ensureIdleTimer(get: () => WuxiaState, set: (patch: Partial<WuxiaState>) => void) {
  if (idleTimer !== null) return;
  idleTimer = window.setInterval(() => {
    get().tickIdle();
  }, 1000);
  void set;
}

function stopIdleTimer() {
  if (idleTimer !== null) {
    window.clearInterval(idleTimer);
    idleTimer = null;
  }
}

function persist(get: () => WuxiaState) {
  saveGame(get().save);
}

/* ------------------------------ 供界面使用的派生数据 ------------------------------ */

export function availableMaps(save: SaveGame) {
  return MAPS.filter((m) => save.maps.includes(m.id) || m.id === "qingshi");
}

export function availableQuests(save: SaveGame) {
  const list: Array<{ id: string; state: "active" | "done" | "ready" }> = [];
  for (const id of save.quests.active) {
    list.push({ id, state: questReady(save, id) ? "ready" : "active" });
  }
  for (const id of save.quests.completed) list.push({ id, state: "done" });
  return list;
}

/** 可交付（已达成目标）的任务数量，用于标签页角标 */
export function readyQuestCount(save: SaveGame): number {
  return save.quests.active.filter((id) => questReady(save, id)).length;
}

/** 可接取但未接的支线（本地图已解锁且等级达标） */
export function offerableQuests(save: SaveGame) {
  return Object.values(QUEST_MAP).filter((quest) => {
    if (quest.kind === "main") return false;
    if (save.quests.active.includes(quest.id) || save.quests.completed.includes(quest.id)) return false;
    const map = MAP_BY_ID[quest.mapId];
    if (!map) return false;
    if (!save.maps.includes(map.id) && map.id !== "qingshi") return false;
    return save.player.level >= map.minLevel;
  });
}

/** 门派可学技能（含已学层数） */
export function sectSkills(save: SaveGame, sect: SectId) {
  return SKILLS.filter((s) => s.sect === sect).map((skill) => ({
    skill,
    level: save.player.skills[skill.id] ?? 0,
    check: canLearnSkill(save.player, skill),
  }));
}

export function totalPower(save: SaveGame): number {
  return powerOf(save.player);
}

/** 装备对比提示文本 */
export function equipHint(item: EquipItem, current: EquipItem | undefined): string {
  const diff = compareEquipSafe(item, current);
  const parts: string[] = [];
  if (diff.atk) parts.push(`攻 ${diff.atk > 0 ? "+" : ""}${diff.atk}`);
  if (diff.def) parts.push(`防 ${diff.def > 0 ? "+" : ""}${diff.def}`);
  if (diff.agi) parts.push(`身 ${diff.agi > 0 ? "+" : ""}${diff.agi}`);
  if (diff.hp) parts.push(`血 ${diff.hp > 0 ? "+" : ""}${diff.hp}`);
  return parts.join(" ") || "与当前相当";
}

function compareEquipSafe(item: EquipItem, current: EquipItem | undefined) {
  const a = enhancedStats(item);
  const b = current ? enhancedStats(current) : { atk: 0, def: 0, agi: 0, hp: 0, mp: 0, crit: 0, lifesteal: 0 };
  return {
    atk: a.atk - b.atk,
    def: a.def - b.def,
    agi: a.agi - b.agi,
    hp: a.hp - b.hp,
  };
}

export function qualityMark(quality: Quality): string {
  return QUALITY_META[quality].mark;
}

export function monsterOf(id: string) {
  return MONSTER_MAP[id];
}
