import type { Nutrition, NutritionPlan, Profile } from "./types";

/**
 * 单点建议规则引擎。
 * 用途：1) AI 不可用时的兜底　2) 校验 AI 输出是否靠谱
 * 原则：一次只说一件事，按优先级取最高的一条。
 */
export function ruleComment(
  n: Nutrition,
  profile: Profile | null,
  plan: NutritionPlan,
  dayKcalBefore: number,
): string {
  const diseases = profile?.diseases ?? [];
  const budget = plan.dailyBudgetKcal;

  // P0 —— 与疾病冲突
  if (diseases.includes("hypertension") && n.sodium > 800) {
    return "这顿有点咸。您血压高，下回少放半勺盐。";
  }
  if (diseases.includes("diabetes") && n.carb > 80) {
    return "主食偏多了。下顿少半碗饭，多夹两口菜。";
  }
  if (diseases.includes("fattyLiver")) {
    if (n.fat > 28) return "这顿油有点大。脂肪肝怕这个，晚上清蒸或者水煮吧。";
    if (n.kcal > 300 && n.carb * 4 > n.kcal * 0.62) {
      return "主食占得有点多。脂肪肝怕糖，多夹点菜和肉。";
    }
  }
  if (diseases.includes("hyperlipidemia") && n.fat > 32) {
    return "油的量超了。肥肉和油炸的少碰，多吃点青菜。";
  }
  if (diseases.includes("gout") && n.protein > 35) {
    return "肉有点多。痛风的人吃肉要控量，这顿够了。";
  }

  // P0.5 —— 通用钠超标（不依赖是否有高血压）
  if (n.sodium > 1500) {
    return "这顿偏咸了，下回盐少放半勺，汤也少喝点。";
  }

  // P1 —— 单餐热量过高
  if (n.kcal > budget * 0.4) {
    const left = budget - dayKcalBefore - n.kcal;
    if (left > 200) {
      return `这顿顶了小半天，今天还剩 ${Math.round(left)} 大卡，晚上清淡点。`;
    }
    return "这顿吃得有点多，今天额度基本用完了，晚上喝点粥就行。";
  }

  // P2 —— 结构失衡
  if (n.protein < 12 && n.kcal > 250) {
    return "肉蛋有点少，加个鸡蛋或者一块豆腐，更扛饿。";
  }
  if (n.fat > 35) {
    return "这顿偏油了，下回少放点油，炒菜改蒸煮。";
  }
  if (n.kcal < 200 && n.kcal > 0) {
    return "这顿吃得太少，别硬扛，饿过头下顿容易吃多。";
  }

  // P3 —— 正向
  return "这顿吃得挺稳，照这个来。";
}

/** 顶部状态条的一句话概括 */
export function dayStatusText(
  used: number,
  budget: number,
): { text: string; tone: "good" | "warn" | "over" } {
  const left = budget - used;
  if (used === 0) return { text: `今天还能吃 ${budget} 大卡`, tone: "good" };
  if (left > budget * 0.2)
    return { text: `今天还剩 ${Math.round(left)} 大卡`, tone: "good" };
  if (left >= 0) return { text: `今天只剩 ${Math.round(left)} 大卡了`, tone: "warn" };
  return { text: `今天超了 ${Math.round(-left)} 大卡`, tone: "over" };
}
