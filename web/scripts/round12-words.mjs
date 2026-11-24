/**
 * 第十二轮：同一个动作只剩一个词。
 *
 * 用法：node scripts/round12-words.mjs
 *      BASE_URL=https://canmou.net.cn node scripts/round12-words.mjs
 *
 * 查四件事：
 *   1. 运动页两个折叠入口都叫「添加」，没有「加一项 / 再排一项」
 *   2. 点开之后都变「收起」
 *   3. 「今天要做的」那排绿色按钮叫「确定」，不再是「记上」
 *   4. 全站搜不到被禁的词
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".shots";
const KEY = "mealcoach.v1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = ymd(new Date());
const yesterday = ymd(new Date(Date.now() - 86400000));
const tomorrow = ymd(new Date(Date.now() + 86400000));

const P = {
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

const seed = {
  profile: P,
  weights: [],
  activities: [],
  meals: [],
  closedDays: [],
  onboarded: true,
  exercises: [{ id: "e1", date: today, kind: "bike", minutes: 40, amount: 10.5 }],
  // 昨天定给今天的两项：一项做了、一项没做 —— 才能看到「确定」按钮
  exercisePlans: [
    {
      date: today,
      items: [
        { kind: "swim", minutes: 55 },
        { kind: "walk", minutes: 10 },
      ],
    },
    {
      date: tomorrow,
      items: [{ kind: "stroll", minutes: 120 }],
    },
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

/** 所有可见按钮的文字 */
const buttonLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );

/** 点第 n 个写着"添加"的按钮 */
const tapAdd = async (n = 0) => {
  const ok = await page.evaluate((i) => {
    const bs = [...document.querySelectorAll("button")].filter(
      (b) => b.innerText.replace(/\s+/g, "").trim().startsWith("添加"),
    );
    if (!bs[i]) return false;
    bs[i].click();
    return true;
  }, n);
  await sleep(500);
  return ok;
};

async function load(s) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify(v)), KEY, s);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(2200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
}

/* ---------- 进运动页 ---------- */
await load(seed);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(
    (x) => x.innerText.replace(/\s+/g, "").trim() === "动",
  );
  b?.click();
});
await sleep(900);
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(200);
await shot("r12-01-move-folded");

const t1 = await text();
const labels = await buttonLabels();

console.log("A 折叠入口");
const addCount = labels.filter((x) => x.startsWith("添加")).length;
console.log("  写着「添加」的按钮:", addCount, addCount === 2 ? "✓ 两个" : "✗ 不是两个");
console.log(
  "  旧说法是否清干净:",
  ["加一项", "再排一项", "明天做点什么", "再加一种"].filter((w) => t1.includes(w)).length === 0
    ? "✓ 一个都没有"
    : "✗ 还有: " + ["加一项", "再排一项", "明天做点什么", "再加一种"].filter((w) => t1.includes(w)).join(" / "),
);

console.log("B 今天要做的");
console.log("  绿色按钮叫「确定」:", /确定/.test(t1) ? "✓" : "✗");
console.log("  没有「记上」:", /记上/.test(t1) ? "✗ 还在" : "✓");

console.log("C 展开后变「收起」");
console.log("  点开第一个「添加」:", (await tapAdd(0)) ? "✓" : "✗");
await shot("r12-02-move-add-open");
const t2 = await text();
console.log("  出现「收起」:", /收起/.test(t2) ? "✓" : "✗");
console.log("  出现语音入口:", /说一句也行|确定/.test(t2) ? "✓" : "✗");

/* 再点开明天那个 */
await page.evaluate(() => {
  const bs = [...document.querySelectorAll("button")].filter(
    (b) => b.innerText.replace(/\s+/g, "").trim().startsWith("添加"),
  );
  bs[bs.length - 1]?.click();
});
await sleep(500);
await shot("r12-03-move-both-open");
const t3 = await text();
console.log("  两个都展开后「收起」出现两次:", (t3.match(/收起/g) || []).length >= 2 ? "✓" : "部分");

/* ---------- 吃页主按钮 ---------- */
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(
    (x) => x.innerText.replace(/\s+/g, "").trim() === "吃",
  );
  b?.click();
});
await sleep(800);
const t4 = await text();
console.log("D 吃页主按钮");
console.log("  叫「记一餐」:", /记一餐/.test(t4) ? "✓" : "✗");
console.log("  没有「再记一顿 / 拍一张，记一餐」:", /再记一顿|拍一张，记一餐/.test(t4) ? "✗ 还在" : "✓");
await shot("r12-04-eat");

await browser.close();
