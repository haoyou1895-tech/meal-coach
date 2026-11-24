/**
 * 验证「使用概况」和微信环境下的表现。
 *
 * 起因：舅舅用微信打开，点「导出文件」什么也没发生 —— 微信内置浏览器
 * （X5 / WKWebView）不给 a[download] 落地。旧代码不管成没成都说"存好了"，
 * 那是撒谎。这个脚本就钉住两件事：
 *
 * 1) 微信 UA 下，导出必须**明说不行**，并且不能偷偷落文件
 * 2) 概况在任何环境都能拿到：码 < 200 字，数字对得上真实记录
 *
 * 用法：node scripts/verify-digest.mjs（需先 npm run dev）
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".shots");
const DL = path.join(OUT, "downloads-digest");
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const WECHAT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2c) NetType/WIFI Language/zh_CN";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayStr = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
};

const PROFILE = {
  gender: "male", age: 46, heightCm: 172, weightKg: 78, targetWeightKg: 68,
  diseases: ["hypertension"], taste: "salty", mealRegular: "irregular",
  createdAt: new Date().toISOString(),
};
const ITEMS = [
  { name: "番茄炒蛋", portion: "一盘", kcal: 220, seen: true },
  { name: "白米饭", portion: "一碗", kcal: 230, seen: true },
];
const NUTRITION = { kcal: 450, protein: 20, carb: 60, fat: 16, sodium: 900 };

/* 8 天 × 3 顿 —— 跟他的真实量级一致 */
const MEALS = [];
for (let d = 0; d < 8; d++) {
  for (const t of ["breakfast", "lunch", "dinner"]) {
    MEALS.push({
      id: `m${d}-${t}`, date: dayStr(d), mealType: t, items: ITEMS,
      nutrition: NUTRITION, comment: "油偏多。", adjusted: false,
      confidence: 0.82, createdAt: new Date().toISOString(),
    });
  }
}

const STATE = {
  profile: PROFILE, meals: MEALS,
  weights: [
    { date: dayStr(6), weightKg: 78.2 },
    { date: dayStr(3), weightKg: 77.9 },
    { date: dayStr(0), weightKg: 77.6 },
  ],
  activities: [],
  exercises: [
    { id: "e1", date: dayStr(1), kind: "walk", minutes: 30, amount: 2.1 },
    { id: "e2", date: dayStr(2), kind: "rope", minutes: 10, amount: 1000 },
  ],
  closedDays: [{ date: dayStr(2), at: new Date().toISOString() }],
  exercisePlans: [], onboarded: true,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: {
    width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  },
});

const errs = [];
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    errs.push(name);
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ""}`);
  }
}

const clickText = (page, t) =>
  page.evaluate((text) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === text,
    );
    if (!b) return false;
    b.click();
    return true;
  }, t);

const bodyText = (page) => page.evaluate(() => document.body.innerText);

/** 概况在设置页最底下，不滚下来截不到 —— 截图要能看见才算验过外观 */
const scrollToDigest = async (page) => {
  await page.evaluate(() => {
    const label = [...document.querySelectorAll("span")].find(
      (s) => (s.textContent || "").trim() === "使用概况",
    );
    label?.scrollIntoView({ block: "start" });
  });
  await sleep(500);
};

async function openPage(ua) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  if (ua) await page.setUserAgent(ua);
  await page.evaluateOnNewDocument((s) => {
    if (!localStorage.getItem("mealcoach.v1")) {
      localStorage.setItem("mealcoach.v1", JSON.stringify(s));
    }
  }, STATE);
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", {
    behavior: "allow", downloadPath: DL, eventsEnabled: true,
  });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(2800);
  await page.click('[aria-label="设置"]');
  await page.waitForFunction(() => document.body.innerText.includes("搬家"), {
    timeout: 8000,
  });
  await sleep(600);
  return page;
}

/* ============ 一、普通浏览器：基线 ============ */
console.log("一、普通浏览器");
const p1 = await openPage(null);
check("设置页出现「使用概况」", (await bodyText(p1)).includes("使用概况"));
check(
  "概况说明写清了不含什么",
  (await bodyText(p1)).includes("不含你吃了什么"),
);

if (!(await clickText(p1, "复制"))) throw new Error("找不到概况的「复制」按钮");
await sleep(900);

const shot1 = path.join(OUT, "digest-01-normal.png");
await scrollToDigest(p1);
await p1.screenshot({ path: shot1 });

const code = await p1.evaluate(() => {
  // 码是等宽那一行：找出 body 里唯一一个以 {"v":1 开头的文本片段
  const all = [...document.querySelectorAll("p")].map((p) => p.textContent || "");
  return all.find((t) => t.trim().startsWith('{"v":1')) || "";
});

check("码出现了", code.length > 0);
check("码够短，微信一条消息能发", code.length < 200, `实际 ${code.length} 字`);

let d = null;
try {
  d = JSON.parse(code);
} catch {
  check("码是合法 JSON", false);
}
if (d) {
  check("码是合法 JSON", true);
  check(`天数对得上（8 天）`, d.days === 8, `实际 ${d.days}`);
  check(`餐数对得上（24 顿）`, d.meals === 24, `实际 ${d.meals}`);
  check(`最长连续 8 天`, d.best === 8, `实际 ${d.best}`);
  check("中途没断档", d.gaps === 0, `实际 ${d.gaps}`);
  check("体重记了 3 次", d.w === 3, `实际 ${d.w}`);
  check("运动记了 2 次", d.ex === 2, `实际 ${d.ex}`);
  check("运动共 40 分钟", d.exm === 40, `实际 ${d.exm}`);
  check("收工 1 天", d.close === 1, `实际 ${d.close}`);
  const leak = ["name", "番茄炒蛋", "weightKg", "kg", "diseases", "hypertension"];
  check(
    "没有把菜名/体重/病史漏进码里",
    !leak.some((k) => code.includes(k)),
    `码里出现了：${leak.filter((k) => code.includes(k)).join(",")}`,
  );
  console.log(`    码（${code.length} 字）：${code}`);
}

const txt1 = await bodyText(p1);
check(
  "界面上有一行中文摘要",
  /记了 \d+ 天 \d+ 顿/.test(txt1),
  "没找到摘要",
);

/* 普通浏览器里导出该照旧能落文件 */
const before = fs.readdirSync(DL).length;
if (await clickText(p1, "导出文件")) {
  await sleep(2000);
}
const after = fs.readdirSync(DL).filter((f) => f.endsWith(".json")).length;
check("普通浏览器里导出文件仍然能落盘", after > before, `落盘 ${after} 个`);

/* ============ 二、微信 UA：必须明说不行 ============ */
console.log("\n二、微信内置浏览器");
const p2 = await openPage(WECHAT_UA);

const txt2 = await bodyText(p2);
check(
  "搬家那块改口说「在浏览器打开」",
  txt2.includes("在浏览器打开"),
  "说明文字还是旧的那句",
);
check(
  "不再教人往微信存文件",
  !txt2.includes("存到微信「文件传输助手」最稳"),
);

const n0 = fs.readdirSync(DL).filter((f) => f.endsWith(".json")).length;
if (!(await clickText(p2, "导出文件"))) throw new Error("微信 UA 下找不到「导出文件」");
await sleep(2500);
const n1 = fs.readdirSync(DL).filter((f) => f.endsWith(".json")).length;

check("微信里点了导出，没有偷偷落一个假文件", n1 === n0, `多了 ${n1 - n0} 个`);
const txt2b = await bodyText(p2);
check(
  "微信里明确说存不了，不是假装成功",
  txt2b.includes("微信里存不了文件"),
  "提示没出现",
);
check(
  "微信里不再出现「存好了」这种假话",
  !txt2b.includes("存好了"),
  "还在撒谎",
);

/* 微信里概况这条路必须还能走 */
if (!(await clickText(p2, "复制"))) throw new Error("微信 UA 下找不到概况的「复制」");
await sleep(900);
const code2 = await p2.evaluate(() => {
  const all = [...document.querySelectorAll("p")].map((p) => p.textContent || "");
  return all.find((t) => t.trim().startsWith('{"v":1')) || "";
});
check("微信里也能拿到概况码", code2.length > 0, "码没出现");
check("微信里拿到的码和普通浏览器一致", code2 === code, `两边不一样`);

const shot2 = path.join(OUT, "digest-02-wechat.png");
await scrollToDigest(p2);
await p2.screenshot({ path: shot2 });

await browser.close();

console.log(
  errs.length
    ? `\n${errs.length} 项失败：\n  - ${errs.join("\n  - ")}`
    : "\n全部通过",
);
if (errs.length) process.exitCode = 1;
