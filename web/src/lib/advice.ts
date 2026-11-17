import type { Meal, MealType, Nutrition, NutritionPlan, Profile } from "./types";

/* ---------- 1. 下一顿该吃什么 ---------- */

export interface MealAdvice {
  /** 标题：晚饭这样吃 */
  headline: string;
  /** 具体到菜的一句话 */
  detail: string;
  /** 疾病的额外限制，没有就是空 */
  caution: string;
  tone: "good" | "warn" | "over";
}

/** 当前时间该吃哪一顿（晚上九点后返回 null，不再催） */
export function currentMealSlot(d = new Date()): MealType | null {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 10 * 60) return "breakfast";
  if (m < 15 * 60) return "lunch";
  if (m < 21 * 60) return "dinner";
  return null;
}

const SLOT_LABEL: Record<MealType, string> = {
  breakfast: "早饭",
  lunch: "午饭",
  dinner: "晚饭",
  snack: "加餐",
};

/**
 * 按"今天还剩多少额度"给下一顿的具体吃法。
 * 分档依据是剩余热量占全天的比例，不是绝对值——因为每个人预算不同。
 */
export function nextMealAdvice(
  left: number,
  budget: number,
  profile: Profile | null,
  now = new Date(),
): MealAdvice | null {
  const slot = currentMealSlot(now);
  if (!slot) return null;

  const label = SLOT_LABEL[slot];
  const ratio = budget > 0 ? left / budget : 0;
  const diseases = profile?.diseases ?? [];

  let detail: string;
  let tone: MealAdvice["tone"] = "good";

  if (left < 0) {
    tone = "over";
    detail = "今天已经超了，这顿先别吃主食，喝点水或者清汤就行";
  } else if (left < 150) {
    tone = "over";
    detail = "几乎没额度了，只吃一小份青菜，主食先别碰";
  } else if (ratio < 0.15) {
    tone = "warn";
    detail = "一份青菜 + 一个鸡蛋，主食先不上了";
  } else if (ratio < 0.35) {
    tone = "warn";
    detail = "半碗米饭 + 一份青菜 + 一小份肉，别喝汤";
  } else if (ratio < 0.55) {
    detail = "半碗杂粮饭 + 一荤两素，油炸的先跳过";
  } else {
    detail = "一碗米饭 + 一荤一素，正常吃就行";
  }

  // 疾病修正：只加一句，不叠加
  let caution = "";
  if (diseases.includes("hypertension")) caution = "菜少放盐，酱油和腌菜也算盐";
  else if (diseases.includes("diabetes")) caution = "主食换杂粮，先吃菜再吃饭";
  else if (diseases.includes("fattyLiver")) caution = "别油炸，少喝甜饮料";
  else if (diseases.includes("hyperlipidemia")) caution = "肥肉和内脏跳过";
  else if (diseases.includes("gout")) caution = "内脏和浓汤别碰，多喝水";

  return { headline: `${label}这样吃`, detail, caution, tone };
}

/* ---------- 2. 今天哪个营养素超了 ---------- */

export interface MacroWarning {
  key: "fat" | "carb" | "protein" | "sodium";
  text: string;
  /** 与疾病相关时更重要 */
  severe: boolean;
}

export function macroWarnings(
  totals: Nutrition,
  plan: NutritionPlan,
  profile: Profile | null,
  /** 现在几点，用于判断"蛋白不够"要不要提 */
  now = new Date(),
): MacroWarning[] {
  const out: MacroWarning[] = [];
  const d = profile?.diseases ?? [];

  if (totals.fat > plan.fatTargetG * 1.1) {
    const over = Math.round(totals.fat - plan.fatTargetG);
    if (d.includes("fattyLiver")) {
      out.push({
        key: "fat",
        text: `脂肪超了 ${over} 克。您有脂肪肝，这个最要紧。`,
        severe: true,
      });
    } else if (d.includes("hyperlipidemia")) {
      out.push({
        key: "fat",
        text: `脂肪超了 ${over} 克。血脂高要盯住这条。`,
        severe: true,
      });
    } else {
      out.push({
        key: "fat",
        text: `脂肪超了 ${over} 克，明天炒菜少放点油。`,
        severe: false,
      });
    }
  }

  if (totals.carb > plan.carbTargetG * 1.15) {
    const over = Math.round(totals.carb - plan.carbTargetG);
    if (d.includes("diabetes")) {
      out.push({
        key: "carb",
        text: `主食换算下来超了 ${over} 克碳水。血糖高，明天主食减半碗。`,
        severe: true,
      });
    } else {
      out.push({
        key: "carb",
        text: `碳水超了 ${over} 克，多半是米饭和面食吃多了。`,
        severe: false,
      });
    }
  }

  if (totals.sodium > plan.sodiumLimitMg) {
    out.push({
      key: "sodium",
      text: `盐超了 ${Math.round(totals.sodium - plan.sodiumLimitMg)} mg，明天汤和腌菜少碰。`,
      severe: d.includes("hypertension"),
    });
  }

  // 蛋白不够只在下午之后提，早上提没有意义
  if (now.getHours() >= 15 && totals.protein < plan.proteinTargetG * 0.5) {
    out.push({
      key: "protein",
      text: `蛋白才吃了 ${Math.round(totals.protein)} 克，差一半，晚饭加个蛋或者一块豆腐。`,
      severe: false,
    });
  }

  // 严重的排前面
  return out.sort((a, b) => Number(b.severe) - Number(a.severe)).slice(0, 2);
}

/* ---------- 3. 开屏该不该提醒吃饭 ---------- */

export interface MealReminder {
  text: string;
  urgent: boolean;
}

const SLOT_WINDOW: { type: MealType; label: string; start: number; end: number }[] = [
  { type: "breakfast", label: "早饭", start: 7 * 60, end: 9 * 60 + 30 },
  { type: "lunch", label: "午饭", start: 11 * 60 + 30, end: 13 * 60 + 30 },
  { type: "dinner", label: "晚饭", start: 17 * 60 + 30, end: 19 * 60 + 30 },
];

/**
 * 只在"该吃了""过了点还没记"这两种情况下说话，其余时间闭嘴。
 * 长辈最烦被 App 催，所以一天最多提三次。
 */
export function mealReminder(
  todayMeals: Meal[],
  now = new Date(),
): MealReminder | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  const done = new Set(todayMeals.map((m) => m.mealType));

  for (const s of SLOT_WINDOW) {
    if (done.has(s.type)) continue;
    // 快到点：提前半小时
    if (mins >= s.start - 30 && mins < s.start) {
      return { text: `快到${s.label}的点了，吃的时候顺手拍一张`, urgent: false };
    }
    // 正在点上
    if (mins >= s.start && mins <= s.end) {
      return { text: `${s.label}时间到了，吃完拍一张就行`, urgent: false };
    }
    // 过了点还没记，最多追三小时
    if (mins > s.end && mins < s.end + 180) {
      return { text: `${s.label}还没记，是没吃还是忘了拍？`, urgent: true };
    }
  }
  return null;
}
