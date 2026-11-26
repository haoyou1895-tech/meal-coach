/**
 * 验证「本地查不到就问 AI」这一层。
 *
 * 要钉住的不是"能出档位"，是四条容易做错的事：
 * ① 本地命中（玉米）**不许发请求** —— 否则常见食物也要等 1 秒，白等
 * ② 长尾命中（小龙虾）先出现等待态，不能先摆一个错的兜底档位让他点
 * ③ 问过一次就进缓存，**第二次不许再发请求**
 * ④ AI 挂了要落回兜底，不能卡在"想想怎么量"上转圈
 *
 * 用法：node scripts/verify-portion.mjs（需先 npm run dev）
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

// 数一数到底调了几次 /api/portion —— 这是"缓存真的省了请求"的唯一证据
let portionReqs = 0;
/** 打开后把 portion 接口打死，用来测降级 */
let breakPortion = false;
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (url.includes("/api/portion")) {
    portionReqs++;
    if (breakPortion) {
      req.respond({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }
  }
  req.continue();
});

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

/**
 * 面板里的问法 + 档位。
 * 用"问法那一行"定位档位，不靠白名单正则 ——
 * AI 给的量词是无穷的（根、只、颗、盘…），白名单必然漏。
 */
const askBlock = () =>
  page.evaluate(() => {
    const heads = [...document.querySelectorAll("p")];
    const p = heads.find((el) => /^(吃了|喝了|想想)/.test((el.textContent || "").trim()));
    if (!p) return { prompt: "", presets: [] };
    const prompt = (p.textContent || "").trim();
    const row = p.nextElementSibling;
    const presets = row
      ? [...row.querySelectorAll("button")].map((b) => (b.textContent || "").trim())
      : [];
    return { prompt, presets };
  });

/** 等问法出现（AI 要 1~2 秒） */
const waitPrompt = (re, timeout = 20000) =>
  page
    .waitForFunction(
      (src) => {
        const heads = [...document.querySelectorAll("p")];
        const p = heads.find((el) => /^(吃了|喝了)/.test((el.textContent || "").trim()));
        return !!p && new RegExp(src).test((p.textContent || "").trim());
      },
      { timeout },
      re.source,
    )
    .then(() => true)
    .catch(() => false);

/* ---------- 0. 进面板 ---------- */
if (!(await clickText("记一餐"))) throw new Error("主页找不到「记一餐」");
await sleep(900);
if (!(await clickText("没拍照？直接说"))) throw new Error("找不到漏记出口");
await sleep(800);
check("进到了「没拍照片」面板", (await text()).includes("没拍照片"));

/* ---------- 1. 玉米：本地表命中，一次请求都不该发 ---------- */
console.log("\n一、玉米（本地表新加的，按根）");
await typeInto("玉米");
await sleep(260);
const t1 = await text();
check("没有转圈等待（本地就该瞬出）", !t1.includes("想想怎么量"));
const a1 = await askBlock();
check("问的是根，不是份", a1.prompt.includes("根"), `实际问法：${a1.prompt || "（空）"}`);
check("档位里有「一根」", a1.presets.some((x) => x.includes("一根")), a1.presets.join("/"));
check("本地命中没发请求", portionReqs === 0, `发了 ${portionReqs} 次`);
await page.screenshot({ path: path.join(OUT, "portion-01-corn.png") });

/* ---------- 2. 小龙虾：本地查不到，要走 AI ---------- */
console.log("\n二、小龙虾（本地查不到）");
await typeInto("小龙虾");
await sleep(200);
const t2 = await text();
check("先出现等待态，不摆错的兜底档位", t2.includes("想想怎么量"), "没看到等待提示");
const waitPresets = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .map((b) => (b.textContent || "").trim())
    .filter((t) => ["一小份", "一份", "大份"].includes(t)),
);
check("等待时不显示兜底档位（否则他会先点错）", waitPresets.length === 0, waitPresets.join("/"));

const ok2 = await waitPrompt(/吃了几只/);
const a2 = await askBlock();
check("AI 回来后问的是「只」", ok2 && a2.prompt.includes("只"), `实际问法：${a2.prompt || "（没出）"}`);
check("发了 1 次请求", portionReqs === 1, `实际 ${portionReqs} 次`);
check("档位 2~4 个", a2.presets.length >= 2 && a2.presets.length <= 4, `${a2.presets.length} 个`);
check(
  "档位文字干净（没有半个括号）",
  a2.presets.every((x) => !/[（(]/.test(x)),
  a2.presets.join(" / "),
);
await page.screenshot({ path: path.join(OUT, "portion-02-crayfish.png") });

/* ---------- 3. 同一个词再来一次：缓存命中，不许再发 ---------- */
console.log("\n三、小龙虾再输一次（该走缓存）");
await typeInto("小龙虾");
await sleep(260);
const t3 = await text();
check("立刻出问法，不再转圈", !t3.includes("想想怎么量"));
const a3 = await askBlock();
check("问法跟上次一样", a3.prompt === a2.prompt, `这次：${a3.prompt}`);
check("没有发出第二次请求", portionReqs === 1, `实际累计 ${portionReqs} 次`);

/* ---------- 4. 他自己说了量，就不许问 ---------- */
console.log("\n四、一斤牛肉（量已经在话里）");
await typeInto("一斤牛肉");
await sleep(300);
const t4 = await text();
check("显示「按你说的算」", t4.includes("按你说的算"));
const a4 = await askBlock();
check("不摆任何档位", a4.presets.length === 0, a4.presets.join("/"));
check("也没发请求（量都知道了，没什么好问的）", portionReqs === 1, `累计 ${portionReqs} 次`);

/* ---------- 5. AI 挂了：必须落到兜底，不能卡着 ---------- */
console.log("\n五、接口挂了（落回兜底）");
breakPortion = true;
// 必须挑一个本地表一个字都不命中的词。
// 上一版用「叉烧酥」，被 meat 类的「叉烧」吃掉了（问斤两）——
// 那不是降级失败，是本地表误伤，反而说明规则表就是会误伤。
await typeInto("提拉米苏");
await sleep(1800);
const t5 = await text();
check("没有一直卡在「想想怎么量」", !t5.includes("想想怎么量"));
const a5 = await askBlock();
check("给了兜底档位，功能没断", a5.presets.length === 3, `实际 ${a5.presets.join("/") || "（没有）"}`);
breakPortion = false;

/* ---------- 6. 走完整条路：选档位 → 算热量 → 进账 ---------- */
console.log("\n六、选一根玉米，真的算出来");
await typeInto("玉米");
await sleep(300);
if (!(await clickText("一根"))) throw new Error("找不到「一根」");
await sleep(200);
if (!(await clickText("添加"))) throw new Error("找不到「添加」");
await page
  .waitForFunction(() => document.body.innerText.includes("一共 1 样"), { timeout: 30000 })
  .catch(() => {});
const t6 = await text();
check("进了列表", t6.includes("玉米") && t6.includes("一根"), "没看到玉米 / 一根");
const kcal = /(\d{2,4})\s*卡/.exec(t6);
const n = kcal ? Number(kcal[1]) : 0;
check("热量在 60~200 之间（一根玉米的量级）", n >= 60 && n <= 200, `实际 ${n} 卡`);
await page.screenshot({ path: path.join(OUT, "portion-03-saved.png") });

/* ---------- 收尾 ---------- */
await browser.close();
console.log(`\n${errs.length === 0 ? "全部通过" : `${errs.length} 项失败`}（共 ${portionReqs} 次 /api/portion 请求）`);
if (errs.length) {
  console.log(errs.map((e) => ` - ${e}`).join("\n"));
  process.exitCode = 1;
}
