/**
 * 验证「补回来动什么」这一块：量自己填、单位按项、卡路里实时算。
 *
 * 1) 勾一项就出现一个输入框，默认值不再固定 10 分钟
 * 2) 不同项目用不同单位：快走/慢跑是公里，太极是分钟
 * 3) 改数就改卡路里，合计跟着跳
 * 4) 「每天最多动」那行没了
 * 5) 确定之后，计划里存的是他填的量（amount），不是折算出来的分钟
 *
 * 用法：node scripts/verify-makeup.mjs（先 npm run dev）
 *       BASE_URL=https://canmou.net.cn node scripts/verify-makeup.mjs
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
  diseases: [],
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
    nutrition: { kcal, protein: 25, carb: 60, fat: 25, sodium: 900 },
    comment: "",
    adjusted: false,
    confidence: 0.9,
    createdAt: `${today}T${hour}:00:00.000Z`,
  };
}

let fails = 0;
function check(name, ok, detail = "") {
  if (!ok) fails++;
  console.log(`${ok ? "过了" : "没过"}  ${name}${detail ? ` —— ${detail}` : ""}`);
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

await page.evaluateOnNewDocument(
  (profile, meals) => {
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
  },
  PROFILE,
  [
    meal("m1", "breakfast", 900, "08"),
    meal("m2", "lunch", 900, "12"),
    meal("m3", "dinner", 900, "19"),
  ],
);

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(1500);

/* 切到「动」这一页 */
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => b.innerText.trim().replace(/\s/g, "") === "动")
    ?.click();
});
await page.waitForFunction(
  () => document.body.innerText.includes("补回来动什么"),
  { timeout: 8000 },
);
await sleep(300);

const inCard = (label) =>
  page.evaluate((label) => {
    const p = [...document.querySelectorAll("p")].find((x) =>
      x.innerText.includes("补回来动什么"),
    );
    const card = p?.closest('div[class*="card"]');
    if (!card) return false;
    const btn = [...card.querySelectorAll("button")].find(
      (b) => b.innerText.trim() === label,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);

await inCard("快走");
await sleep(200);
await inCard("太极");
await sleep(400);

const state = await page.evaluate(() => {
  const p = [...document.querySelectorAll("p")].find((x) =>
    x.innerText.includes("补回来动什么"),
  );
  const card = p?.closest('div[class*="card"]');
  const inputs = [...card.querySelectorAll("input")].map((i) => ({
    label: i.getAttribute("aria-label"),
    value: i.value,
  }));
  return { text: card.innerText, inputs };
});

check("勾了快走就有输入框", state.inputs.some((i) => i.label === "快走的公里数"), JSON.stringify(state.inputs));
check("勾了太极就有输入框", state.inputs.some((i) => i.label === "太极的分钟数"));

const walk = state.inputs.find((i) => i.label === "快走的公里数");
check("快走的默认值不是 10 分钟硬凑出来的整数", walk && Number(walk.value) > 0, `默认 ${walk?.value} 公里`);

const before = state.text.match(/这些动完约 (\d+) 卡/);
check("合计行在", !!before, before ? `合计 ${before[1]} 卡` : "没找到合计");
check("「每天最多动」已经去掉", !state.text.includes("每天最多动"));

await page.screenshot({ path: path.join(OUT, "mk-01-default.png") });

/* 改数 → 卡路里跟着变 */
await page.evaluate(() => {
  const el = [...document.querySelectorAll("input")].find(
    (i) => i.getAttribute("aria-label") === "快走的公里数",
  );
  el?.focus();
});
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type("input:focus", "5");
await page.keyboard.press("Enter");
await sleep(400);

const after = await page.evaluate(() => {
  const p = [...document.querySelectorAll("p")].find((x) =>
    x.innerText.includes("补回来动什么"),
  );
  return p?.closest('div[class*="card"]').innerText ?? "";
});
const afterKcal = after.match(/这些动完约 (\d+) 卡/);
check(
  "改数之后合计跟着变",
  !!afterKcal && Number(afterKcal[1]) !== Number(before?.[1] ?? -1),
  `${before?.[1]} → ${afterKcal?.[1]} 卡`,
);
await page.screenshot({ path: path.join(OUT, "mk-02-edited.png") });

/* 确定 → 存进去的是量 */
await page.evaluate(() => {
  const p = [...document.querySelectorAll("p")].find((x) =>
    x.innerText.includes("补回来动什么"),
  );
  const card = p?.closest('div[class*="card"]');
  [...card.querySelectorAll("button")]
    .find((b) => b.innerText.trim() === "确定")
    ?.click();
});
await sleep(500);

const plan = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("mealcoach.v1") || "{}");
  return (s.exercisePlans || []).map((p) => ({
    date: p.date,
    items: (p.items || []).map((i) => ({
      kind: i.kind,
      minutes: i.minutes,
      amount: i.amount ?? null,
    })),
  }));
});
const walkItem = plan.flatMap((p) => p.items).find((i) => i.kind === "walk");
check("计划里存下了他填的公里数", walkItem?.amount === 5, JSON.stringify(plan));
const tai = plan.flatMap((p) => p.items).find((i) => i.kind === "taiji");
check("按分钟的项目不重复存 amount", tai ? tai.amount === null : false, JSON.stringify(tai));

await page.screenshot({ path: path.join(OUT, "mk-03-saved.png") });

await browser.close();
console.log(fails ? `\n${fails} 项没过` : "\n全过");
process.exit(fails ? 1 : 0);
