import type { MealType, Nutrition, NutritionPlan, Profile } from "./types";

/**
 * 这顿之后还剩哪几顿。
 * 之前点评里写死了"晚上清淡点"，早餐吃完也说晚上，晚餐吃完还说晚上，所以必须按餐次算。
 */
function nextMeal(mealType: MealType): { next: string; rest: string } {
  switch (mealType) {
    case "breakfast":
      return { next: "午饭和晚饭", rest: "今天还剩午饭和晚饭" };
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

/** 这顿吃多了，按餐次给不同的后果和下一步 */
function tooMuch(mealType: MealType, kcal: number, next: string): string {
  switch (mealType) {
    case "breakfast":
      return `早饭就吃了 ${kcal} 大卡，比一般早饭多不少，一上午都腻着。${next}清淡点，一碗面或者半碗饭配菜就够。`;
    case "lunch":
      return `午饭 ${kcal} 大卡，吃得有点撑，下午容易犯困。晚饭清一点，别再上这么重的。`;
    case "dinner":
      return `晚饭 ${kcal} 大卡，躺下时还在消化，睡不踏实。明天早饭粥配蛋就行。`;
    default:
      return `这一顿加餐 ${kcal} 大卡，比一顿正餐还多了。下次换个水果或者一小把坚果。`;
  }
}

/** 这顿吃少了，按餐次说清代价 */
function tooLittle(mealType: MealType, kcal: number): string | null {
  switch (mealType) {
    case "breakfast":
      return `早饭才 ${kcal} 大卡，上午容易没劲。加个鸡蛋、一杯豆浆或者一个包子。`;
    case "lunch":
      return `午饭才 ${kcal} 大卡，下午还有大半天要撑，容易饿到晚上吃多。加个鸡蛋或者一小份肉。`;
    case "dinner":
      return `晚饭 ${kcal} 大卡，少是好事，但别饿到半夜找东西吃。真饿就加个鸡蛋或一小杯酸奶。`;
    default:
      // 加餐本来就该少，不提醒
      return null;
  }
}

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
  mealType: MealType,
): string {
  const diseases = profile?.diseases ?? [];
  const budget = plan.dailyBudgetKcal;
  const { next } = nextMeal(mealType);
  const slot = slotRange(mealType, budget);

  // P0 —— 与疾病冲突
  if (diseases.includes("hypertension") && n.sodium > 800) {
    return "这顿有点咸。您血压高，下回少放半勺盐。";
  }
  if (diseases.includes("diabetes") && n.carb > 80) {
    return `主食偏多了。${next}少半碗饭，多夹两口菜。`;
  }
  if (diseases.includes("fattyLiver")) {
    if (n.fat > 28) {
      return `这顿油有点大。脂肪肝怕这个，${next}别再油炸了。`;
    }
    if (n.kcal > 300 && n.carb * 4 > n.kcal * 0.62) {
      return "主食占得有点多。脂肪肝怕糖，多夹点菜和肉。";
    }
  }
  if (diseases.includes("hyperlipidemia") && n.fat > 32) {
    return `油的量超了。肥肉和油炸的少碰，${next}多夹点青菜。`;
  }
  if (diseases.includes("gout") && n.protein > 35) {
    return "肉有点多。痛风的人吃肉要控量，这顿够了。";
  }

  // P0.5 —— 通用钠超标（不依赖是否有高血压）
  if (n.sodium > 1500) {
    return "这顿偏咸了，下回盐少放半勺，汤也少喝点。";
  }

  // P1 —— 这一顿的份量，对照的是它自己的标准，不是全天预算
  if (n.kcal > slot.high) {
    return tooMuch(mealType, n.kcal, next);
  }
  const little = n.kcal > 0 && n.kcal < slot.low ? tooLittle(mealType, n.kcal) : null;
  if (little) return little;

  // P1.5 —— 单顿合适，但今天累计超了
  if (dayKcalBefore + n.kcal > budget) {
    const over = Math.round(dayKcalBefore + n.kcal - budget);
    return `这顿量是合适的，但今天加起来超了 ${over} 大卡。${next}挑清淡的吃。`;
  }

  // P2 —— 结构失衡。早饭的油阈值比其他顿低，早上吃太油一整天都腻
  if (mealType === "breakfast" && n.fat > 18) {
    return "早饭油有点大。早上吃太油，一上午都腻着，明天换成粥配蛋。";
  }
  if (n.protein < 12 && n.kcal > 250) {
    return "肉蛋有点少，加个鸡蛋或者一块豆腐，更扛饿。";
  }
  if (n.fat > 30) {
    return `这顿偏油了，下回少放点油，${next}炒菜改蒸煮。`;
  }

  // P3 —— 正向。把数字说出来，让人知道系统是按这顿的标准在算
  if (n.kcal > 0) {
    return `这顿 ${n.kcal} 大卡，量正好，照这个来。`;
  }
  return "这顿的量合适，照这个来。";
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
