/**
 * 造一份「已经用了十来天」的数据，把账页截出来看看长什么样。
 *
 * 为什么要这个脚本：反推真实消耗要 10 天三餐 + 6 次体重才会出数，
 * 空账本上永远只看到"再记 9 天三餐"。想看一眼真样子，只能先造数据。
 *
 * 用法：node scripts/demo-ledger.mjs（先 npm run dev）
 *       BASE_URL=https://canmou.net.cn node scripts/demo-ledger.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ym = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ym(d);
};

const PROFILE = {
  gender: "male",
  age: 46,
  heightCm: 172,
  weightKg: 73.4,
  targetWeightKg: 68,
  diseases: ["hypertension"],
  taste: "salty",
  mealRegular: "irregular",
  createdAt: new Date().toISOString(),
};

/** 一天三顿，总量在 1450–1600 之间浮动 —— 真实的人不会每天一样 */
function dayMeals(offset) {
  const date = daysAgo(offset);
  const base = [420, 620, 520];
  const jitter = ((offset * 37) % 90) - 45;
  const kcal = base.map((k, i) => k + Math.round((i === 1 ? jitter : jitter / 2)));
  const names = [
    ["豆浆", "鸡蛋", "包子"],
    ["米饭", "红烧肉", "青菜"],
    ["面条", "番茄鸡蛋"],
  ];
  const types = ["breakfast", "lunch", "dinner"];
  const hours = ["08", "12", "19"];
  return types.map((t, i) => ({
    id: `d${offset}-${t}`,
    date,
    mealType: t,
    items: names[i].map((n, j) => ({
      name: n,
      portion: "一份",
      kcal: Math.round(kcal[i] / names[i].length) + (j === 0 ? 20 : 0),
    })),
    nutrition: {
      kcal: kcal[i],
      protein: Math.round(kcal[i] * 0.05),
      carb: Math.round(kcal[i] * 0.12),
      fat: Math.round(kcal[i] * 0.04),
      sodium: 700,
    },
    comment: "",
    adjusted: false,
    confidence: 0.92,
    createdAt: `${date}T${hours[i]}:05:00.000Z`,
  }));
}

const meals = [];
for (let i = 11; i >= 1; i--) meals.push(...dayMeals(i));
meals.push(...dayMeals(0));

/** 体重：10 天掉 0.9 公斤，一天一条，早上称 */
const weights = [
  { date: daysAgo(11), weightKg: 73.4 },
  { date: daysAgo(9), weightKg: 73.2 },
  { date: daysAgo(7), weightKg: 73.1 },
  { date: daysAgo(5), weightKg: 72.9 },
  { date: daysAgo(3), weightKg: 72.7 },
  { date: daysAgo(1), weightKg: 72.5 },
];

const exercises = [
  { id: "e1", date: daysAgo(5), kind: "walk", minutes: 40, amount: 3.7 },
  { id: "e2", date: daysAgo(3), kind: "bike", minutes: 45, amount: 11.8 },
  { id: "e3", date: daysAgo(1), kind: "rope", minutes: 10, amount: 1000 },
];

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

await page.evaluateOnNewDocument(
  (state) => localStorage.setItem("mealcoach.v1", JSON.stringify(state)),
  {
    profile: PROFILE,
    meals,
    weights,
    activities: [],
    exercises,
    closedDays: [],
    exercisePlans: [],
    onboarded: true,
  },
);

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(1500);

/* 切到「账」 */
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => b.innerText.trim().replace(/\s/g, "") === "账")
    ?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("实际消耗"), {
  timeout: 8000,
});
await sleep(700);

await page.screenshot({
  path: path.join(OUT, "ledger-01-top.png"),
});

await page.evaluate(() => {
  [...document.querySelectorAll("p")]
    .find((x) => x.innerText.trim() === "实际消耗")
    ?.scrollIntoView({ block: "center" });
});
await sleep(500);
await page.screenshot({
  path: path.join(OUT, "ledger-02-expenditure.png"),
});

const text = await page.evaluate(() => document.body.innerText);
console.log("—— 账页上的字 ——");
console.log(text);

await browser.close();
