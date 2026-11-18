/**
 * 验证体重趋势图：注入 30 天的假体重数据，截记录页。
 * 用法：node scripts/shot-weight.mjs（需先 npm run dev）
 * 假数据只写进这个浏览器实例，不影响你自己的本地数据。
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fake = {
  profile: {
    gender: "male",
    age: 42,
    heightCm: 175,
    weightKg: 78.5,
    targetWeightKg: 70,
    diseases: ["fattyLiver"],
    taste: "salty",
    mealRegular: "sometimes",
    createdAt: "2026-10-19T08:00:00.000Z",
  },
  meals: [],
  activities: [],
  onboarded: true,
  weights: [
    { date: "2026-10-19", weightKg: 78.5 },
    { date: "2026-10-22", weightKg: 78.1 },
    { date: "2026-10-26", weightKg: 77.6 },
    { date: "2026-10-29", weightKg: 77.8 },
    { date: "2026-11-02", weightKg: 77.0 },
    { date: "2026-11-05", weightKg: 76.4 },
    { date: "2026-11-08", weightKg: 75.9 },
    { date: "2026-11-11", weightKg: 75.5 },
    { date: "2026-11-14", weightKg: 74.9 },
    { date: "2026-11-17", weightKg: 74.2 },
  ],
};

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
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [console error]", m.text());
});

await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify(s));
}, fake);
await page.reload({ waitUntil: "networkidle0" });

// 切到「记录」页：开屏 1.4 秒 + hydration 期间点击会被吞，所以重试几次
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

if (!entered) {
  const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("× 没进记录页，当前页面文字：\n" + text);
  await page.screenshot({ path: path.join(OUT, "weight-debug.png") });
  console.log("✓ weight-debug.png");
  await browser.close();
  process.exit(1);
}
await sleep(700);

await page.screenshot({ path: path.join(OUT, "weight-trend.png"), fullPage: true });
console.log("✓ weight-trend.png");

// 再截一张只有体重区域的，方便看细节
const box = await page.evaluate(() => {
  const els = [...document.querySelectorAll("section")];
  const el = els.find((e) => e.innerText.includes("体重变化"));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
});
if (box) {
  await page.screenshot({
    path: path.join(OUT, "weight-trend-crop.png"),
    clip: box,
  });
  console.log("✓ weight-trend-crop.png");
} else {
  console.log("× 没找到「体重变化」区块");
}

await browser.close();
