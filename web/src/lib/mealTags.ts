import type { Meal, MealTag } from "./types";

/**
 * 盐不靠照片估。
 *
 * 盐在菜里是溶解的，照片上一克都看不见 —— 让模型报一个毫克数，
 * 那个数字是编的，而高血压的人会当真。错了比不给更糟。
 *
 * 所以改成「打标」：不问多少克，只问盐从哪儿来。
 * 这几类占了中国人吃盐的绝大部分，而且用户自己答得出来。
 */
export const TAG_CFG: Record<
  MealTag,
  { label: string; sodiumMg: number; why: string }
> = {
  soup: { label: "有汤", sodiumMg: 600, why: "一碗汤常有 2–3 克盐" },
  pickled: { label: "咸菜腊味", sodiumMg: 800, why: "腌制品是隐形盐的大头" },
  out: { label: "在外吃", sodiumMg: 500, why: "馆子的盐和油都比家里重" },
  fried: { label: "油炸", sodiumMg: 150, why: "挂糊本身就带盐" },
  sweet: { label: "糖醋甜口", sodiumMg: 120, why: "甜口菜也是要放盐的" },
};

export const TAG_LIST = Object.keys(TAG_CFG) as MealTag[];

/** 米饭青菜这种淡口打底，谁都得吃 */
const BASE_MG = 250;

export function sodiumFromTags(tags?: MealTag[]): number {
  return (tags ?? []).reduce(
    (s, t) => s + (TAG_CFG[t]?.sodiumMg ?? 0),
    BASE_MG,
  );
}

export type SaltLevel = "light" | "medium" | "heavy";

export const SALT_LABEL: Record<SaltLevel, string> = {
  light: "清淡",
  medium: "偏咸",
  heavy: "很咸",
};

export const SALT_COLOR: Record<SaltLevel, string> = {
  light: "#4aa87a",
  medium: "#c9801f",
  heavy: "#d94f3d",
};

/**
 * 一天里已经打了标的几顿，盐大概到什么程度。
 * 没打标的顿数单独数出来 —— 不是 0，是「不知道」，这两者不能混。
 */
export function daySalt(meals: Meal[]) {
  const tagged = meals.filter((m) => (m.tags?.length ?? 0) > 0);
  const mg = tagged.reduce((s, m) => s + sodiumFromTags(m.tags), 0);
  const untagged = meals.length - tagged.length;
  return { mg, taggedCount: tagged.length, untagged };
}

export function saltLevelOf(mg: number, taggedCount: number): SaltLevel {
  // 按打标的顿数折算成一整天的量，否则只记一顿的人永远"清淡"
  const perMeal = taggedCount > 0 ? mg / taggedCount : 0;
  const projected = perMeal * 3;
  if (projected <= 1500) return "light";
  if (projected <= 3000) return "medium";
  return "heavy";
}
