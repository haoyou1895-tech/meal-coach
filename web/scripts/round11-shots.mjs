/**
 * 第十一轮：周数排序修正 + 吃页减负 + 空状态可点。
 *
 * 用法：node scripts/round11-shots.mjs
 *      BASE_URL=https://canmou.net.cn node scripts/round11-shots.mjs
 *
 * 三组数据各看一遍：
 *   A 空状态（今天一条没记）—— 营养素条不该出现，空状态要能点开相机
 *   B 默认缺口撞安全上限（74→68）—— 只剩两档，且"照这个"就是最快
 *   C 上限有余量（90→78）—— 三档齐全，周数必须递增
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".shots";
const KEY = "mealcoach.v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = ymd(new Date());

const meal = (id, type, kcal, hour) => ({
  id,
  date: today,
  mealType: type,
  items: [{ name: "测试菜", portion: "一份", kcal }],
  nutrition: { kcal, protein: 25, carb: 60, fat: 25, sodium: 900 },
  comment: "",
  adjusted: false,
  confidence: 0.9,
  createdAt: `${today}T${pad(hour)}:00:00.000Z`,
  eatenAt: `${today}T${pad(hour)}:00:00.000Z`,
});

const base = {
  weights: [],
  activities: [],
  exercises: [],
  closedDays: [],
  exercisePlans: [],
  onboarded: true,
};

const P_SMALL = {
  gender: "male",
  age: 46,
  heightCm: 157,
  weightKg: 74,
  targetWeightKg: 68,
  diseases: ["hypertension"],
  taste: "salty",
  mealRegular: "irregular",
  createdAt: new Date().toISOString(),
};

const P_BIG = { ...P_SMALL, heightCm: 175, weightKg: 90, targetWeightKg: 78 };

const seedEmpty = { ...base, profile: P_SMALL, meals: [] };
const seedFull = {
  ...base,
  profile: P_SMALL,
  meals: [meal("m1", "breakfast", 500, 8), meal("m2", "lunch", 700, 12)],
};
const seedBig = {
  ...base,
  profile: P_BIG,
  meals: [meal("m1", "breakfast", 500, 8)],
};
const seedMove = {
  ...base,
  profile: P_SMALL,
  meals: [],
  exercises: [
    { id: "e1", date: today, kind: "walk", minutes: 59, amount: 5.5 },
    { id: "e2", date: today, kind: "rope", minutes: 10, amount: 1000 },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  截图", name);
};
const text = () => page.evaluate(() => document.body.innerText);
const tapText = async (t) => {
  const ok = await page.evaluate((s) => {
    const flat = (x) => x.replace(/\s+/g, "");
    const b = [...document.querySelectorAll("button")].find((x) =>
      flat(x.innerText).includes(flat(s)),
    );
    if (!b) return false;
    b.click();
    return true;
  }, t);
  if (!ok) console.log("    ✗ 找不到按钮:", t);
  await sleep(600);
};

async function load(seed) {
  // 第一次进来还是 about:blank，localStorage 读不了 —— 先落到页面上再写
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (k, s) => localStorage.setItem(k, JSON.stringify(s)),
    KEY,
    seed,
  );
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(2200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
}

/* ---------- A 空状态 ---------- */
await load(seedEmpty);
await shot("r11-01-empty");
const emptyText = await text();
console.log("A 空状态");
console.log("  营养素条收起:", /蛋白质/.test(emptyText) ? "没过（还在）" : "过了");
const blank = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /拍一张就行/.test(x.innerText),
  );
  return { found: !!b, tag: b?.tagName, hasChip: /拍照/.test(b?.innerText ?? "") };
});
console.log("  空状态可点:", blank.found ? `✓ (${blank.tag})` : "✗ 还是死的");
if (blank.found) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /拍一张就行/.test(x.innerText),
    );
    b.click();
  });
  await sleep(900);
  const cameraOpen = await page.evaluate(() =>
    /拍照|相册|这张/.test(document.body.innerText),
  );
  console.log("  点开相机:", cameraOpen ? "✓" : "✗");
  await shot("r11-02-empty-camera");
}

/* ---------- B 两档（撞上限） ---------- */
await load(seedFull);
await shot("r11-03-two-tiers");
const beforeOpen = await text();
await tapText("定计划");
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(300);
await shot("r11-04-plan-open");

const cards = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .map((b) => b.innerText.replace(/\n/g, " ").trim())
    .filter((t) => /周.*每天/.test(t)),
);
console.log("B 默认缺口撞上限（74→68）");
console.log("  档位:", cards.join(" | "));
const weeks = cards.map((t) => Number(t.match(/(\d+)\s*周/)?.[1]));
console.log("  周数递增:", weeks.join(" < "), weeks.every((w, i) => i === 0 || w > weeks[i - 1]) ? "✓" : "✗");
const openText = await text();
console.log(
  "  解释默认收起:",
  /躺着不动/.test(openText) ? "✗ 展开着" : "✓ 收起了",
);

await tapText("这些数怎么来的");
await sleep(400);
const mathText = await text();
console.log("  点开后出现:", /躺着不动/.test(mathText) ? "✓" : "✗");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("r11-05-plan-math");

/* ---------- C 三档齐全 ---------- */
await load(seedBig);
await tapText("定计划");
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(300);
const cards3 = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .map((b) => b.innerText.replace(/\n/g, " ").trim())
    .filter((t) => /周.*每天/.test(t)),
);
const w3 = cards3.map((t) => Number(t.match(/(\d+)\s*周/)?.[1]));
console.log("C 上限有余量（90→78）");
console.log("  档位:", cards3.join(" | "));
console.log("  周数递增:", w3.join(" < "), w3.every((x, i) => i === 0 || x > w3[i - 1]) ? "✓" : "✗");
await shot("r11-06-three-tiers");

/* ---------- D 运动页：录入区默认收起 ---------- */
await load(seedMove);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find(
    (x) => x.innerText.trim() === "动",
  );
  b?.click();
});
await sleep(800);
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(200);
await shot("r11-07-move-folded");

const sayBox = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("input,textarea")].find((x) =>
      /快走 40 分钟/.test(x.getAttribute("placeholder") ?? ""),
    );
    return !!el;
  });
console.log("D 运动页");
console.log("  默认收起录入区:", (await sayBox()) ? "✗ 还摊着" : "✓ 收起了");
console.log("  有「加一项」入口:", /加一项/.test(await text()) ? "✓" : "✗");

const planBox = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("input,textarea")].find((x) =>
      /快走和游泳各半小时/.test(x.getAttribute("placeholder") ?? ""),
    );
    return !!el;
  });
console.log("  明天排期也收起:", (await planBox()) ? "✗ 还摊着" : "✓ 收起了");
console.log("  有「明天做点什么」入口:", /明天做点什么/.test(await text()) ? "✓" : "✗");

await tapText("加一项");
await sleep(400);
console.log("  点开后出现输入框:", (await sayBox()) ? "✓" : "✗");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("r11-08-move-open");

console.log("\n（本轮不验证：预算数值变化，见 docs/06 K55）");
await browser.close();
