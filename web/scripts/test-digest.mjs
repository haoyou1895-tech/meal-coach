#!/usr/bin/env node
/**
 * digest.ts 的断言测试。
 *
 * 这个文件唯一的活儿是"从记录里数出天数"—— 数错了，我拿着错数字判断留存，
 * 后面所有结论都是错的。所以边界必须逐个钉住：
 * 空数据、同一天多顿、中间断档、首尾跨度不等于记录天数。
 *
 * 跑法：node scripts/test-digest.mjs
 */
import assert from "node:assert/strict";
import { buildDigest, digestCode, digestSummary } from "../src/lib/digest.ts";

let pass = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

const meal = (date) => ({ date });
const day = (n) => `2026-11-${String(n).padStart(2, "0")}`;
const empty = { meals: [], weights: [], exercises: [], closedDays: [] };

console.log("buildDigest");

t("没有记录返回 null，不是一串 0", () => {
  assert.equal(buildDigest(empty, day(24)), null);
});

t("连续 9 天：bestRun=9，gaps=0", () => {
  const meals = Array.from({ length: 9 }, (_, i) => meal(day(16 + i)));
  const d = buildDigest({ ...empty, meals }, day(24));
  assert.equal(d.days, 9);
  assert.equal(d.bestRun, 9);
  assert.equal(d.gaps, 0);
  assert.equal(d.meals, 9);
});

t("同一天记三顿只算一天", () => {
  const meals = [meal(day(1)), meal(day(1)), meal(day(1))];
  const d = buildDigest({ ...empty, meals }, day(24));
  assert.equal(d.days, 1);
  assert.equal(d.meals, 3);
  assert.equal(d.perDay, 3);
});

t("断 3 天算一次断档，最优连续重新起算", () => {
  // 1,2,3 断 4,5,6 记 7,8
  const meals = [1, 2, 3, 7, 8].map((n) => meal(day(n)));
  const d = buildDigest({ ...empty, meals }, day(24));
  assert.equal(d.days, 5);
  assert.equal(d.bestRun, 3);
  assert.equal(d.gaps, 1);
});

t("断两次：gaps=2", () => {
  const meals = [1, 3, 5].map((n) => meal(day(n)));
  const d = buildDigest({ ...empty, meals }, day(24));
  assert.equal(d.days, 3);
  assert.equal(d.bestRun, 1);
  assert.equal(d.gaps, 2);
});

t("首尾差 9 天但只记了 3 天：days 是 3，不是 9", () => {
  const meals = [day(1), day(5), day(10)].map(meal);
  const d = buildDigest({ ...empty, meals }, day(24));
  assert.equal(d.days, 3);
});

t("sinceLast 按今天算，今天记过是 0", () => {
  const d1 = buildDigest({ ...empty, meals: [meal(day(24))] }, day(24));
  assert.equal(d1.sinceLast, 0);
  const d2 = buildDigest({ ...empty, meals: [meal(day(20))] }, day(24));
  assert.equal(d2.sinceLast, 4);
});

t("最后记录在未来（手机时间乱）不倒算成负数", () => {
  const d = buildDigest({ ...empty, meals: [meal(day(28))] }, day(24));
  assert.equal(d.sinceLast, 0);
});

t("运动和收工分开数，分钟累加", () => {
  const d = buildDigest(
    {
      ...empty,
      meals: [meal(day(20))],
      exercises: [
        { date: day(20), minutes: 30 },
        { date: day(20), minutes: 25 },
        { date: day(21), minutes: 40 },
      ],
      closedDays: [{ date: day(20) }, { date: day(20) }],
    },
    day(24),
  );
  assert.equal(d.exercises, 3);
  assert.equal(d.exerciseMinutes, 95);
  assert.equal(d.closedDays, 1, "同一天收工两次还是 1 天");
});

t("体重记 5 次 → weights=5", () => {
  const d = buildDigest(
    {
      ...empty,
      meals: [meal(day(20))],
      weights: [16, 17, 18, 19, 20].map((n) => ({ date: day(n) })),
    },
    day(24),
  );
  assert.equal(d.weights, 5);
});

t("日期格式坏了不炸，跳过它", () => {
  const d = buildDigest(
    { ...empty, meals: [meal(day(20)), meal("2026/11/21"), meal("")] },
    day(24),
  );
  assert.equal(d.days, 1);
});

console.log("\ndigestCode / digestSummary");

t("一年的记录，码也在 200 字以内", () => {
  // 模拟 365 天、每天 3 顿，看码长会不会随数据量涨
  const meals = [];
  for (let i = 0; i < 365; i++) {
    const date = new Date(Date.UTC(2025, 10, 25 + i)).toISOString().slice(0, 10);
    for (let m = 0; m < 3; m++) meals.push({ date });
  }
  const d = buildDigest({ ...empty, meals }, "2026-11-24");
  const code = digestCode(d);
  assert.ok(code.length < 200, `码长 ${code.length}，超过 200 就不好复制了`);
  console.log(`    （365 天 1095 顿 → ${code.length} 个字）`);
});

t("码能 JSON.parse 回来，且不含吃了什么", () => {
  const d = buildDigest({ ...empty, meals: [meal(day(20))] }, day(24));
  const back = JSON.parse(digestCode(d));
  assert.equal(back.days, 1);
  assert.equal(back.v, 1);
  // 只允许这些键 —— 多一个都可能是隐私漏进来的口子
  const allowed = new Set([
    "v", "f", "l", "days", "meals", "best", "gaps",
    "since", "w", "ex", "exm", "close", "per",
  ]);
  for (const k of Object.keys(back)) assert.ok(allowed.has(k), `多出字段 ${k}`);
});

t("摘要说人话，且不出现体重数字", () => {
  const d = buildDigest({ ...empty, meals: [meal(day(20))] }, day(24));
  const s = digestSummary(d);
  assert.ok(s.includes("记了 1 天"));
  assert.ok(!/\d+\.\d+/.test(s), `摘要里不该有小数（体重）：${s}`);
  console.log(`    （${s}）`);
});

console.log(`\n${pass} 项通过${process.exitCode ? "，有失败" : ""}`);
