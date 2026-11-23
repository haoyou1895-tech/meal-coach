/**
 * 第八轮改动的一次性验收：图标、补账多选、近 7 天单色柱、点评下线。
 *
 * 用法：node scripts/verify-round8.mjs
 *      BASE_URL=https://canmou.net.cn node scripts/verify-round8.mjs
 *
 * 播种方式：在页面脚本执行的**最早时机**塞一条 localStorage，
 * 只塞一次（`if (!localStorage.getItem(KEY))`）——
 * puppeteer 的 evaluateOnNewDocument 每次导航都会跑，reload 会把数据盖回去（K10）。
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".shots";
const KEY = "mealcoach.v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = ymd(new Date());
const yesterday = ymd(new Date(Date.now() - 864e5));

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
    meal("m1", "breakfast", 600, 8),
    meal("m2", "lunch", 700, 12),
    meal("m3", "dinner", 700, 19),
    // 昨天一顿，让近 7 天有两根柱子
    { ...meal("m4", "dinner", 1600, 19), date: yesterday, id: "m4" },
  ],
  weights: [],
  activities: [],
  exercises: [],
  closedDays: [],
  exercisePlans: [],
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

const body = () => page.evaluate(() => document.body.innerText);

/* ---------- 一、记录卡：点评应该不在了 ---------- */
let t = await body();
const adviceWords = ["挑淡的吃", "清一点", "吃撑了", "这顿合适", "改蒸煮"];
const stillThere = adviceWords.filter((w) => t.includes(w));
console.log("① 记录卡点评已下线:", stillThere.length === 0 ? "过了" : `没过（还有：${stillThere}）`);

/* ---------- 二、打开收工面板 ---------- */
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.innerText.includes("算一笔"))?.click();
});
await sleep(800);

// 滚动到运动那一行
await page.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find((s) => s.innerText.trim() === "今天动了多少");
  el?.scrollIntoView({ block: "start" });
});
await sleep(400);
await shot("r8-01-today");

/* ---------- 三、补账：选两项运动 ---------- */
// 补账网格的每个按钮都带 aria-pressed，用它精确定位，
// 不会误点到上面"今天动了多少"那排
const picked = await page.evaluate(() => {
  const want = ["快走", "游泳"];
  const hit = [];
  for (const w of want) {
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
console.log("② 勾上两项:", picked.length === 2 ? "过了" : `没过（只勾上 ${picked}）`);

const plan = await page.evaluate(() => {
  const txt = document.body.innerText;
  const one = txt.includes("一天补完");
  const multi = txt.includes("后天");
  const i = txt.indexOf("明天");
  const seg = i >= 0 ? txt.slice(i, i + 120).replace(/\s*\n\s*/g, " | ") : null;
  return { one, multi, seg };
});
console.log("③ 算出方案:", plan.seg ?? "没算出来");
console.log("   一天补完的提示:", plan.one ? "有" : "无（可能是摊了多天）");

await page.evaluate(() => {
  const el = [...document.querySelectorAll("p")].find((x) => x.innerText.includes("补回来动什么"));
  el?.scrollIntoView({ block: "start" });
});
await sleep(400);
await shot("r8-02-debt");

/* ---------- 四、定上，检查每天的计划 ---------- */
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "就这么定")?.click();
});
await sleep(600);

const stored = await page.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.exercisePlans || []).map((p) => ({
    date: p.date,
    items: (p.items || []).map((x) => `${x.kind}:${x.minutes}`),
  }));
}, KEY);
console.log("④ 落库的计划:", JSON.stringify(stored));

const firstDayItems = stored[0]?.items?.length ?? 0;
console.log("   明天是不是组合:", firstDayItems >= 2 ? "是（组合）" : "只有一项");

/* ---------- 五、近 7 天图 ---------- */
await page.evaluate(() => {
  document.querySelector('[aria-label="关闭"]')?.click();
});
await sleep(300);
// 关面板可能是点 X，退回首页
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "记录")?.click();
});
await sleep(1200);

const chart = await page.evaluate(() => {
  const txt = document.body.innerText;
  return {
    oldLegend: ["早", "午", "晚", "加"].filter((w) => {
      // 只看图例区域：查 12px 小字里的"早/午/晚/加"
      const els = [...document.querySelectorAll("span")].filter(
        (e) => e.innerText.trim() === w && e.className.includes("flex items-center"),
      );
      return els.length > 0;
    }),
    hasBudget: txt.includes("预算"),
    hasTotal: txt.includes("当天总量") || txt.includes("超了"),
  };
});
console.log("⑤ 旧四色图例:", chart.oldLegend.length === 0 ? "已去掉" : `还在（${chart.oldLegend}）`);
console.log("   预算图例:", chart.hasBudget ? "在" : "没了");
console.log("   新图例:", chart.hasTotal ? "在" : "没找到");

await page.evaluate(() => {
  const el = [...document.querySelectorAll("h2")].find((x) => x.innerText.includes("近 7 天"));
  el?.scrollIntoView({ block: "start" });
});
await sleep(500);
await shot("r8-03-chart");

await browser.close();
console.log("完成");
