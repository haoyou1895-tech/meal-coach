import type {
  Disease,
  Meal,
  Nutrition,
  NutritionPlan,
  Profile,
} from "./types";
import { drinkKcal } from "./drinks";

/** Mifflin-St Jeor 基础代谢 */
export function calcBMR(p: Pick<Profile, "gender" | "age" | "heightCm" | "weightKg">) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.gender === "male" ? base + 5 : base - 161);
}

/**
 * 日常生活本身的那部分消耗，取基础代谢的 1.2 倍。
 *
 * 这是 NEAT（非运动性产热）：起床、走路、说话、搬东西。
 * 以前这里是三个系数 1.2 / 1.3 / 1.45，让用户选自己"算哪档" ——
 * 问题是没人知道自己算哪档，选了也验证不了。
 *
 * 现在固定 1.2，代表"人是会动的"这个默认事实；
 * 真正的运动另外按 MET 精确加上去（见 lib/exercise.ts）。
 * 于是 tdee = bmr × 1.2 + 今天的运动消耗，每一项都说得清。
 */
const NEAT_FACTOR = 1.2;

/** 每日缺口：目标 0.3–0.5kg/周，取 400kcal/天 */
const DAILY_DEFICIT = 400;

const SAFE_FLOOR = { male: 1500, female: 1200 };

/**
 * 一天最多能留多大的缺口。三条线同时卡，取最紧的那个：
 *
 * (1) 缺口不超过总消耗的三成 —— 再往上就轮不到脂肪了，先掉的是肌肉；
 * (2) 一周掉的体重不超过体重的 1% —— 这条是通用的减重安全线；
 * (3) 预算不低于安全下限 —— 低于这个数，营养再怎么配也配不齐。
 *
 * 三条里 (1) 和 (3) 对 46 岁 78 公斤的人几乎同时生效，所以最后落点
 * 在 600 出头：一天 1500 大卡，一周掉 0.55 公斤。
 */
function maxSafeDeficit(p: Profile, tdee: number): number {
  const floor = SAFE_FLOOR[p.gender];
  return Math.max(
    100,
    Math.min(
      tdee * 0.3,
      (p.weightKg * 0.01 * 7700) / 7,
      tdee - floor,
    ),
  );
}

export function buildPlan(p: Profile, extraBurnKcal = 0): NutritionPlan {
  const bmr = calcBMR(p);
  /*
   * 运动消耗按"过去 7 天日均"传进来，不是今天的实际值。
   * 传今天会出两个问题：今晚跑了步，今晚的额度就涨，等于运动换饭；
   * 明天不跑了，额度又掉回去，他会觉得系统在乱跳。
   */
  const exerciseKcal = Math.max(0, Math.round(extraBurnKcal));
  const neatKcal = Math.round(bmr * NEAT_FACTOR);
  const tdee = neatKcal + exerciseKcal;
  const floor = SAFE_FLOOR[p.gender];
  const gapKg = Math.max(0, p.weightKg - p.targetWeightKg);
  const maxDeficit = maxSafeDeficit(p, tdee);

  // 1kg 脂肪 ≈ 7700 kcal
  const fastestWeeks =
    gapKg > 0 ? Math.ceil((gapKg * 7700) / (maxDeficit * 7)) : 0;

  /*
   * 用户自己定了周数，就反算每天要少吃多少。
   * 但反算出来的数不许越过安全边界 —— 他想"一个月掉 6 公斤"，
   * 系统只能给他最快的那一档，并且明说"这已经是最快"。
   * 不是不听话，是那个要求本身办不到，硬办到的部分不是脂肪。
   */
  const goalWeeks =
    p.goalWeeks && p.goalWeeks > 0 ? Math.round(p.goalWeeks) : null;
  const wanted =
    goalWeeks && gapKg > 0 ? (gapKg * 7700) / (goalWeeks * 7) : 0;
  const tooFast = wanted > maxDeficit + 1;

  const deficit = goalWeeks
    ? Math.min(wanted, maxDeficit)
    : gapKg > 0
      ? DAILY_DEFICIT
      : 0;

  const raw = tdee - deficit;
  const dailyBudgetKcal = Math.max(Math.round(raw), floor);
  const clamped = raw < floor;

  const proteinTargetG = Math.round(p.weightKg * 1.2);
  const fatTargetG = Math.round((dailyBudgetKcal * 0.27) / 9);
  const carbTargetG = Math.max(
    0,
    Math.round((dailyBudgetKcal - proteinTargetG * 4 - fatTargetG * 9) / 4),
  );

  const sodiumLimitMg = p.diseases.includes("hypertension") ? 2000 : 2500;

  const weeksToGoal =
    gapKg > 0 && deficit > 0
      ? Math.max(1, Math.round((gapKg * 7700) / (deficit * 7)))
      : 0;

  return {
    bmr,
    tdee,
    neatKcal,
    exerciseKcal,
    dailyBudgetKcal,
    proteinTargetG,
    fatTargetG,
    carbTargetG,
    sodiumLimitMg,
    clamped,
    weeksToGoal,
    deficit: Math.round(deficit),
    fastestWeeks,
    goalWeeks,
    tooFast,
    perWeekKg: Math.round(((deficit * 7) / 7700) * 100) / 100,
  };
}

export type GoalSpeed = "fast" | "steady" | "slow";

export interface GoalOption {
  key: GoalSpeed;
  label: string;
  weeks: number;
  budget: number;
  /** 这档一周掉多少公斤 */
  perWeek: number;
  /** 这档该存进 profile.goalWeeks 的值，稳的那档存 undefined */
  goalWeeks: number | undefined;
}

/**
 * 三个速度档，给"我觉得减太慢了"这个念头一个落点。
 *
 * 为什么是三个档而不是一个滑块：滑块要他先理解"周数和每天克数的换算"，
 * 而他要的只是"能不能快点"。三档各自把结果直接写出来（几周、每天多少），
 * 他比一比就选了，不需要换算。
 *
 * 快的那档取安全上界，不是随便加速度 —— 谁都能把数字调好看，
 * 代价是肌肉和水，那种"快"两周就反弹回来。
 */
export function goalOptions(p: Profile, extraBurnKcal = 0): GoalOption[] {
  const steady = buildPlan({ ...p, goalWeeks: undefined }, extraBurnKcal);
  const fast = buildPlan(
    { ...p, goalWeeks: steady.fastestWeeks || 1 },
    extraBurnKcal,
  );
  const slow = buildPlan(
    { ...p, goalWeeks: Math.ceil(steady.weeksToGoal * 1.4) },
    extraBurnKcal,
  );

  const shape = (
    key: GoalSpeed,
    label: string,
    plan: NutritionPlan,
    goalWeeks: number | undefined,
  ): GoalOption => ({
    key,
    label,
    weeks: plan.weeksToGoal,
    budget: plan.dailyBudgetKcal,
    perWeek: plan.perWeekKg,
    goalWeeks,
  });

  return [
    shape("fast", "快一点", fast, steady.fastestWeeks || undefined),
    shape("steady", "照这个", steady, undefined),
    shape(
      "slow",
      "慢一点",
      slow,
      Math.ceil(steady.weeksToGoal * 1.4),
    ),
  ];
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
      // 酒必须算进总热量：照片永远拍不出那瓶酒，但它比一桌菜更贵
      kcal: acc.kcal + m.nutrition.kcal + drinkKcal(m.drinks),
      protein: acc.protein + m.nutrition.protein,
      carb: acc.carb + m.nutrition.carb,
      fat: acc.fat + m.nutrition.fat,
      sodium: acc.sodium + m.nutrition.sodium,
    }),
    { ...EMPTY_NUTRITION },
  );
}

/** 连续记录了几天（含今天；今天没记就从昨天往前数） */
export function streakDays(meals: Meal[], today: string): number {
  const days = new Set(meals.map((m) => m.date));
  if (days.size === 0) return 0;

  const d = new Date(`${today}T12:00:00`);
  // 今天还没记不算断，从昨天开始数
  if (!days.has(today)) d.setDate(d.getDate() - 1);

  let n = 0;
  while (true) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    if (!days.has(`${y}-${mo}-${da}`)) break;
    n += 1;
    d.setDate(d.getDate() - 1);
    if (n > 3650) break;
  }
  return n;
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

/**
 * 加餐到底算下午茶还是宵夜。
 *
 * "加餐"是个分类词，不是人话。下午三点吃碗绿豆汤，他自己会说"下午茶"；
 * 十一点吃碗馄饨，那是"宵夜"。同一个 snack，两个完全不同的场景，
 * 写清楚比归对类有用。
 */
export function snackLabel(m: Pick<Meal, "mealType" | "eatenAt" | "createdAt">) {
  if (m.mealType !== "snack") return mealTypeLabel(m.mealType);
  const raw = m.eatenAt ?? m.createdAt;
  const d = raw ? new Date(raw) : new Date();
  const h = Number.isNaN(d.getTime()) ? new Date().getHours() : d.getHours();
  if (h >= 20 || h < 5) return "宵夜";
  // 只有真正的下午才叫下午茶。以前 13 点以后一律算下午茶，
  // 于是上午十一点的加餐也被写成"下午茶"，跟还没吃的午饭撞在一起。
  if (h >= 13 && h < 17) return "下午茶";
  if (h >= 5 && h < 12) return "上午";
  // 两餐正中间说不清是哪一顿，就别硬编一个词
  return "加餐";
}

/**
 * 按钟点猜这是哪一顿。
 *
 * 以前只看小时数，于是晚上十点打开还是显示"午餐" ——
 * 因为猜的动作发生在页面加载那一刻（早上），而人不关页面。
 * 现在除了按钟点，还看今天已经记了哪几顿：
 * 晚上九点以后、晚饭还没记，那多半是散得晚的饭局，算晚饭；
 * 晚饭已经记过了，才是加餐。
 */
export function guessMealType(
  d = new Date(),
  recorded: Meal["mealType"][] = [],
): Meal["mealType"] {
  const h = d.getHours();
  const base: Meal["mealType"] =
    h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
  if (base === "snack" && !recorded.includes("dinner")) return "dinner";
  return base;
}

/**
 * 这一天的预算。
 *
 * extraBurnKcal 是「那天之前 7 天的日均运动消耗」，不是那天的实际运动。
 * 理由见 buildPlan 里的注释：预算得稳，而且不能随当天运动实时膨胀。
 * 传 0 就是纯 NEAT 基线 —— 从没记过运动的人，一开始就是这个数。
 */
export function dayBudget(p: Profile, extraBurnKcal = 0): number {
  // 跟首页共用一套算法：他要是把目标改成"11 周"，记录页的预算线也得跟着降
  return buildPlan(p, extraBurnKcal).dailyBudgetKcal;
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
