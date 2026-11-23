/**
 * 第九轮：三页拆分（吃 / 动 / 账）+ 运动量指标 + 羽毛球图标。
 *
 * 用法：node scripts/round9-shots.mjs
 *      BASE_URL=https://canmou.net.cn node scripts/round9-shots.mjs
 *
 * 只做两件事：播种一组"今天超支、有公里和个数两种运动"的数据，
 * 然后把三页各截一遍，顺便把关键文案打出来核对。
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".shots";
const KEY = "mealcoach.v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = ymd(new Date());
const d1 = ymd(new Date(Date.now() - 864e5));
const d2 = ymd(new Date(Date.now() - 2 * 864e5));

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

const seed = {
  profile: {
    gender: "male",
    age: 46,
    heightCm: 172,
    weightKg: 78,
    targetWeightKg: 68,
    diseases: ["hypertension"],
    taste: "salty",
    mealRegular: "irregular",
    createdAt: new Date().toISOString(),
  },
  meals: [
    meal("m1", today, "breakfast", 600, 8),
    meal("m2", today, "lunch", 700, 12),
    meal("m3", today, "dinner", 700, 19),
    meal("m4", d1, "dinner", 1600, 19),
    meal("m5", d2, "lunch", 1100, 12),
  ],
  weights: [
    { date: d1, weightKg: 77.6 },
    { date: today, weightKg: 76.9 },
  ],
  activities: [],
  exercises: [
    // 公里：5.5 公里，折算 59 分钟
    { id: "e1", date: today, kind: "walk", minutes: 59, amount: 5.5 },
    // 个数：1000 个，折算 10 分钟
    { id: "e2", date: today, kind: "rope", minutes: 10, amount: 1000 },
    // 老记录：只有分钟，没有量
    { id: "e3", date: d1, kind: "swim", minutes: 40 },
    { id: "e4", date: d2, kind: "badminton", minutes: 50 },
  ],
  closedDays: [],
  exercisePlans: [
    // 昨天定给今天的
    { date: today, items: [{ kind: "walk", minutes: 40 }] },
  ],
  onboarded: true,
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

await page.evaluateOnNewDocument(
  (k, s) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s));
  },
  KEY,
  seed,
);

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(2500);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  截图", name);
};

const tapTab = async (label) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("nav button")].find(
      (x) => x.innerText.trim() === t,
    );
    b?.click();
  }, label);
  await sleep(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
};

/* ---------- 一、吃 ---------- */
await shot("r9-01-eat");
const eatText = await page.evaluate(() => document.body.innerText);
console.log("① 吃页不再提运动:", /今天动了|超支/.test(eatText) ? "没过（还有运动字样）" : "过了");
console.log("  底部三格:", await page.evaluate(() =>
  [...document.querySelectorAll("nav button")].map((b) => b.innerText.trim()).join(" / "),
));

/* ---------- 二、动 ---------- */
await tapTab("动");
await shot("r9-02-move-top");
const moveTop = await page.evaluate(() => document.body.innerText);
const amounts = await page.evaluate(() =>
  [...document.querySelectorAll("input[aria-label]")]
    .map((i) => `${i.getAttribute("aria-label")}=${i.value}`)
    .filter((x) => /公里|个/.test(x)),
);
console.log("② 运动量指标:", [
  amounts.some((x) => x.includes("5.5")) ? "公里 ✓" : "公里 ✗",
  amounts.some((x) => x.includes("1000")) ? "个数 ✓" : "个数 ✗",
  moveTop.includes("约 59 分钟") ? "折算 ✓" : "折算 ✗",
].join(" · "), amounts.join(" | "));
console.log("  今天要做的:", moveTop.includes("今天要做的") ? "在" : "没显示");

// 展开更多，看羽毛球和乒乓球并排时的样子
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "更多");
  b?.click();
});
await sleep(500);
await shot("r9-05-move-more");

// 往下滚到补账
await page.evaluate(() => {
  const el = [...document.querySelectorAll("p,span")].find((s) =>
    s.innerText.trim().startsWith("补回来动什么"),
  );
  el?.scrollIntoView({ block: "start" });
});
await sleep(400);

// 勾两项，看方案
const picked = await page.evaluate(() => {
  const hit = [];
  for (const w of ["快走", "游泳"]) {
    const b = [...document.querySelectorAll("button[aria-pressed]")].find(
      (x) => x.innerText.trim() === w,
    );
    if (b) {
      b.click();
      hit.push(w);
    }
  }
  return hit;
});
await sleep(700);
await shot("r9-03-move-debt");
const debtText = await page.evaluate(() => {
  const t = document.body.innerText;
  const i = t.indexOf("明天");
  return i >= 0 ? t.slice(i, i + 100).replace(/\s*\n\s*/g, " | ") : "没算出来";
});
console.log("③ 勾上:", picked.join("、"), "→", debtText);

/* ---------- 三、账 ---------- */
await tapTab("账");
await shot("r9-04-ledger");
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(300);
await shot("r9-06-ledger-top");
const led = await page.evaluate(() => document.body.innerText);
console.log("④ 总账对照:", [
  led.includes("近 7 天吃了") ? "吃 ✓" : "吃 ✗",
  led.includes("近 7 天动了") ? "动 ✓" : "动 ✗",
  led.includes("动 432") || led.includes("动 4") ? "按天 ✓" : "按天 ?",
].join(" · "));

await browser.close();
console.log("完成");
