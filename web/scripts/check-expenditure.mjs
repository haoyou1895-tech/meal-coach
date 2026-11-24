/**
 * 反推算法的场景验证 —— 不用等 14 天，造数据当场跑。
 *
 *   node scripts/check-expenditure.mjs
 *
 * 每组场景都写明「预期」，跑完自己看符号对不对。
 * 这里跑的是 src/lib/expenditure.ts 里那份真代码，不是抄的副本。
 */
import { estimateExpenditure, statusText } from "../src/lib/expenditure.ts";

const TODAY = "2026-11-24";
const DAYS = 14;
/** 78 公斤 / 172 厘米 / 46 岁 / 男 → 基础代谢 1630，NEAT 1.2 → 1956 */
const FORMULA_TDEE = 1956;

function shift(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * 造一组 14 天的数据。
 * foodDays：最后这几天有饮食记录（模拟"只记了几天"）
 * weightDays：最后这几天称了体重
 */
function gen({
  kcal,
  mealCount = 3,
  w0,
  w1 = w0,
  foodDays = DAYS,
  weightDays = DAYS,
  anomalyAt = -1,
  anomalyKg = 0,
}) {
  const days = [];
  const weights = [];
  for (let i = 0; i < DAYS; i++) {
    const date = shift(TODAY, -(DAYS - 1 - i));
    if (i >= DAYS - foodDays) {
      days.push({ date, kcal, mealCount });
    }
    if (i >= DAYS - weightDays) {
      let w = w0 + ((w1 - w0) * i) / (DAYS - 1);
      if (i === anomalyAt) w += anomalyKg;
      weights.push({ date, weightKg: Math.round(w * 10) / 10 });
    }
  }
  return { days, weights };
}

const scenarios = [
  {
    name: "① 正常减重（两周掉 0.8 公斤）",
    data: gen({ kcal: 1750, w0: 78.4, w1: 77.6 }),
    expect: "≈ 2190（1750 + 440）",
  },
  {
    name: "② 吃的和额度一样，体重没动",
    data: gen({ kcal: 1750, w0: 78.0, w1: 78.0 }),
    expect: "≈ 1750（消耗就等于他吃的）",
  },
  {
    name: "③ 只记了 5 天（漏记严重）",
    data: gen({ kcal: 1750, w0: 78.4, w1: 77.6, foodDays: 5 }),
    expect: "不算，提示再记 5 天",
  },
  {
    name: "④ 体重乱称（第 7 天记成 +3 公斤）",
    data: gen({ kcal: 1750, w0: 78.4, w1: 77.6, anomalyAt: 6, anomalyKg: 3 }),
    expect: "剔掉那个点，仍 ≈ 2190",
  },
  {
    name: "⑤ 天天吃 2800，体重不动（疑似漏记）",
    data: gen({ kcal: 2800, w0: 78.0, w1: 78.0 }),
    expect: "撞上限 2543，提示记录不完整",
  },
  {
    name: "⑥ 吃 2000，体重涨了 0.5 公斤",
    data: gen({ kcal: 2000, w0: 78.0, w1: 78.5 }),
    expect: "≈ 1725（2000 − 275）",
  },
  {
    name: "⑦ 只称了 4 次体重",
    data: gen({ kcal: 1750, w0: 78.4, w1: 77.6, weightDays: 4 }),
    expect: "不算，提示再称 2 次",
  },
];

const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length));

console.log(`\n公式给的消耗 ${FORMULA_TDEE} 大卡 · 允许区间 ${Math.round(FORMULA_TDEE * 0.85)} – ${Math.round(FORMULA_TDEE * 1.3)}\n`);
console.log(pad("场景", 34) + pad("消耗", 8) + pad("摄入", 8) + pad("日均缺口", 10) + pad("剔除", 6) + "状态");
console.log("-".repeat(96));

for (const s of scenarios) {
  const e = estimateExpenditure(s.data.days, s.data.weights, TODAY, FORMULA_TDEE);
  console.log(
    pad(s.name, 34) +
      pad(e.kcal ?? "—", 8) +
      pad(e.avgIntake ?? "—", 8) +
      pad(e.dailyGap ?? "—", 10) +
      pad(e.outliers || "0", 6) +
      e.status,
  );
  console.log(pad("", 34) + "预期: " + s.expect);
  console.log(pad("", 34) + "界面: " + statusText(e) + "\n");
}
