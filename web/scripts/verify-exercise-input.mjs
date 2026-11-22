/**
 * 验证「一句话记运动」和「明天多选」。
 *
 * 验的是四件事：
 * 1) 打一句「快走40分钟，游泳半小时」，能不能拆成两条
 * 2) 库里没有的项目（打拳），会不会落成"其他运动 30 分"而不是被丢掉
 * 3) 明天能不能一次定几种（乒乓球 + 瑜伽各半小时）
 * 4) 认不出来的话，提示会不会出来
 *
 * 用法：node scripts/verify-exercise-input.mjs（需先 npm run dev）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = {
  gender: "male",
  age: 46,
  heightCm: 172,
  weightKg: 78,
  targetWeightKg: 68,
  diseases: ["hypertension"],
  taste: "salty",
  mealRegular: "irregular",
  createdAt: new Date().toISOString(),
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

await page.evaluateOnNewDocument((profile) => {
  if (!localStorage.getItem("mealcoach.v1")) {
    localStorage.setItem(
      "mealcoach.v1",
      JSON.stringify({
        profile,
        meals: [],
        weights: [],
        activities: [],
        exercises: [],
        closedDays: [],
        exercisePlans: [],
        onboarded: true,
      }),
    );
  }
}, PROFILE);

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(2600);

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  截图 ${name}.png`);
}

async function typeInto(placeholderPart, text) {
  const ok = await page.evaluate((part) => {
    const el = [...document.querySelectorAll("input")].find((i) =>
      (i.placeholder || "").includes(part),
    );
    if (!el) return false;
    el.focus();
    return true;
  }, placeholderPart);
  if (!ok) throw new Error(`找不到输入框：${placeholderPart}`);
  await page.type("input:focus", text, { delay: 12 });
  await sleep(120);
  await page.keyboard.press("Enter");
  await sleep(400);
}

const body = () => page.evaluate(() => document.body.innerText);

/* ---------- 打开收工面板 ---------- */
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    x.innerText.includes("算一笔"),
  );
  if (b) b.click();
});
await page.waitForFunction(
  () => document.body.innerText.includes("今天动了多少"),
  { timeout: 8000 },
);
await shot("ex-01-panel");

/* ---------- 1. 一句话拆两条 ---------- */
await typeInto("快走 40 分钟", "快走40分钟，游泳半小时");
let t = await body();
const gotWalk = t.includes("快走") && t.includes("40 分");
const gotSwim = t.includes("游泳") && t.includes("30 分");
console.log("① 拆两句:", gotWalk && gotSwim ? "过了" : `没过（快走 ${gotWalk} / 游泳 ${gotSwim}）`);

/* ---------- 2. 库里没有的项目 ---------- */
await typeInto("快走 40 分钟", "打拳半小时");
t = await body();
const gotOther = t.includes("打拳") && t.includes("30 分");
console.log("② 其他运动:", gotOther ? "过了（打拳 30 分）" : "没过");
await shot("ex-02-today");

/* ---------- 3. 认不出来要给提示 ---------- */
await typeInto("快走 40 分钟", "反正就是动了动吧");
t = await body();
const gotHint = t.includes("没听出运动");
console.log("③ 认不出有提示:", gotHint ? "过了" : "没过");

/* ---------- 4. 明天多选 ---------- */
await page.evaluate(() => {
  const el = [...document.querySelectorAll("input")].find((i) =>
    (i.placeholder || "").includes("想做什么"),
  );
  el?.scrollIntoView({ block: "center" });
});
await sleep(300);
await typeInto("想做什么", "乒乓球和瑜伽各半小时");
t = await body();
const gotPing = t.includes("乒乓球");
const gotYoga = t.includes("瑜伽");
const gotEach = (t.match(/30 分钟/g) || []).length >= 2;
console.log(
  "④ 明天多选:",
  gotPing && gotYoga ? "过了" : `没过（乒乓 ${gotPing} / 瑜伽 ${gotYoga} / 各半小时 ${gotEach}）`,
);
await shot("ex-03-tomorrow");

/* ---------- 5. 数据落盘 ---------- */
const saved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("mealcoach.v1") || "{}");
  return {
    exercises: (s.exercises || []).map((e) => `${e.kind}:${e.minutes}`),
    plans: (s.exercisePlans || []).map((p) =>
      (p.items || []).map((i) => `${i.kind}:${i.minutes}`).join("+"),
    ),
  };
});
console.log("⑤ 存下来:", JSON.stringify(saved));

await browser.close();

const pass =
  gotWalk && gotSwim && gotOther && gotHint && gotPing && gotYoga &&
  saved.exercises.length >= 3 && saved.plans.length === 1;
console.log(pass ? "\n全部通过" : "\n有没过的地方，看上面");
process.exit(pass ? 0 : 1);
