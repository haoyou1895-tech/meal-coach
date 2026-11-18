import type { Drink, DrinkKind, Meal } from "./types";

/**
 * 酒的热量。
 *
 * 纯酒精 7 大卡/克，比糖（4）和蛋白（4）都高，仅次于脂肪（9）。
 * 一两 52 度白酒 ≈ 20 克酒精 ≈ 145 大卡，
 * 半斤就是 725 大卡 —— 一顿饭的额度就这么没了，而照片里它根本不算食物。
 */
export const DRINK_CFG: Record<
  DrinkKind,
  {
    label: string;
    unit: string;
    kcalPerUnit: number;
    alcoholPerUnit: number;
    hint: string;
  }
> = {
  baijiu: {
    label: "白酒",
    unit: "两",
    kcalPerUnit: 145,
    alcoholPerUnit: 20,
    hint: "52 度，一两约 145 大卡",
  },
  beer: {
    label: "啤酒",
    unit: "瓶",
    kcalPerUnit: 215,
    alcoholPerUnit: 20,
    hint: "一瓶 500ml 约 215 大卡",
  },
  wine: {
    label: "红酒",
    unit: "杯",
    kcalPerUnit: 110,
    alcoholPerUnit: 14,
    hint: "一杯 150ml 约 110 大卡",
  },
  huangjiu: {
    label: "黄酒",
    unit: "两",
    kcalPerUnit: 50,
    alcoholPerUnit: 6,
    hint: "一两约 50 大卡，糖分高",
  },
};

export const DRINK_KINDS = Object.keys(DRINK_CFG) as DrinkKind[];

export function drinkKcal(drinks?: Drink[]): number {
  return Math.round(
    (drinks ?? []).reduce(
      (s, d) => s + (DRINK_CFG[d.kind]?.kcalPerUnit ?? 0) * d.count,
      0,
    ),
  );
}

export function drinkAlcoholG(drinks?: Drink[]): number {
  return Math.round(
    (drinks ?? []).reduce(
      (s, d) => s + (DRINK_CFG[d.kind]?.alcoholPerUnit ?? 0) * d.count,
      0,
    ),
  );
}

export function drinksLabel(drinks?: Drink[]): string {
  const list = (drinks ?? []).filter((d) => d.count > 0);
  if (!list.length) return "";
  return list
    .map((d) => `${DRINK_CFG[d.kind].label} ${d.count} ${DRINK_CFG[d.kind].unit}`)
    .join("、");
}

/** 一天所有记录里的酒 */
export function dayDrinks(meals: Meal[]): Drink[] {
  return meals.flatMap((m) => m.drinks ?? []).filter((d) => d.count > 0);
}

/**
 * 按酒精克数给一句判断。
 * 中国居民膳食指南：成年男性每日酒精不超过 25 克。
 */
export function alcoholVerdict(g: number): string | null {
  if (g <= 0) return null;
  if (g <= 25) return "没超 25 克，算克制";
  if (g <= 50) return "超过建议量了，今天就到这儿";
  return "这个量不小，明天最好空一天";
}
