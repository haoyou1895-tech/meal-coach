/**
 * 验证「搬家」从文本改成文件之后还能用。
 *
 * 验四件事：
 * 1) 点「导出文件」能不能真的落一个 .json 到磁盘
 * 2) 落下来的文件是不是合法 JSON、记录条数对得上
 * 3) 用它自己导入能不能复原（选文件 → 恢复好了 → 条数不变）
 * 4) 给一个不是备份的文件，会不会明确报错而不是静默吞掉
 *
 * 用法：node scripts/verify-backup-file.mjs（需先 npm run dev）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
const DL = path.join(OUT, "downloads");
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayStr = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
};

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

const ITEMS = [
  { name: "番茄炒蛋", portion: "一盘", kcal: 220, seen: true },
  { name: "白米饭", portion: "一碗", kcal: 230, seen: true },
  { name: "清炒时蔬", portion: "一盘", kcal: 110, seen: true },
  { name: "紫菜蛋汤", portion: "一碗", kcal: 60, seen: false },
];
const NUTRITION = { kcal: 620, protein: 24, carb: 78, fat: 22, sodium: 1400 };

/* 8 天 × 3 顿，刚好是他现在的数据量级 */
const MEALS = [];
for (let d = 0; d < 8; d++) {
  for (const t of ["breakfast", "lunch", "dinner"]) {
    MEALS.push({
      id: `m${d}-${t}`,
      date: dayStr(d),
      mealType: t,
      items: ITEMS,
      nutrition: NUTRITION,
      comment: "菜里油不少，主食刚好。",
      adjusted: false,
      confidence: 0.82,
      createdAt: new Date().toISOString(),
    });
  }
}

const STATE = {
  profile: PROFILE,
  meals: MEALS,
  weights: [{ date: dayStr(2), weightKg: 77.8 }],
  activities: [],
  exercises: [
    { id: "e1", date: dayStr(1), kind: "walk", minutes: 30, amount: 2.1 },
  ],
  closedDays: [],
  exercisePlans: [],
  onboarded: true,
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
page.on("dialog", (d) => d.accept());

await page.evaluateOnNewDocument((s) => {
  if (!localStorage.getItem("mealcoach.v1")) {
    localStorage.setItem("mealcoach.v1", JSON.stringify(s));
  }
}, STATE);

const client = await page.createCDPSession();
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: DL,
  eventsEnabled: true,
});

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(2800);

const clickText = (t) =>
  page.evaluate((text) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === text,
    );
    if (!b) return false;
    b.click();
    return true;
  }, t);

const openSettings = async () => {
  await page.click('[aria-label="设置"]');
  await page.waitForFunction(() => document.body.innerText.includes("搬家"), {
    timeout: 8000,
  });
  await sleep(300);
};

/* ---------- 1. 导出文件 ---------- */
await openSettings();
if (!(await clickText("导出文件"))) throw new Error("找不到「导出文件」按钮");
await sleep(1800);

const files = fs.readdirSync(DL).filter((f) => f.endsWith(".json"));
if (!files.length) throw new Error("点了导出，但磁盘上没有文件");
const file = path.join(DL, files[0]);
const raw = fs.readFileSync(file, "utf8");
const parsed = JSON.parse(raw);
console.log(`  ✓ 落了文件：${files[0]}（${raw.length.toLocaleString()} 字符）`);
console.log(`  ✓ 内容合法：${parsed.meals.length} 条记录、${parsed.weights.length} 条体重`);
if (parsed.meals.length !== MEALS.length) {
  throw new Error(`记录条数不对：期望 ${MEALS.length}，实际 ${parsed.meals.length}`);
}

await page.screenshot({ path: path.join(OUT, "backup-01-setup.png") });
console.log("  截图 backup-01-setup.png");

/* ---------- 2. 用它自己导入 ---------- */
await clickText("关闭");
await sleep(400);
await clickText("导入");
await page.waitForFunction(() => document.body.innerText.includes("选文件"), {
  timeout: 5000,
});

const input = await page.$('input[type="file"]');
if (!input) throw new Error("导入面板里没有选文件的入口");
await input.uploadFile(file);

await page.waitForFunction(() => document.body.innerText.includes("恢复好了"), {
  timeout: 10000,
});
const restored = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("mealcoach.v1") || "{}");
  return { meals: (s.meals || []).length, weights: (s.weights || []).length };
});
console.log(`  ✓ 导入成功：恢复 ${restored.meals} 条记录、${restored.weights} 条体重`);
if (restored.meals !== MEALS.length) {
  throw new Error(`导入后条数不对：期望 ${MEALS.length}，实际 ${restored.meals}`);
}

/* ---------- 3. 给个假文件，要报错不能静默 ---------- */
const bad = path.join(DL, "not-a-backup.json");
fs.writeFileSync(bad, JSON.stringify({ hello: "world" }), "utf8");
// 导入成功后面板会自己关掉，测坏文件得重新打开
await sleep(300);
if (!(await clickText("导入"))) throw new Error("重新打开导入面板失败");
await page.waitForFunction(() => document.body.innerText.includes("选文件"), {
  timeout: 5000,
});
const input2 = await page.$('input[type="file"]');
if (!input2) throw new Error("重新打开后找不到选文件入口");
await input2.uploadFile(bad);
await page.waitForFunction(
  () => document.body.innerText.includes("打不开"),
  { timeout: 6000 },
);
console.log("  ✓ 假文件被拦下，提示「打不开」");

await page.screenshot({ path: path.join(OUT, "backup-02-import.png") });
console.log("  截图 backup-02-import.png");

/* ---------- 4. 文本入口还在 ---------- */
await clickText("关闭");
await sleep(300);
const textEntry = await page.evaluate(() =>
  document.body.innerText.includes("改用复制文本"),
);
if (!textEntry) throw new Error("文本兜底入口不见了");
console.log("  ✓ 文本兜底入口还在（传不了文件时用）");

await browser.close();
console.log("\n全部通过。");
