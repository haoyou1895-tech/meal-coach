/**
 * 验证两件事：
 * 1) 年龄输入 12 岁，会不会被夹到 18 并给出提示（以前是悄悄夹、不吭声）
 * 2) 历史记录里能不能看到每顿是几点吃的
 * 用法：node scripts/verify-time.mjs（需先 npm run dev）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
});

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [page error]", e.message));

/* ---------- 1. 年龄超范围 ---------- */
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
await sleep(2600); // 等开屏 1.4s 动画走完

for (let i = 0; i < 10; i++) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.innerText.trim() === "下一步",
    );
    if (btn) btn.click();
    return !!btn;
  });
  if (clicked) break;
  await sleep(500);
}
await sleep(700);

const onAgeStep = await page.evaluate(() =>
  document.body.innerText.includes("基础代谢跟年龄有关"),
);
console.log("① 进入年龄题:", onAgeStep ? "是" : "否");

if (onAgeStep) {
  // 点数字进入编辑态
  await page.evaluate(() => {
    const b = document.querySelector('[aria-label="点这里可以直接输入"]');
    if (b) b.click();
  });
  await sleep(300);

  // React 受控 input 必须用原生 setter 改值，再触发 input 和 blur
  const typed = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="直接输入数字"]');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, "12");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    return true;
  });
  await sleep(600);

  const after = await page.evaluate(() => document.body.innerText);
  const hasHint = after.includes("18 岁以下请找医生");
  const shows18 = /\b18\b/.test(after);
  console.log("① 输入框可写:", typed ? "是" : "否");
  console.log("① 出现提示语:", hasHint ? "是" : "否");
  console.log("① 数字夹到 18:", shows18 ? "是" : "否");
  console.log(
    "① 当前页面文字:",
    after.slice(0, 160).replace(/\n+/g, " | "),
  );

  await page.screenshot({ path: path.join(OUT, "age-limit.png") });
  console.log("✓ age-limit.png");
}

/* ---------- 2. 历史记录显示吃饭时间 ---------- */
await page.evaluate(() => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const at = (h, m) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();

  const state = {
    profile: {
      gender: "male",
      age: 42,
      heightCm: 175,
      weightKg: 78.5,
      targetWeightKg: 70,
      diseases: ["fattyLiver"],
      taste: "salty",
      mealRegular: "sometimes",
      createdAt: at(8, 0),
    },
    meals: [
      {
        id: "m1",
        date: dateStr,
        mealType: "breakfast",
        items: [{ name: "小米粥、咸菜、半个馒头", portion: "一份", kcal: 210 }],
        nutrition: { kcal: 210, protein: 5, carb: 40, fat: 2, sodium: 900 },
        comment: "",
        adjusted: false,
        confidence: 0.8,
        createdAt: at(7, 10),
        eatenAt: at(7, 10),
      },
      {
        id: "m2",
        date: dateStr,
        mealType: "lunch",
        items: [
          { name: "米饭、番茄炒蛋、清炒油麦菜", portion: "一份", kcal: 620 },
        ],
        nutrition: { kcal: 620, protein: 22, carb: 78, fat: 24, sodium: 1100 },
        comment: "",
        adjusted: false,
        confidence: 0.85,
        createdAt: at(12, 40),
        eatenAt: at(12, 40),
      },
    ],
    activities: [],
    onboarded: true,
    weights: [],
  };
  localStorage.setItem("mealcoach.v1", JSON.stringify(state));
});
await page.reload({ waitUntil: "networkidle0" });

let entered = false;
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.innerText.trim() === "记录",
    );
    if (btn) btn.click();
  });
  await sleep(700);
  entered = await page.evaluate(() =>
    document.body.innerText.includes("当前体重"),
  );
  if (entered) break;
}
await sleep(800);

if (entered) {
  const txt = await page.evaluate(() => document.body.innerText);
  console.log("② 看到 7:10 :", txt.includes("7:10") ? "是" : "否");
  console.log("② 看到 12:40:", txt.includes("12:40") ? "是" : "否");
  await page.screenshot({
    path: path.join(OUT, "record-time.png"),
    fullPage: true,
  });
  console.log("✓ record-time.png");
} else {
  console.log("② 没进记录页");
}

await browser.close();
