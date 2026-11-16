#!/usr/bin/env node
/**
 * 稳定性测试
 *
 * 目的：验证「同一张照片，模型两次给的结果是否一致」。
 * 这比「准不准」更关键 —— 如果同一盘菜两次差 200 大卡，
 * 用户会觉得这个数字完全不可信，功能就废了。
 *
 * 用法：node scripts/stability.mjs [--rounds 2] [--note]
 */

import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("..", "测试食物图片");
const API = "http://localhost:3000/api/recognize";
const ROUNDS = Number(
  process.argv.includes("--rounds")
    ? process.argv[process.argv.indexOf("--rounds") + 1]
    : 2,
);
const WITH_NOTE = process.argv.includes("--note");

// 人工标准答案（我自己看图记的），用来判断"菜名对不对"
const TRUTH = {
  "069d73b2a7f607c52ac6554cc27f4aed.jpg":
    "米饭（大份）+ 花菜炒肉片 + 青菜炒蛋/肉 + 红烧鱼（整条）",
  "1e9ea76f1928b125f66774f87913e65f.jpg":
    "米饭 + 土豆烧牛肉（酱汁多）+ 青椒",
  "7a60287bad515e69a2c6d4406b9e5ca1.jpg":
    "米饭 + 包菜炒火腿肠 + 花菜 + 白切鸡/鸭（带骨）",
  "cc179acbb7b853973f7888e3f83f0b69.jpg":
    "米饭 + 豆角炒肉丝 + 鸡蛋炒黄瓜 + 卤味（少量）",
  "e5cc4af311a24dcb81062ffbca3f0731.jpg":
    "米饭 + 番茄炒蛋 + 卤豆干/酱干 + 香肠",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recognize(filePath, note) {
  const b64 = fs.readFileSync(filePath).toString("base64");
  const body = { image: `data:image/jpeg;base64,${b64}` };
  if (note) body.note = note;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 429) {
      process.stdout.write(`  （触发限流，等 25 秒）\n`);
      await sleep(25_000);
      continue;
    }
    return data;
  }
  throw new Error("连续被限流");
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .sort();

console.log(`共 ${files.length} 张图，每张跑 ${ROUNDS} 遍\n`);

const rows = [];

for (const f of files) {
  const full = path.join(DIR, f);
  const label = TRUTH[f] ? TRUTH[f].slice(0, 22) : "（无标准答案）";
  console.log(`■ ${f.slice(0, 8)}…  ${label}`);

  const results = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = Date.now();
    try {
      const d = await recognize(full, WITH_NOTE ? TRUTH[f] : "");
      const dishes = (d.items || []).map((it) => it.name).join(" / ");
      results.push({
        kcal: d.nutrition?.kcal ?? 0,
        dishes,
        conf: d.confidence ?? 0,
        ms: Date.now() - t0,
        err: d.error || "",
      });
      console.log(
        `  第${r + 1}次: ${String(d.nutrition?.kcal ?? 0).padStart(4)} 大卡 | 置信 ${(d.confidence ?? 0).toFixed(2)} | ${dishes}${d.error ? " | ⚠ " + d.error : ""}`,
      );
    } catch (e) {
      console.log(`  第${r + 1}次: 失败 ${e.message}`);
      results.push({ kcal: 0, dishes: "", conf: 0, ms: 0, err: e.message });
    }
    await sleep(1200);
  }

  const kcals = results.map((r) => r.kcal).filter((k) => k > 0);
  const delta = kcals.length > 1 ? Math.max(...kcals) - Math.min(...kcals) : 0;
  const dishSets = new Set(results.map((r) => r.dishes));
  const sameDish = dishSets.size === 1;
  console.log(
    `  → 热量极差 ${delta} 大卡${kcals.length ? `（${Math.round((delta / Math.max(...kcals)) * 100)}%）` : ""}，菜名${sameDish ? "一致" : `不一致（${dishSets.size} 种说法）`}\n`,
  );
  rows.push({ file: f, label, results, delta, sameDish, avg: Math.round(kcals.reduce((a, b) => a + b, 0) / (kcals.length || 1)) });
}

// 汇总
console.log("=".repeat(64));
console.log("汇总");
console.log("=".repeat(64));

const avgDelta =
  rows.reduce((a, r) => a + r.delta, 0) / (rows.length || 1);
const consistent = rows.filter((r) => r.sameDish).length;
const within50 = rows.filter((r) => r.delta <= 50).length;
const within100 = rows.filter((r) => r.delta <= 100).length;

console.log(`菜名完全一致：${consistent}/${rows.length}`);
console.log(`热量极差 ≤50 大卡：${within50}/${rows.length}`);
console.log(`热量极差 ≤100 大卡：${within100}/${rows.length}`);
console.log(`平均极差：${Math.round(avgDelta)} 大卡`);

const out = path.resolve(".shots", `stability${WITH_NOTE ? "-note" : ""}.json`);
fs.writeFileSync(out, JSON.stringify(rows, null, 2));
console.log(`\n明细已存：${out}`);
