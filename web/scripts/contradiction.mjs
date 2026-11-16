#!/usr/bin/env node
/**
 * 对照实验：描述与照片矛盾时，模型听谁的？
 *
 * 这决定了"文字描述"这个功能到底是「补漏」还是「劫持」。
 */
import fs from "node:fs";
import path from "node:path";

const IMG = path.resolve(
  "..",
  "测试食物图片",
  "1e9ea76f1928b125f66774f87913e65f.jpg",
);
const b64 = fs.readFileSync(IMG).toString("base64");
const image = `data:image/jpeg;base64,${b64}`;
const API = "http://localhost:3000/api/recognize";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(note) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { image, note } : { image }),
    });
    const d = await res.json();
    if (res.status === 429) {
      process.stdout.write("  （限流，等 30 秒）\n");
      await sleep(30_000);
      continue;
    }
    return {
      kcal: d.nutrition?.kcal ?? 0,
      dishes: (d.items || []).map((i) => i.name),
      conf: d.confidence,
      err: d.error,
    };
  }
  return { kcal: 0, dishes: [], conf: 0, err: "连续被限流" };
}

const cases = [
  ["① 不填描述（基准：620 大卡）", ""],
  ["② 冲突：一碗白粥，一小碟咸菜（照片里没有）", "一碗白粥，一小碟咸菜"],
  ["③ 部分冲突：一碗白粥，一份土豆烧牛肉", "一碗白粥，一份土豆烧牛肉"],
  ["④ 夸张：三碗米饭，一大盘土豆烧牛肉", "三碗米饭，一大盘土豆烧牛肉"],
  ["⑤ 纯补充：还有一碗番茄蛋汤，一瓶可乐", "还有一碗番茄蛋汤，一瓶可乐"],
  ["⑥ 纯补充：另外吃了一根香蕉", "另外吃了一根香蕉"],
];

for (const [label, note] of cases) {
  const r = await ask(note);
  console.log(`\n${label}`);
  console.log(`  ${r.kcal} 大卡 | ${r.dishes.join(" / ")} | 置信 ${r.conf}`);
  if (r.err) console.log(`  ⚠ ${r.err}`);
  await sleep(2000);
}
