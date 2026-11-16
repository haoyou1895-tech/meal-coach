/**
 * 自动化走查：截取关键页面，验证核心闭环能跑通。
 * 用法：node scripts/walkthrough.mjs
 * 需要先 npm run dev
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [console error]", m.text());
});
page.on("pageerror", (e) => console.log("  [page error]", e.message));

async function shot(name) {
  await sleep(450);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}`);
}

// 1. 首次进入：引导页
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("您是"));
await shot("01-onboarding")

// 2. 走完 8 题
const clickText = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes(t),
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
  if (!ok) throw new Error(`找不到按钮：${text}`);
  await sleep(260);
};

await clickText("女");
await clickText("下一步"); // → 年龄
await clickText("下一步"); // → 身高
await clickText("下一步"); // → 当前体重
await clickText("下一步"); // → 目标体重
await clickText("下一步"); // → 疾病
await clickText("脂肪肝");
await clickText("下一步"); // → 口味
await clickText("偏咸");
await clickText("下一步"); // → 三餐规律
await clickText("很规律");
await clickText("算一下");

await page.waitForFunction(() => document.body.innerText.includes("您每天可以吃"));
await shot("02-plan");

await clickText("开始");
await page.waitForFunction(() => document.body.innerText.includes("拍一张，记一餐"));
await shot("03-home-empty");

// 3. 造一张测试图片（画个盘子，模拟饭菜照片）
const foodPage = await browser.newPage();
await foodPage.setViewport({ width: 800, height: 800 });
await foodPage.setContent(`
  <body style="margin:0;background:#c9bda8;display:flex;align-items:center;justify-content:center;height:800px">
    <div style="width:560px;height:560px;border-radius:50%;background:#f6f4ef;box-shadow:inset 0 -12px 40px rgba(0,0,0,.08);position:relative">
      <div style="position:absolute;left:120px;top:150px;width:180px;height:130px;border-radius:50%;background:#e8dcc0"></div>
      <div style="position:absolute;left:280px;top:210px;width:160px;height:110px;border-radius:50%;background:#7a4a2b"></div>
      <div style="position:absolute;left:180px;top:300px;width:200px;height:90px;border-radius:50%;background:#5f8a3d"></div>
    </div>
  </body>`);
const foodPath = path.join(OUT, "food.jpg");
await foodPage.screenshot({ path: foodPath, type: "jpeg", quality: 80 });
await foodPage.close();
console.log("✓ 测试图片");

// 4. 拍照 → 上传 → 识别
await clickText("拍一张，记一餐");
await page.waitForFunction(() => document.body.innerText.includes("拍一张照片"));

// 先填一句文字描述，验证「先说明再拍照」是否被采纳
await page.evaluate(() => {
  const ta = document.querySelector("textarea");
  if (!ta) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(ta, "一碗米饭、红烧肉、番茄蛋汤");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(300);
await shot("04-camera-sheet");

const input = await page.$('input[type="file"]');
await input.uploadFile(foodPath);

await page.waitForFunction(
  () => document.body.innerText.includes("这一餐"),
  { timeout: 20000 },
);
await shot("05-result");

await clickText("记上了");
await page.waitForFunction(() => document.body.innerText.includes("今天吃了"));
await shot("06-home-with-meal");

// 5. 记录页
await clickText("记录");
await page.waitForFunction(() => document.body.innerText.includes("我的记录"));
await shot("07-record");

// 6. 刷新后数据是否还在
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("拍一张，记一餐"));
const persisted = await page.evaluate(() => {
  const raw = localStorage.getItem("mealcoach.v1");
  if (!raw) return 0;
  return JSON.parse(raw).meals?.length ?? 0;
});
console.log(`✓ 刷新后记录条数：${persisted}`);

await browser.close();
console.log("\n全部完成，截图在 .shots/");
process.exit(persisted > 0 ? 0 : 1);
