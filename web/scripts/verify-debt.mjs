/**
 * 验证本轮三件事：运动项不标默认时间、数值双通道、超支补账。
 *
 * 1) 运动按钮上不该再有"40分"这种默认时长
 * 2) 点按钮 → 出现可打字的分钟数 + −＋
 * 3) 今天超 500 时，明天段给的是"补回来要动多久、分几天"，不是通用建议
 * 4) 说明文字默认不显示，开了开关才出来
 * 5) 麦克风在输入框右边
 *
 * 用法：node scripts/verify-debt.mjs（先 npm run dev）
 *       BASE_URL=https://canmou.net.cn node scripts/verify-debt.mjs（线上）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

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

function meal(id, type, kcal, hour) {
  return {
    id,
    date: today,
    mealType: type,
    items: [{ name: "测试菜", portion: "一份", kcal }],
    nutrition: {
      kcal,
      protein: 25,
      carb: 60,
      fat: 25,
      sodium: 900,
    },
    comment: "",
    adjusted: false,
    confidence: 0.9,
    createdAt: `${today}T${hour}:00:00.000Z`,
  };
}

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

await page.evaluateOnNewDocument((profile, meals) => {
  if (!localStorage.getItem("mealcoach.v1")) {
    localStorage.setItem(
      "mealcoach.v1",
      JSON.stringify({
        profile,
        meals,
        weights: [],
        activities: [],
        exercises: [],
        closedDays: [],
        exercisePlans: [],
        onboarded: true,
      }),
    );
  }
}, PROFILE, [meal("m1", "breakfast", 600, "08"), meal("m2", "lunch", 700, "12"), meal("m3", "dinner", 700, "19")]);

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(2600);

const body = () => page.evaluate(() => document.body.innerText);
const shot = async (n) => {
  await page.screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  截图 ${n}.png`);
};

await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((x) => x.innerText.includes("算一笔"))
    ?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("今天动了多少"), {
  timeout: 8000,
});
await shot("db-01-panel");

let t = await body();

/* ① 按钮上不该有默认时长 */
const noDefaultTime = !/快走\s*\d+\s*分/.test(t) && !t.includes("40分");
console.log("① 运动项不标默认时间:", noDefaultTime ? "过了" : "没过");

/* ② 说明文字默认不显示 */
const noHint = !t.includes("「和」隔开能一次记几种") && !t.includes("按体重 78");
console.log("② 说明默认隐藏:", noHint ? "过了" : "没过");

/* ③ 麦克风在右边 */
const micRight = await page.evaluate(() => {
  const input = [...document.querySelectorAll("input")].find((i) =>
    (i.placeholder || "").includes("快走 40"),
  );
  const mic = [...document.querySelectorAll("button")].find((b) =>
    (b.getAttribute("aria-label") || "").includes("语音"),
  );
  if (!input || !mic) return null;
  const a = input.getBoundingClientRect();
  const b = mic.getBoundingClientRect();
  return { inputMid: a.left + a.width / 2, micLeft: b.left, inputRight: a.right };
});
console.log(
  "③ 麦克风靠右:",
  micRight && micRight.micLeft >= micRight.inputRight - 2
    ? "过了"
    : `没过 ${JSON.stringify(micRight)}`,
);

/* ④ 点运动按钮 → 出现分钟输入 */
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => b.innerText.trim() === "快走")
    ?.click();
});
await sleep(400);
const stepper = await page.evaluate(() => {
  const el = [...document.querySelectorAll("input")].find(
    (i) => i.getAttribute("aria-label") === "快走的分钟数",
  );
  return el ? el.value : null;
});
console.log("④ 点开后能填分钟:", stepper ? `过了（默认 ${stepper}）` : "没过");
await shot("db-02-pick");

/* 记上一条 */
await page.evaluate(() => {
  const el = [...document.querySelectorAll("input")].find(
    (i) => i.getAttribute("aria-label") === "快走的分钟数",
  );
  el?.focus();
});
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type("input:focus", "50");
await page.keyboard.press("Enter");
await sleep(200);
await page.evaluate(() => {
  document.querySelector('[aria-label="记上快走"]')?.click();
});
await sleep(500);
const got50 = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("mealcoach.v1") || "{}");
  return (s.exercises || []).some((e) => e.kind === "walk" && e.minutes === 50);
});
console.log("⑤ 50 分钟记上了:", got50 ? "过了" : "没过");
t = await body();

/* ⑥ 超支 → 补账 */
const overText = await page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s*\n?\s*大卡，是今天多出来的/);
  return m ? Number(m[1]) : null;
});
const hasDebt = t.includes("补回来要动多久");
console.log("⑥ 超支走补账:", hasDebt ? `过了（超 ${overText}）` : "没过");

const gridCount = await page.evaluate(() => {
  const els = [...document.querySelectorAll("button")].filter(
    (b) => b.innerText.trim() === "快走",
  );
  els[els.length - 1]?.click();
  return els.length;
});
await sleep(600);
console.log("   （补账网格里点到的快走按钮数：", gridCount, "）");
t = await body();
const debtLine = t.match(/明天[起、后 天]*[^\n]*每天 \d+ 分钟|明天、后天各 \d+ 分钟|明天 \d+ 分钟/);
console.log("⑦ 算出天数与时长:", debtLine ? `过了（${debtLine[0]}）` : "没过");
await page.evaluate(() => {
  const el = [...document.querySelectorAll("p")].find((x) =>
    x.innerText.includes("补回来要动多久"),
  );
  el?.scrollIntoView({ block: "start" });
});
await sleep(400);
await shot("db-03-debt");

/* ⑧ 定上，落到 localStorage */
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => b.innerText.trim().startsWith("就这么定"))
    ?.click();
});
await sleep(600);
const saved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("mealcoach.v1") || "{}");
  return {
    plans: (s.exercisePlans || []).map(
      (p) => `${p.date}:${(p.items || []).map((i) => `${i.kind}/${i.minutes}`).join("+")}`,
    ),
    exercises: (s.exercises || []).map((e) => `${e.kind}/${e.minutes}`),
  };
});
console.log("⑧ 落到计划:", saved.plans.length ? `过了 ${JSON.stringify(saved.plans)}` : "没过");
console.log("  今天记的运动:", JSON.stringify(saved.exercises));
await shot("db-04-done");

/* ⑨ 打开说明开关 */
await page.evaluate(() => {
  document.querySelector('[aria-label="设置"]')?.click();
});
await sleep(500);
const hasSwitch = await page.evaluate(() =>
  document.body.innerText.includes("显示说明文字"),
);
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((x) => x.innerText.includes("显示说明文字"))
    ?.click();
});
await sleep(400);
console.log("⑨ 说明开关:", hasSwitch ? "过了（开关在设置里）" : "没过");

await browser.close();

const pass =
  noDefaultTime && noHint && !!stepper && hasDebt && !!debtLine &&
  saved.plans.length >= 1 && hasSwitch;
console.log(pass ? "\n全部通过" : "\n有没过的地方，看上面");
process.exit(pass ? 0 : 1);
