/**
 * 第十轮：反推真实消耗（只显示不生效）。
 *
 * 用法：node scripts/round10-expenditure.mjs
 *
 * 播两组数据看两种状态：够 14 天算得出、只有 3 天算不出。
 * 顺便把卡片上的文字打出来核对。
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".shots";
const KEY = "mealcoach.v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dates = [];
for (let i = 13; i >= 0; i--) dates.push(ymd(new Date(Date.now() - i * 864e5)));
const today = dates[dates.length - 1];

const meal = (id, date, type, kcal, hour) => ({
  id,
  date,
  mealType: type,
  items: [{ name: "测试菜", portion: "一份", kcal }],
  nutrition: { kcal, protein: 25, carb: 60, fat: 25, sodium: 900 },
  comment: "",
  adjusted: false,
  confidence: 0.9,
  createdAt: `${date}T${pad(hour)}:00:00.000Z`,
  eatenAt: `${date}T${pad(hour)}:00:00.000Z`,
});

const profile = {
  gender: "male",
  age: 46,
  heightCm: 172,
  weightKg: 78.4,
  targetWeightKg: 68,
  diseases: ["hypertension"],
  taste: "salty",
  mealRegular: "irregular",
  createdAt: new Date().toISOString(),
};

/** 14 天，每天三餐共 1750（500+650+600） */
function fullSeed() {
  const meals = [];
  dates.forEach((d, i) => {
    meals.push(meal(`b${i}`, d, "breakfast", 500, 8));
    meals.push(meal(`l${i}`, d, "lunch", 650, 12));
    meals.push(meal(`d${i}`, d, "dinner", 600, 19));
  });
  // 体重 78.4 → 77.6，两周线性掉 0.8
  const weights = dates.map((d, i) => ({
    date: d,
    weightKg: Math.round((78.4 + ((77.6 - 78.4) * i) / 13) * 10) / 10,
  }));
  return {
    profile,
    meals,
    weights,
    activities: [],
    exercises: [],
    closedDays: [],
    exercisePlans: [],
    onboarded: true,
  };
}

/** 只有最近 3 天有记录 */
function shortSeed() {
  const last3 = dates.slice(-3);
  const meals = [];
  last3.forEach((d, i) => {
    meals.push(meal(`b${i}`, d, "breakfast", 500, 8));
    meals.push(meal(`l${i}`, d, "lunch", 650, 12));
    meals.push(meal(`d${i}`, d, "dinner", 600, 19));
  });
  return {
    profile,
    meals,
    weights: last3.map((d, i) => ({ date: d, weightKg: 78 - i * 0.1 })),
    activities: [],
    exercises: [],
    closedDays: [],
    exercisePlans: [],
    onboarded: true,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

const seed = async (state) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((k, s) => localStorage.setItem(k, JSON.stringify(s)), KEY, state);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(2200);
};

const toLedger = async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")].find(
      (x) => x.innerText.trim() === "账",
    );
    b?.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("p")].find(
      (p) => p.innerText.trim() === "实际消耗",
    );
    el?.scrollIntoView({ block: "center" });
  });
  await sleep(500);
};

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  截图", name);
};

/** 取「实际消耗」卡整块文字 */
const cardText = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("p")].find(
      (p) => p.innerText.trim() === "实际消耗",
    );
    return el ? el.closest("div.card")?.innerText.replace(/\n+/g, " | ") : "找不到卡片";
  });

/* ---------- 场景一：14 天完整 ---------- */
await seed(fullSeed());
await toLedger();
await shot("r10-01-full");
const full = await cardText();
console.log("① 完整 14 天：", full);
console.log("   期望 2190 左右:", /21\d\d/.test(full) ? "✓" : "✗");

/* ---------- 场景二：只有 3 天 ---------- */
await seed(shortSeed());
await toLedger();
await shot("r10-02-short");
const short = await cardText();
console.log("② 只有 3 天：", short);
console.log(
  "   期望不显示数字:",
  short.includes("—") || short.includes("再") ? "✓" : "✗",
);

await browser.close();
