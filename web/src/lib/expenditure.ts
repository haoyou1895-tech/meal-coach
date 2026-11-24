/**
 * 反推真实消耗 —— 这一版只显示，不参与额度计算。
 *
 * 算法只用两样东西：这些天吃了多少、体重怎么变的。
 * **不看运动**：运动的效果已经落在体重上了，再算一次就是重复计账（见 ADR-023）。
 *
 * 为什么是反推而不是公式：公式给的是「平均人」，误差 200–400 大卡；
 * 这个数是从他自己身上量出来的，误差能压到 150 以内，而且越用越准。
 */

export type EstimateStatus =
  | "ok"
  | "need_food"
  | "need_weight"
  | "clamped_high"
  | "clamped_low";

export interface DayIntake {
  /** yyyy-mm-dd */
  date: string;
  kcal: number;
  /** 这天记了几餐。只记一杯咖啡不算完整 */
  mealCount: number;
}

export interface DayWeight {
  date: string;
  weightKg: number;
}

export interface Estimate {
  /** 算出来的真实消耗。算不出来时是 null */
  kcal: number | null;
  /** 被上下限夹过没有 */
  clamped: "low" | "high" | null;
  status: EstimateStatus;
  /** 窗口天数 */
  windowDays: number;
  /** 饮食记录完整的天数 */
  foodDays: number;
  /** 体重点数（剔除异常后） */
  weightCount: number;
  /** 剔除掉的异常体重点 */
  outliers: number;
  /** 同期日均摄入 */
  avgIntake: number | null;
  /** 趋势线首尾 */
  trendStart: number | null;
  trendEnd: number | null;
  /** 日均缺口，正数是缺口 */
  dailyGap: number | null;
  /** 还差几天饮食记录 / 几次体重 */
  needFoodDays: number;
  needWeights: number;
  /** 公式给的值，用来对照 */
  formulaTdee: number;
}

export const WINDOW_DAYS = 14;
/** 14 天里至少要有 10 天记全了。少于这个，漏记的影响比信号大 */
export const MIN_FOOD_DAYS = 10;
/** 14 天里至少 6 次体重，配合趋势拟合才够 */
export const MIN_WEIGHTS = 6;
/** 一天之内体重不可能变化这么多，超过就是称错了 / 刚吃完饭 / 换了衣服 */
const OUTLIER_KG = 1.5;
/** 1 公斤脂肪大约这么多大卡 */
const KCAL_PER_KG = 7700;
/** 反推值允许落在公式值的这个区间里。防漏记把预算越算越低，也防超支被当成高代谢 */
const BAND_LOW = 0.85;
const BAND_HIGH = 1.3;

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

function linearFit(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!denom) return { slope: 0, intercept: n ? sy / n : 0 };
  const slope = (n * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * 用最小二乘拟合趋势线，剔一遍离群点再拟合。
 *
 * 为什么不是「今天的体重 − 14 天前的体重」：单日体重受水分、盐、肠道内容物影响，
 * 一天能差 1–2 公斤。拿两个单点相减，等于拿噪声当信号。
 * 拟合把所有点都用上，噪声自己会互相抵消。
 */
function fitTrend(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  let fit = linearFit(points);
  const kept = points.filter((p) => Math.abs(p.y - (fit.slope * p.x + fit.intercept)) <= OUTLIER_KG);
  const outliers = points.length - kept.length;
  if (outliers > 0 && kept.length >= 3) fit = linearFit(kept);
  return { fit, kept, outliers };
}

export function estimateExpenditure(
  days: DayIntake[],
  weights: DayWeight[],
  today: string,
  formulaTdee: number,
  opts: { windowDays?: number; minFoodDays?: number; minWeights?: number } = {},
): Estimate {
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const minFoodDays = opts.minFoodDays ?? MIN_FOOD_DAYS;
  const minWeights = opts.minWeights ?? MIN_WEIGHTS;
  const from = shiftDate(today, -(windowDays - 1));

  const base: Estimate = {
    kcal: null,
    clamped: null,
    status: "need_food",
    windowDays,
    foodDays: 0,
    weightCount: 0,
    outliers: 0,
    avgIntake: null,
    trendStart: null,
    trendEnd: null,
    dailyGap: null,
    needFoodDays: minFoodDays,
    needWeights: minWeights,
    formulaTdee: Math.round(formulaTdee),
  };

  /* ---------- 1. 吃的：只认「记全了」的天 ---------- */
  // 一天只记了一杯咖啡不算完整 —— 那种天放进来，等于默认他那天只吃了 200 大卡，
  // 反推出来的消耗会被压得很低，额度跟着降，然后他吃得更少更不记。
  const complete = days.filter(
    (d) => d.date >= from && d.date <= today && d.mealCount >= 2 && d.kcal > 0,
  );
  base.foodDays = complete.length;
  base.needFoodDays = Math.max(0, minFoodDays - complete.length);
  if (complete.length) {
    base.avgIntake = Math.round(
      complete.reduce((s, d) => s + d.kcal, 0) / complete.length,
    );
  }

  /* ---------- 2. 体重：拟合趋势，剔异常点 ---------- */
  const inWin = weights
    .filter((w) => w.date >= from && w.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const pts = inWin.map((w) => ({ x: dayDiff(from, w.date), y: w.weightKg }));
  const trend = fitTrend(pts);
  base.weightCount = trend ? trend.kept.length : inWin.length;
  base.outliers = trend ? trend.outliers : 0;
  base.needWeights = Math.max(0, minWeights - base.weightCount);
  if (trend && trend.kept.length >= Math.min(3, minWeights)) {
    base.trendStart = Math.round((trend.fit.intercept + trend.fit.slope * 0) * 10) / 10;
    base.trendEnd =
      Math.round((trend.fit.intercept + trend.fit.slope * (windowDays - 1)) * 10) / 10;
  }

  /* ---------- 3. 门槛 ---------- */
  if (base.weightCount < minWeights) {
    base.status = "need_weight";
    return base;
  }
  if (base.foodDays < minFoodDays) {
    base.status = "need_food";
    return base;
  }
  if (!trend || base.trendStart === null || base.trendEnd === null) {
    base.status = "need_weight";
    return base;
  }

  /* ---------- 4. 反推 ---------- */
  // 趋势线掉了 0.8 公斤 → 这 14 天总共少了 6160 大卡 → 摊到每天就是缺口。
  // 消耗 = 他吃的 + 缺口。这是能量守恒，不是估算。
  const droppedKg = base.trendStart - base.trendEnd;
  const dailyGap = (droppedKg * KCAL_PER_KG) / windowDays;
  base.dailyGap = Math.round(dailyGap);
  const raw = (base.avgIntake ?? 0) + dailyGap;

  /* ---------- 5. 上下限 ---------- */
  const low = formulaTdee * BAND_LOW;
  const high = formulaTdee * BAND_HIGH;
  let value = raw;
  if (raw > high) {
    value = high;
    base.clamped = "high";
    base.status = "clamped_high";
  } else if (raw < low) {
    value = low;
    base.clamped = "low";
    base.status = "clamped_low";
  } else {
    base.status = "ok";
  }
  base.kcal = Math.round(value);
  return base;
}

/** 状态 → 给他看的一句话。不解释算法，只说结论和下一步 */
export function statusText(e: Estimate): string {
  // 两个缺口一起说。只报一个的话，他补齐了那个还是算不出来，会以为系统坏了。
  const bits: string[] = [];
  if (e.needFoodDays > 0) bits.push(`再记 ${e.needFoodDays} 天三餐`);
  if (e.needWeights > 0) bits.push(`再称 ${e.needWeights} 次体重`);
  const missing = bits.length ? `${bits.join("、")}，就能算出你真实的消耗` : "";

  switch (e.status) {
    case "need_weight":
    case "need_food":
      return missing || "数据还不够";
    case "clamped_high":
      return "最近吃得比计划多，暂时算不准 —— 先按公式的值";
    case "clamped_low":
      return "记录可能不全，暂时算不准 —— 先按公式的值";
    case "ok":
      return "按你最近两周的体重变化算出来的";
  }
}
