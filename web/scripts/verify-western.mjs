/**
 * 验证西餐这条路走得通。
 *
 * 起因：用户问「是不是没有西餐的食谱」。真实情况不是缺数据，
 * 是三个提示词都只教了中餐 —— 汉堡被按「一份家常菜 200 大卡」估成 250。
 *
 * 这个脚本钉住两件事：
 * ① 牛排必须问「块」，不能问斤两（它原来在 meat 类里）
 * ② 走完之后账本上的数字要在正确量级（汉堡 500-650，牛排 350-550）
 *
 * 用法：node scripts/verify-western.mjs（需先 npm run dev）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = {
  profile: {
    gender: "male", age: 46, heightCm: 172, weightKg: 78, targetWeightKg: 68,
    diseases: ["hypertension"], taste: "salty", mealRegular: "irregular",
    createdAt: new Date().toISOString(),
  },
  meals: [], weights: [], activities: [], exercises: [],
  closedDays: [], exercisePlans: [], onboarded: true,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const errs = [];
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    errs.push(name);
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ""}`);
  }
};

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [page error]", e.message));
await page.evaluateOnNewDocument((s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify(s));
}, STATE);
await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(2600);

const text = () => page.evaluate(() => document.body.innerText);
const clickText = (t) =>
  page.evaluate((want) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === want,
    );
    if (!b) return false;
    b.click();
    return true;
  }, t);

const typeInto = async (value) => {
  const input = await page.$('input[type="text"], input:not([type])');
  await input.click();
  await input.evaluate((el) => el.select());
  await page.keyboard.press("Backspace");
  await input.type(value, { delay: 12 });
};

const askBlock = () =>
  page.evaluate(() => {
    const p = [...document.querySelectorAll("p")].find((el) =>
      /^(吃了|喝了|想想)/.test((el.textContent || "").trim()),
    );
    if (!p) return { prompt: "", presets: [] };
    const row = p.nextElementSibling;
    return {
      prompt: (p.textContent || "").trim(),
      presets: row
        ? [...row.querySelectorAll("button")].map((b) => (b.textContent || "").trim())
        : [],
    };
  });

/** 点第 n 个档位（AI 给的 label 不固定，只能按位置点） */
const clickPreset = (idx) =>
  page.evaluate((i) => {
    const p = [...document.querySelectorAll("p")].find((el) =>
      /^(吃了|喝了)/.test((el.textContent || "").trim()),
    );
    const row = p?.nextElementSibling;
    const btns = row ? [...row.querySelectorAll("button")] : [];
    if (!btns[i]) return null;
    const label = (btns[i].textContent || "").trim();
    btns[i].click();
    return label;
  }, idx);

const totalKcal = () =>
  page.evaluate(() => {
    // 面板在 DOM 末尾，取最后一个「X 大卡」才是合计
    const all = [...document.body.innerText.matchAll(/([\d,]+)\s*大卡/g)];
    if (!all.length) return 0;
    return Number(all[all.length - 1][1].replace(/,/g, ""));
  });

/* ---------- 进面板 ---------- */
if (!(await clickText("记一餐"))) throw new Error("找不到「记一餐」");
await sleep(900);
if (!(await clickText("没拍照？直接说"))) throw new Error("找不到漏记出口");
await sleep(800);
check("进到了「没拍照片」面板", (await text()).includes("没拍照片"));

/* ---------- 1. 牛排：必须按块，不能按斤两 ---------- */
console.log("\n一、牛排（原来被当成『买半斤』）");
await typeInto("牛排");
await sleep(320);
const a1 = await askBlock();
check("问的是「块」，不是斤两", a1.prompt.includes("块"), `实际问法：${a1.prompt}`);
check(
  "档位里没有半斤/一斤",
  !a1.presets.some((x) => /斤|两/.test(x)),
  a1.presets.join(" / "),
);
const picked1 = await clickPreset(1); // 中间那档 = 一块
check("中间档是「一块」这种说法", !!picked1, `拿到 ${picked1}`);
await page.screenshot({ path: path.join(OUT, "western-01-steak.png") });

await sleep(180);
if (!(await clickText("添加"))) throw new Error("找不到「添加」");
await page
  .waitForFunction(() => document.body.innerText.includes("一共 1 样"), { timeout: 30000 })
  .catch(() => {});
const k1 = await totalKcal();
check("一块牛排 350~550 大卡（原来 320 偏小）", k1 >= 350 && k1 <= 550, `实际 ${k1} 大卡`);

/* ---------- 2. 汉堡：本地不收，走 AI 问「个」 ---------- */
console.log("\n二、汉堡（本地表刻意不收，交给 AI）");
await typeInto("汉堡");
await page
  .waitForFunction(
    () => {
      const p = [...document.querySelectorAll("p")].find((el) =>
        /^(吃了|喝了)/.test((el.textContent || "").trim()),
      );
      return !!p;
    },
    { timeout: 20000 },
  )
  .catch(() => {});
const a2 = await askBlock();
check("问法里有「个」", a2.prompt.includes("个"), `实际问法：${a2.prompt}`);
check("档位 2~4 个", a2.presets.length >= 2 && a2.presets.length <= 4, a2.presets.join(" / "));

// 取中间那档 = 一个常规汉堡
const mid = Math.floor(a2.presets.length / 2);
await clickPreset(mid);
await sleep(180);
if (!(await clickText("添加"))) throw new Error("找不到「添加」");
await page
  .waitForFunction(() => document.body.innerText.includes("一共 2 样"), { timeout: 30000 })
  .catch(() => {});
const k2 = await totalKcal() - k1;
check("汉堡 450~700 大卡（改前只算 250，少一半）", k2 >= 450 && k2 <= 700, `实际 ${k2} 大卡`);
await page.screenshot({ path: path.join(OUT, "western-02-burger.png") });

await browser.close();
console.log(`\n${errs.length === 0 ? "全部通过" : `${errs.length} 项失败`}`);
if (errs.length) {
  console.log(errs.map((e) => ` - ${e}`).join("\n"));
  process.exitCode = 1;
}
