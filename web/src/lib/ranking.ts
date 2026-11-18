import type { Meal, MealType } from "./types";
import { DRINK_CFG } from "./drinks";

/**
 * 一天里每一样东西的热量排名。
 *
 * 为什么要这个：环形图告诉他还剩多少，"今天吃了"按顿告诉他吃了什么，
 * 但这两块都回答不了他最想问的那句 —— "今天到底是哪一口把我顶上去的"。
 * 一顿饭十个菜，报个总数 1880，他记住的是"我好像没吃多少"。
 * 排出来他才看见：半斤白酒 725，红烧肉 380，剩下的加起来还不如这两样。
 *
 * 所以榜单必须拆到"单样"，不能按顿排。按顿排只是把已有的卡片重排一遍，
 * 一点新信息都没有。
 */
export interface RankedFood {
  /** 列表 key。同一天两顿都有米饭，名字会撞，所以带上餐次和序号 */
  key: string;
  name: string;
  /** 份量或酒的数量，可能是空串 */
  portion: string;
  kcal: number;
  meal: MealType;
  /** 酒单独标出来：它不是菜，但热量上它经常是第一 */
  drink: boolean;
  /** 占今天总热量的比例，0–1 */
  share: number;
}

export interface RankingResult {
  list: RankedFood[];
  /** 今天所有东西加起来的热量（含酒），用于算占比 */
  total: number;
  /** 最大那一样占多少，空记录时是 0 */
  topShare: number;
}

/**
 * 只排有热量的东西。
 * 识别不出来、被用户取消勾选的那几样 kcal 是 0 —— 排进来会占一行写个 0，
 * 既没用，还会让人以为"这东西没热量"。
 */
export function foodRanking(meals: Meal[]): RankingResult {
  const raw: Omit<RankedFood, "share">[] = [];

  for (const m of meals) {
    m.items.forEach((it, i) => {
      if (!it.kcal || it.kcal <= 0) return;
      raw.push({
        key: `${m.id}-i${i}`,
        name: it.name,
        portion: it.portion ?? "",
        kcal: Math.round(it.kcal),
        meal: m.mealType,
        drink: false,
      });
    });

    // 酒不是菜，但一杯一杯算下来常常排第一 —— 单独成行，不并进哪道菜
    for (const d of m.drinks ?? []) {
      if (d.count <= 0) continue;
      const cfg = DRINK_CFG[d.kind];
      if (!cfg) continue;
      raw.push({
        key: `${m.id}-d-${d.kind}`,
        name: cfg.label,
        portion: `${d.count} ${cfg.unit}`,
        kcal: Math.round(cfg.kcalPerUnit * d.count),
        meal: m.mealType,
        drink: true,
      });
    }
  }

  raw.sort((a, b) => b.kcal - a.kcal);
  const total = raw.reduce((s, r) => s + r.kcal, 0);

  return {
    list: raw.map((r) => ({
      ...r,
      share: total > 0 ? r.kcal / total : 0,
    })),
    total,
    topShare: raw.length > 0 && total > 0 ? raw[0].kcal / total : 0,
  };
}

/**
 * 榜单顶部那句统计。
 *
 * 不写"最贵的是红烧肉 380 大卡"—— 第一行就写着，重复一遍只是让页面更长。
 * 换成一个只有排完序才知道的数：前 3 样占了多少。
 * 这个数字对饭局型的人是有说服力的：他以为自己吃了十几样，
 * 其实一半的热量是三道菜给的，剩下的可以放心。
 */
export function rankSummary(list: RankedFood[]): string | null {
  if (list.length < 3) return null;
  const top3 = list.slice(0, 3).reduce((s, r) => s + r.kcal, 0);
  const total = list.reduce((s, r) => s + r.kcal, 0);
  if (total <= 0) return null;
  return `今天 ${list.length} 样 · 前 3 样占 ${Math.round((top3 / total) * 100)}%`;
}
