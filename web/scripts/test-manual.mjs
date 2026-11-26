#!/usr/bin/env node
/**
 * manual.ts 的断言测试。
 *
 * 这个文件决定"问什么单位"。判错的后果不是崩，是问错话：
 * 问"吃了几碗饭"给一堆牛肉，他要么乱选一个，要么直接关掉。
 * 所以那些容易混的名字必须逐个钉死：炒饭 vs 饭、牛肉面 vs 牛肉、面包 vs 面。
 *
 * 跑法：node scripts/test-manual.mjs
 */
import assert from "node:assert/strict";
import {
  classify,
  presetToPortion,
  amountInText,
  stripAmount,
  DEFAULT_CLASS,
} from "../src/lib/manual.ts";

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

console.log("classify —— 该问什么单位");

const cases = [
  // [输入, 期望类别, 为什么这个容易错]
  ["牛肉火锅", "meat", "火锅和牛肉都是 2 字，不能掉进默认类"],
  ["牛肉", "meat", ""],
  ["一斤牛肉", "meat", ""],
  ["肥牛", "meat", ""],
  ["白米饭", "rice", ""],
  ["饭", "rice", ""],
  ["炒饭", "rice", "『炒』是做法词，别被 dish 抢走"],
  ["蛋炒饭", "rice", ""],
  ["牛肉面", "noodle", "『牛肉』2 字输给『牛肉面』3 字，正确"],
  ["米线", "noodle", ""],
  ["面", "noodle", ""],
  ["面包", "staple", "『面包』是主食不是面条 —— 这条最容易错"],
  ["馒头", "staple", ""],
  ["鸡蛋", "egg", ""],
  ["煮蛋", "egg", ""],
  ["紫菜蛋汤", "soup", "『蛋汤』是汤不是蛋"],
  ["小米粥", "soup", ""],
  ["苹果", "fruit", ""],
  ["西瓜", "fruit", ""],
  ["可乐", "drink", ""],
  ["一瓶啤酒", "drink", ""],
  ["羊肉串", "skewer", "『羊肉』2 字 vs『羊肉串』3 字 + 『串』1 字"],
  ["烤串", "skewer", ""],
  ["炒青菜", "dish", ""],
  ["红烧肉", "dish", "『红烧』2 字和『肉』不冲突 —— meat 类没有单独的『肉』这个键"],
  ["不知道", "other", "没命中就必须给兜底，不能返回空"],
  ["", "other", ""],
];

for (const [input, want, note] of cases) {
  t(`「${input || "(空)"}」→ ${want}${note ? `　（${note}）` : ""}`, () => {
    assert.equal(classify(input).id, want);
  });
}

console.log("\nclassify —— 档位必须可用");

t("每一类都有 3 档以上", () => {
  const samples = ["牛肉", "米饭", "面", "汤", "苹果", "可乐", "串", "鸡蛋", "包子", "炒菜"];
  for (const s of samples) {
    const c = classify(s);
    assert.ok(c.presets.length >= 3, `${s} 只有 ${c.presets.length} 档`);
  }
});

t("每一档都有 label 和正数 amount", () => {
  const samples = ["牛肉", "米饭", "可乐", "不知道"];
  for (const s of samples) {
    for (const p of classify(s).presets) {
      assert.ok(p.label.length > 0, `${s} 有档位没标签`);
      assert.ok(p.amount > 0, `${s} 的「${p.label}」含量为 0`);
    }
  }
});

t("档位从小到大排，且不重复", () => {
  const samples = ["牛肉", "米饭", "汤", "串", "可乐"];
  for (const s of samples) {
    const amounts = classify(s).presets.map((p) => p.amount);
    const sorted = [...amounts].sort((a, b) => a - b);
    assert.deepEqual(amounts, sorted, `${s} 的档位没按大小排`);
    assert.equal(new Set(amounts).size, amounts.length, `${s} 有重复档位`);
  }
});

t("牛肉按斤给档，不是按克", () => {
  const labels = classify("牛肉火锅").presets.map((p) => p.label);
  assert.ok(labels.includes("一斤"), `实际是 ${labels.join("/")}`);
  assert.ok(labels.includes("半斤"));
});

t("饮品用毫升不是克", () => {
  const p = classify("可乐").presets[0];
  assert.equal(p.unit, "毫升");
});

console.log("\npresetToPortion");

t("单位说明里同时有人话和克数", () => {
  const s = presetToPortion({ label: "一斤", amount: 500, unit: "克" });
  assert.equal(s, "一斤（约 500 克）");
});

t("毫升也照写", () => {
  const s = presetToPortion({ label: "一瓶", amount: 500, unit: "毫升" });
  assert.equal(s, "一瓶（约 500 毫升）");
});

console.log("\namountInText —— 他自己说了量就别再问");

t("「一斤牛肉」认出一斤 = 500 克", () => {
  const p = amountInText("一斤牛肉");
  assert.ok(p, "没认出来");
  assert.equal(p.amount, 500);
});

t("「半斤」= 250 克", () => {
  assert.equal(amountInText("半斤牛肉")?.amount, 250);
});

t("「两斤」= 1000 克，不是 2 两", () => {
  assert.equal(amountInText("两斤牛肉")?.amount, 1000);
});

t("「二两」= 100 克", () => {
  assert.equal(amountInText("二两白酒")?.amount, 100);
});

t("「3斤」阿拉伯数字也认", () => {
  assert.equal(amountInText("3斤排骨")?.amount, 1500);
});

t("「十斤」认得出", () => {
  assert.equal(amountInText("十斤西瓜")?.amount, 5000);
});

t("没写量的返回 null（该问就问）", () => {
  assert.equal(amountInText("牛肉"), null);
  assert.equal(amountInText("一碗米饭"), null);
});

console.log("\nstripAmount —— 名字和量分开");

t("「一斤牛肉」剥成「牛肉」", () => {
  assert.equal(stripAmount("一斤牛肉"), "牛肉");
});
t("「半斤牛肉」剥成「牛肉」", () => {
  assert.equal(stripAmount("半斤牛肉"), "牛肉");
});
t("「牛肉火锅」不动 —— 本来就没量", () => {
  assert.equal(stripAmount("牛肉火锅"), "牛肉火锅");
});
t("「二两白酒」剥成「白酒」", () => {
  assert.equal(stripAmount("二两白酒"), "白酒");
});
t("只说「一斤」时不许剥成空", () => {
  assert.equal(stripAmount("一斤"), "一斤");
});
t("剥完的名字不为空", () => {
  for (const s of ["一斤牛肉", "半斤", "两斤", "一碗米饭"]) {
    assert.ok(stripAmount(s).length > 0, `${s} 剥成了空`);
  }
});

console.log("\n默认类");

t("默认类也有档位，不能空", () => {
  assert.ok(DEFAULT_CLASS.presets.length >= 3);
  assert.ok(DEFAULT_CLASS.prompt.length > 0);
});

console.log(`\n${pass} 项通过${process.exitCode ? "，有失败" : ""}`);
