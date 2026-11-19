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
  {
    label: string;
    /** 记录卡上显示，比 label 短一点 */
    short: string;
    icon: "soup" | "pickled" | "out" | "fried" | "sweet";
    sodiumMg: number;
    why: string;
  }
> = {
  soup: {
    label: "有汤",
    short: "有汤",
    icon: "soup",
    sodiumMg: 600,
    why: "一碗汤常有 2–3 克盐",
  },
  pickled: {
    label: "腌菜",
    short: "腌菜",
    icon: "pickled",
    sodiumMg: 800,
    why: "腌制品是隐形盐的大头",
  },
  out: {
    // 原来叫"在外吃"、按钮上只有一个"外"字，没人知道是什么
    label: "下馆子",
    short: "在外",
    icon: "out",
    sodiumMg: 500,
    why: "馆子的盐和油都比家里重",
  },
  fried: {
    label: "油炸",
    short: "油炸",
    icon: "fried",
    sodiumMg: 150,
    why: "挂糊本身就带盐",
  },
  /**
   * 甜口已经从勾选项里拿掉了。
   * "糖醋菜也要放盐"这话在营养上没错，但对用户是荒谬的 ——
   * 他在回答"盐从哪来"，你给他一个"甜"，只会让他怀疑整页都不靠谱。
   * 配置留着只为读得懂老记录。
   */
  sweet: {
    label: "甜口",
    short: "甜口",
    icon: "sweet",
    sodiumMg: 120,
    why: "甜口菜也是要放盐的",
  },
};

/** 用户能勾的只有这四样 */
export const TAG_LIST: MealTag[] = ["soup", "pickled", "out", "fried"];

/** 米饭青菜这种淡口打底，谁都得吃 */
const BASE_MG = 250;

export function sodiumFromTags(tags?: MealTag[]): number {
  return (tags ?? []).reduce(
    (s, t) => s + (TAG_CFG[t]?.sodiumMg ?? 0),
    BASE_MG,
  );
}

/**
 * 一顿饭的钠：模型看照片给的基础值 + 标签补上「照片看不出来」的那部分。
 *
 * 上一版这里是个真错误：不管你勾不勾，钠都只按标签重算 ——
 * 不勾 = 只有 250mg 底，等于「这顿几乎没放盐」。可正常的炒菜本来就有盐，
 * 用户不勾不是因为他吃得淡，是因为那几个按钮问得奇怪。
 *
 * 所以现在以模型的估值为地基（它看得见盘子里有什么），标签只往上加。
 * 加的时候打六折：模型看图多半已经看出「有汤」「在外面吃」，
 * 标签全额加上去会把同一碗汤算两遍。
 */
export function sodiumWithTags(baseMg: number, tags?: MealTag[]): number {
  const extra = (tags ?? []).reduce(
    (s, t) => s + (TAG_CFG[t]?.sodiumMg ?? 0),
    0,
  );
  const base = baseMg > 0 ? baseMg : BASE_MG;
  return Math.round(base + extra * 0.6);
}

/** 1 克盐 ≈ 400 毫克钠，人话是「几克盐」不是「几千毫克钠」 */
export function saltGram(mg: number): number {
  return Math.round((mg / 400) * 10) / 10;
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
 * 一天吃进来多少钠。
 *
 * 每顿的钠在存的时候就算好了（模型估的 + 标签补的），这里只需要加起来。
 * 老记录里没有钠值（或者为 0）的，退回按标签估 —— 不然以前记的那些会凭空消失。
 */
export function daySalt(meals: Meal[]) {
  let mg = 0;
  let counted = 0;
  for (const m of meals) {
    const own = m.nutrition?.sodium ?? 0;
    if (own > 0) {
      mg += own;
      counted += 1;
    } else if ((m.tags?.length ?? 0) > 0) {
      mg += sodiumFromTags(m.tags);
      counted += 1;
    }
  }
  return { mg, taggedCount: counted, untagged: meals.length - counted };
}

export function saltLevelOf(mg: number, taggedCount: number): SaltLevel {
  // 只记了一顿的人，按这顿的样子推算一整天 —— 否则他永远是「清淡」
  const perMeal = taggedCount > 0 ? mg / taggedCount : 0;
  const projected = perMeal * 3;
  // 5 克盐 ≈ 2000mg 钠，这就是一天的上限，不是 1500
  if (projected <= 2000) return "light";
  if (projected <= 3200) return "medium";
  return "heavy";
}
