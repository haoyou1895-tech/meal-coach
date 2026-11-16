import type {
  ActivityLevel,
  Disease,
  Meal,
  Nutrition,
  NutritionPlan,
  Profile,
} from "./types";

/** Mifflin-St Jeor 基础代谢 */
export function calcBMR(p: Pick<Profile, "gender" | "age" | "heightCm" | "weightKg">) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.gender === "male" ? base + 5 : base - 161);
}

/** 活动系数：长辈按轻度活动保守取 1.3 */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  low: 1.2,
  normal: 1.3,
  high: 1.45,
};

/** 每日缺口：目标 0.3–0.5kg/周，取 400kcal/天 */
const DAILY_DEFICIT = 400;

const SAFE_FLOOR = { male: 1500, female: 1200 };

export function buildPlan(
  p: Profile,
  activity: ActivityLevel = "normal",
): NutritionPlan {
  const bmr = calcBMR(p);
  const tdee = Math.round(bmr * ACTIVITY_FACTOR[activity]);
  const raw = tdee - DAILY_DEFICIT;
  const floor = SAFE_FLOOR[p.gender];
  const dailyBudgetKcal = Math.max(raw, floor);
  const clamped = raw < floor;

  const proteinTargetG = Math.round(p.weightKg * 1.2);
  const fatTargetG = Math.round((dailyBudgetKcal * 0.27) / 9);
  const carbTargetG = Math.max(
    0,
    Math.round((dailyBudgetKcal - proteinTargetG * 4 - fatTargetG * 9) / 4),
  );

  const sodiumLimitMg = p.diseases.includes("hypertension") ? 2000 : 2500;

  const gapKg = Math.max(0, p.weightKg - p.targetWeightKg);
  // 1kg 脂肪 ≈ 7700 kcal
  const weeksToGoal = Math.max(
    1,
    Math.round((gapKg * 7700) / (DAILY_DEFICIT * 7)),
  );

  return {
    bmr,
    tdee,
    dailyBudgetKcal,
    proteinTargetG,
    fatTargetG,
    carbTargetG,
    sodiumLimitMg,
    clamped,
    weeksToGoal,
  };
}

export const EMPTY_NUTRITION: Nutrition = {
  kcal: 0,
  protein: 0,
  carb: 0,
  fat: 0,
  sodium: 0,
};

export function sumMeals(meals: Meal[]): Nutrition {
  return meals.reduce<Nutrition>(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carb: acc.carb + m.nutrition.carb,
      fat: acc.fat + m.nutrition.fat,
      sodium: acc.sodium + m.nutrition.sodium,
    }),
    { ...EMPTY_NUTRITION },
  );
}

export function round(n: number, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mealTypeLabel(t: Meal["mealType"]) {
  return { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" }[t];
}

export function guessMealType(d = new Date()): Meal["mealType"] {
  const h = d.getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

/** 疾病 → 中文 */
export const DISEASE_LABEL: Record<Disease, string> = {
  hypertension: "高血压",
  diabetes: "血糖高/糖尿病",
  hyperlipidemia: "高血脂",
  fattyLiver: "脂肪肝",
  gout: "痛风",
  stomach: "胃病",
  none: "都没有",
  unknown: "不清楚",
};

export function hasDisease(p: Profile | null, d: Disease) {
  return !!p?.diseases.includes(d);
}
