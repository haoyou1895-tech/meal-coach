import type { MealType, Nutrition, NutritionPlan, Profile } from "./types";

/**
 * 这顿之后还剩哪几顿。
 * 之前点评里写死了"晚上清淡点"，早餐吃完也说晚上，晚餐吃完还说晚上，所以必须按餐次算。
 */
function nextMeal(mealType: MealType): { next: string; rest: string } {
  switch (mealType) {
    case "breakfast":
      return { next: "午饭", rest: "今天还剩午饭和晚饭" };
    case "lunch":
      return { next: "晚饭", rest: "今天只剩晚饭" };
    case "dinner":
      return { next: "明天早饭", rest: "今天已经吃完了" };
    default: {
      const h = new Date().getHours();
      return h < 15
        ? { next: "晚饭", rest: "今天只剩晚饭" }
        : { next: "明天早饭", rest: "今天已经吃完了" };
    }
  }
}

/**
 * 每顿饭该吃多少。
 *
 * 之前只有一个标准：超过全天预算 40% 就算多。结果 580 大卡的土豆烧肉盖饭当早饭，
 * 因为没到 668，被评成"吃得挺稳"——早饭吃成一整顿正餐，系统还说好。
 *
 * 现在按国人的三餐分布给每顿单独的参考量：早饭 25%、午饭 35%、晚饭 30%、加餐 10%。
 * 早午饭都一样重是不对的：早饭吃多了上午腻，午饭吃少了下午顶不住。
 */
const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

/** 每顿饭的合理区间。上限放 30% 余量，下限卡 6 成 */
function slotRange(mealType: MealType, budget: number) {
  const ref = budget * MEAL_SHARE[mealType];
  return { ref, high: ref * 1.3, low: ref * 0.6 };
}

/**
 * 一条点评长什么样。
 *
 * 结构是"图标 + 四个字 + 半句话"，不是一段说明文。
 * 原因：一段四十字的点评，用户读第一句就不读了，后面三十字白写；
 * 而四个字配一个图标，他扫一眼就知道这顿怎么样。
 */
export type VerdictIcon =
  | "salt"
  | "fat"
  | "carb"
  | "protein"
  | "clock"
  | "fire"
  | "alert"
  | "check"
  | "alcohol"
  | "sport";

export interface Verdict {
  tone: "good" | "warn" | "over";
  icon: VerdictIcon;
  /** 4–6 字，主判断 */
  short: string;
  /** 半句话，下一步该怎么办 */
  tip: string;
}

/**
 * 单点建议规则引擎。
 * 用途：1) AI 不可用时的兜底　2) 校验 AI 输出是否靠谱
 * 原则：一次只说一件事，按优先级取最高的一条。
 */
export function ruleVerdict(
  n: Nutrition,
  profile: Profile | null,
  plan: NutritionPlan,
  dayKcalBefore: number,
  mealType: MealType,
  eatenAt?: string | Date,
): Verdict {
  const diseases = profile?.diseases ?? [];
  const budget = plan.dailyBudgetKcal;
  const { next } = nextMeal(mealType);
  const slot = slotRange(mealType, budget);

  // 说"盐多"不说"咸"：一桌菜吃着正好、一碗汤下去钠就超了，
  // 味觉和钠量经常不同步，讲量才是这一行该讲的事

  // P0 —— 与疾病冲突
  if (diseases.includes("hypertension") && n.sodium > 800) {
    return { tone: "warn", icon: "salt", short: "盐有点多", tip: "下回少放半勺盐" };
  }
  if (diseases.includes("diabetes") && n.carb > 80) {
    return { tone: "warn", icon: "carb", short: "主食偏多", tip: `${next}少半碗饭` };
  }
  if (diseases.includes("fattyLiver")) {
    if (n.fat > 28) {
      return { tone: "warn", icon: "fat", short: "油有点大", tip: `${next}别再油炸` };
    }
    if (n.kcal > 300 && n.carb * 4 > n.kcal * 0.62) {
      return { tone: "warn", icon: "carb", short: "主食太多", tip: "多夹菜和肉" };
    }
  }
  if (diseases.includes("hyperlipidemia") && n.fat > 32) {
    return { tone: "warn", icon: "fat", short: "油超了", tip: `${next}多吃青菜` };
  }
  if (diseases.includes("gout") && n.protein > 35) {
    return { tone: "warn", icon: "protein", short: "肉有点多", tip: "这顿够了，别再添" };
  }

  // P0.5 —— 通用钠超标（不依赖是否有高血压）
  if (n.sodium > 1500) {
    return { tone: "warn", icon: "salt", short: "盐偏多", tip: "汤少喝点，盐少半勺" };
  }

  // P1 —— 这一顿的份量，对照的是它自己的标准，不是全天预算
  if (n.kcal > slot.high) {
    const tip =
      mealType === "dinner"
        ? "明天早饭粥配蛋"
        : mealType === "snack"
          ? "下次换水果或坚果"
          : `${next}清一点`;
    return { tone: "over", icon: "fire", short: "吃撑了", tip };
  }
  if (n.kcal > 0 && n.kcal < slot.low && mealType !== "snack") {
    const tip =
      mealType === "breakfast"
        ? "加个蛋或一杯豆浆"
        : mealType === "lunch"
          ? "加个蛋，别饿到晚上"
          : "真饿加个蛋或酸奶";
    return { tone: "warn", icon: "alert", short: "吃太少了", tip };
  }

  // P1.5 —— 单顿合适，但今天累计超了
  if (dayKcalBefore + n.kcal > budget) {
    const over = Math.round(dayKcalBefore + n.kcal - budget);
    return {
      tone: "over",
      icon: "alert",
      short: `今天超了 ${over}`,
      tip: `${next}挑淡的吃`,
    };
  }

  // P2 —— 吃得太晚。时间本身是健康信号：
  // 同样的饭，七点吃和九点吃，对血糖和睡眠是两件事。
  if (eatenAt) {
    const d = typeof eatenAt === "string" ? new Date(eatenAt) : eatenAt;
    if (!Number.isNaN(d.getTime())) {
      const mins = d.getHours() * 60 + d.getMinutes();

      /*
        以前这里是一套模板："早饭太晚 → 明天提前半小时"。
        可他下午两点才在记这顿，提前半小时就是 13:30 —— 还是下午。
        模板错在拿"现在的钟点"当基准，而不是拿"这顿饭该在什么时候吃"当基准。
        所以改成给范围：越界越多，说法越重，且每次都把合理区间说出来。
      */
      if (mealType === "breakfast") {
        if (mins >= 11 * 60) {
          return {
            tone: "warn",
            icon: "clock",
            short: "这算午饭了",
            tip: "早饭 7 点前后吃",
          };
        }
        if (mins >= 9 * 60 + 30) {
          return {
            tone: "warn",
            icon: "clock",
            short: "早饭偏晚",
            tip: "早饭 7–9 点吃更稳",
          };
        }
      }
      if (mealType === "lunch" && mins >= 14 * 60) {
        return {
          tone: "warn",
          icon: "clock",
          short: "午饭太晚",
          tip: "午饭 12 点前后吃",
        };
      }
      if (mealType === "dinner" && mins >= 20 * 60) {
        return {
          tone: "warn",
          icon: "clock",
          short: "吃太晚了",
          tip: "晚饭 7 点前吃完",
        };
      }
    }
  }

  // P2 —— 结构失衡。早饭的油阈值比其他顿低，早上吃太油一整天都腻
  if (mealType === "breakfast" && n.fat > 18) {
    return { tone: "warn", icon: "fat", short: "早上太油", tip: "明天换粥配蛋" };
  }
  if (n.protein < 12 && n.kcal > 250) {
    return { tone: "warn", icon: "protein", short: "肉蛋偏少", tip: "加个蛋或一块豆腐" };
  }
  if (n.fat > 30) {
    return { tone: "warn", icon: "fat", short: "偏油", tip: `${next}改蒸煮` };
  }

  // P3 —— 正向
  return { tone: "good", icon: "check", short: "这顿合适", tip: "照这个来" };
}

/**
 * 一句话版本，给不接受图标的地方用（存进记录里的旧字段、读屏软件）。
 * 不另外维护一套判断，避免两种口径打架。
 */
export function ruleComment(
  n: Nutrition,
  profile: Profile | null,
  plan: NutritionPlan,
  dayKcalBefore: number,
  mealType: MealType,
  eatenAt?: string | Date,
): string {
  const v = ruleVerdict(n, profile, plan, dayKcalBefore, mealType, eatenAt);
  return `${v.short}。${v.tip}`;
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
