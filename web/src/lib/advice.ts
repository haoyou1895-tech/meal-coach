import type {
  Meal,
  MealRegular,
  MealType,
  Nutrition,
  NutritionPlan,
  Profile,
} from "./types";

/* ---------- 1. 下一顿该吃什么 ---------- */

/**
 * 一顿饭拆成三格：主食、荤、素。
 *
 * 之前这里是一整句"半碗杂粮饭 + 一荤两素，油炸的先跳过"。
 * 字都认识，但一眼扫过去要读三秒 —— 而这条恰恰是首页第一眼要看的东西。
 * 拆成图标 + 两个字，不用读，扫一眼就知道。
 */
export interface MealPart {
  kind: "carb" | "meat" | "veg";
  /** 2–4 个字，多了就不是符号了 */
  label: string;
  /** 三格的主次：主格加粗，次格变灰 */
  dim?: boolean;
}

export interface MealAdvice {
  /** 标题：晚饭这样吃 */
  headline: string;
  /** 具体到菜的一句话，留给"展开看"和读屏软件 */
  detail: string;
  /** 疾病的额外限制，没有就是空 */
  caution: string;
  /** 图标版的三格 */
  parts: MealPart[];
  /** 疾病限制的图标 */
  cautionIcon?: "salt" | "carb" | "fat" | "protein";
  tone: "good" | "warn" | "over";
}

/**
 * 当前时间该吃哪一顿（晚上九点后返回 null，不再催）。
 * 有历史作息时，分界点按本人习惯算：一个 13:30 才吃午饭的人，
 * 13:00 打开 App 不该被告知"晚饭这样吃"。
 */
export function currentMealSlot(
  d = new Date(),
  habit?: Partial<Record<MealType, number>> | null,
): MealType | null {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 21 * 60) return null;

  if (habit) {
    const b = habit.breakfast ?? 7 * 60;
    const l = habit.lunch ?? 12 * 60;
    const dn = habit.dinner ?? 18 * 60;
    // 分界点取相邻两餐的中点
    if (m < (b + l) / 2) return "breakfast";
    if (m < (l + dn) / 2) return "lunch";
    return "dinner";
  }

  if (m < 10 * 60) return "breakfast";
  if (m < 15 * 60) return "lunch";
  return "dinner";
}

/** 把分钟数写成 12:40 的样子 */
export function fmtMinute(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 从已有记录里学出每餐通常几点吃（分钟）。
 *
 * 为什么不在设置里问："您平时几点吃早饭"这种问题长辈答不准，
 * 而且换季、换工作就变了。直接看他实际记的时间，比问出来的准。
 * 取中位数不用平均数：偶尔一次夜宵吃两小时不会把整条线拉歪。
 *
 * 每餐至少 2 条记录才认，否则宁可返回空、用默认窗口。
 */
export function habitTimes(meals: Meal[]): Partial<Record<MealType, number>> {
  const bag: Partial<Record<MealType, number[]>> = {};
  for (const m of meals) {
    const raw = m.eatenAt ?? m.createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const mins = d.getHours() * 60 + d.getMinutes();
    // 凌晨的记录多半是补记或夜宵，学进"正常作息"会带偏
    if (mins < 5 * 60 || mins > 23 * 60) continue;
    (bag[m.mealType] ??= []).push(mins);
  }

  const out: Partial<Record<MealType, number>> = {};
  for (const [k, arr] of Object.entries(bag) as [MealType, number[]][]) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    out[k] =
      sorted.length % 2
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return out;
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
  habit?: Partial<Record<MealType, number>> | null,
): MealAdvice | null {
  const slot = currentMealSlot(now, habit);
  if (!slot) return null;

  const label = SLOT_LABEL[slot];
  const ratio = budget > 0 ? left / budget : 0;
  const diseases = profile?.diseases ?? [];

  let detail: string;
  let parts: MealPart[];
  let tone: MealAdvice["tone"] = "good";

  if (left < 0) {
    tone = "over";
    detail = "今天已经超了，这顿先别吃主食，喝点水或者清汤就行";
    parts = [
      { kind: "carb", label: "先不吃" },
      { kind: "veg", label: "清汤" },
    ];
  } else if (left < 150) {
    tone = "over";
    detail = "几乎没额度了，只吃一小份青菜，主食先别碰";
    parts = [
      { kind: "carb", label: "先不吃" },
      { kind: "veg", label: "一小份" },
    ];
  } else if (ratio < 0.15) {
    tone = "warn";
    detail = "一份青菜 + 一个鸡蛋，主食先不上了";
    parts = [
      { kind: "carb", label: "先不吃" },
      { kind: "meat", label: "一个蛋" },
      { kind: "veg", label: "一份" },
    ];
  } else if (ratio < 0.35) {
    tone = "warn";
    detail = "半碗米饭 + 一份青菜 + 一小份肉，别喝汤";
    parts = [
      { kind: "carb", label: "半碗" },
      { kind: "meat", label: "一小份" },
      { kind: "veg", label: "一份" },
    ];
  } else if (ratio < 0.55) {
    detail = "半碗杂粮饭 + 一荤两素，油炸的先跳过";
    parts = [
      { kind: "carb", label: "半碗杂粮" },
      { kind: "meat", label: "一份" },
      { kind: "veg", label: "两样" },
    ];
  } else {
    detail = "一碗米饭 + 一荤一素，正常吃就行";
    parts = [
      { kind: "carb", label: "一碗" },
      { kind: "meat", label: "一份" },
      { kind: "veg", label: "一样" },
    ];
  }

  // 疾病修正：只加一句，不叠加
  let caution = "";
  let cautionIcon: MealAdvice["cautionIcon"];
  if (diseases.includes("hypertension")) {
    caution = "菜少放盐，酱油和腌菜也算盐";
    cautionIcon = "salt";
  } else if (diseases.includes("diabetes")) {
    caution = "主食换杂粮，先吃菜再吃饭";
    cautionIcon = "carb";
  } else if (diseases.includes("fattyLiver")) {
    caution = "别油炸，少喝甜饮料";
    cautionIcon = "fat";
  } else if (diseases.includes("hyperlipidemia")) {
    caution = "肥肉和内脏跳过";
    cautionIcon = "fat";
  } else if (diseases.includes("gout")) {
    caution = "内脏和浓汤别碰，多喝水";
    cautionIcon = "protein";
  }

  return { headline: `${label}这样吃`, detail, caution, parts, cautionIcon, tone };
}

/* ---------- 2. 今天哪个营养素超了 ---------- */

export interface MacroWarning {
  key: "fat" | "carb" | "protein" | "sodium";
  /** 图标 */
  icon: "fat" | "carb" | "protein" | "salt";
  /** 5–8 字的主判断，界面上只显示这个 */
  short: string;
  /** 半句话的下一步 */
  tip: string;
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
    // 脂肪肝、高血脂的人，这条不是"注意一下"，是这顿饭最大的问题
    const bad = d.includes("fattyLiver") || d.includes("hyperlipidemia");
    out.push({
      key: "fat",
      icon: "fat",
      short: `脂肪超 ${over} 克`,
      tip: bad ? "这个对您最要紧，明天少油" : "明天炒菜少放点油",
      text: `脂肪超了 ${over} 克，明天炒菜少放点油。`,
      severe: bad,
    });
  }

  if (totals.carb > plan.carbTargetG * 1.15) {
    const over = Math.round(totals.carb - plan.carbTargetG);
    const bad = d.includes("diabetes");
    out.push({
      key: "carb",
      icon: "carb",
      short: `碳水超 ${over} 克`,
      tip: bad ? "血糖高，明天主食减半碗" : "米饭面食吃多了",
      text: `碳水超了 ${over} 克，多半是米饭和面食吃多了。`,
      severe: bad,
    });
  }

  // 盐不在这儿说了。
  // 这里的数字来自模型对照片的估算，而盐在照片里根本看不见 ——
  // 报一个估出来的毫克数，等于用一个假数字去否定旁边那张打标卡。
  // 盐归"盐吃得重不重"那张卡管，它问来源，不猜克数。

  // 蛋白不够只在下午之后提，早上提没有意义
  if (now.getHours() >= 15 && totals.protein < plan.proteinTargetG * 0.5) {
    out.push({
      key: "protein",
      icon: "protein",
      short: "蛋白差一半",
      tip: "晚饭加个蛋或一块豆腐",
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

const SLOT_ORDER: { type: MealType; label: string }[] = [
  { type: "breakfast", label: "早饭" },
  { type: "lunch", label: "午饭" },
  { type: "dinner", label: "晚饭" },
];

/** 还没有历史作息时用的默认窗口（大多数人的饭点） */
const DEFAULT_WINDOW: Partial<Record<MealType, { start: number; end: number }>> = {
  breakfast: { start: 7 * 60, end: 9 * 60 + 30 },
  lunch: { start: 11 * 60 + 30, end: 13 * 60 + 30 },
  dinner: { start: 17 * 60 + 30, end: 19 * 60 + 30 },
};

/**
 * 这一餐的提醒窗口。
 * 学会习惯时间后，以它为中心：提前 20 分钟开口，往后放 50 分钟。
 * 一个天天 8 点吃早饭的人，7:00 被提醒是打扰；
 * 一个天天 9 点吃的人，7:00 被提醒只会觉得这软件不懂他。
 */
function windowFor(type: MealType, habitMin?: number) {
  if (habitMin == null) {
    return DEFAULT_WINDOW[type] ?? { start: 12 * 60, end: 13 * 60 };
  }
  return { start: habitMin - 20, end: habitMin + 50 };
}

/**
 * 设置里「三餐规律吗」这一题的答案，决定三件事：
 * - lead：提前多久开口提醒。越规律越能提前说，因为他说到就到；
 *   越不规律越不能提前，提前催等于白催，还招人烦。
 * - atTime：正点上要不要再说一句。不规律的人这个点多半在忙，
 *   说「午饭时间到了」只会被无视。
 * - chase：过了饭点多久才问「吃了吗」。越不规律越该多给点时间，
 *   他可能正开着会，一点钟才下楼吃饭。
 */
const REGULAR_CFG: Record<
  MealRegular,
  { lead: number; atTime: boolean; chase: number }
> = {
  regular: { lead: 45, atTime: true, chase: 0 },
  sometimes: { lead: 30, atTime: true, chase: 30 },
  irregular: { lead: 0, atTime: false, chase: 60 },
};

/**
 * 只在"该吃了""过了点还没记"这两种情况下说话，其余时间闭嘴。
 * 长辈最烦被 App 催，所以一天最多提三次。
 *
 * habit 是 habitTimes() 学出来的作息；没有就用默认窗口。
 */
export function mealReminder(
  todayMeals: Meal[],
  mealRegular: MealRegular = "sometimes",
  now = new Date(),
  habit?: Partial<Record<MealType, number>> | null,
): MealReminder | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  const done = new Set(todayMeals.map((m) => m.mealType));
  const cfg = REGULAR_CFG[mealRegular] ?? REGULAR_CFG.sometimes;

  for (const s of SLOT_ORDER) {
    if (done.has(s.type)) continue;
    const usual = habit?.[s.type];
    const win = windowFor(s.type, usual);

    // 快到点
    if (cfg.lead > 0 && mins >= win.start - cfg.lead && mins < win.start) {
      return { text: `快到${s.label}的点了，吃的时候顺手拍一张`, urgent: false };
    }
    // 正在点上
    if (cfg.atTime && mins >= win.start && mins <= win.end) {
      return { text: `${s.label}时间到了，吃完拍一张就行`, urgent: false };
    }
    // 过了点还没记，最多追三小时
    if (mins >= win.end + cfg.chase && mins < win.end + 180) {
      const usualNote =
        usual != null ? `平时这个点（${fmtMinute(usual)}）已经吃了，` : "";
      return { text: `${s.label}还没记，${usualNote}是没吃还是忘了拍？`, urgent: true };
    }
  }
  return null;
}
