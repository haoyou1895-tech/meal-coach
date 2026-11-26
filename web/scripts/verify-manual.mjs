/**
 * 验证「没拍照片，直接说」这条路。
 *
 * 要钉住的是"问对了单位"，不只是"能点通"：
 * 牛肉必须问斤两、米饭必须问碗、说了「一斤」不许再问一遍。
 * 这条路的失败方式很隐蔽 —— 问错单位他不会报错，他会随便选一个然后不信这个数。
 *
 * 用法：node scripts/verify-manual.mjs（需先 npm run dev）
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
  // 必须真的清空：clickCount:3 在受控 input 上偶尔选不中，
  // 结果就是新词拼在旧词后面（测出来一条「米饭一斤牛肉」）
  await input.evaluate((el) => el.select());
  await page.keyboard.press("Backspace");
  await input.type(value, { delay: 12 });
  await sleep(220);
};
/** 面板里所有档位按钮的文字 */
const presetLabels = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent || "").trim();
      return /^(几片|半斤|一斤|两斤|小半碗|一碗|两碗|小碗|大碗|一小碗|3 串|5 串|10 串|半个|一个|两个|三个|一杯|一瓶|一大瓶|几口|半盘|一盘|一小份|一份|大份)$/.test(t);
    });
    return btn.map((b) => (b.textContent || "").trim());
  });

/* ---------- 1. 从「记一餐」进去，能找到漏记的出口 ---------- */
console.log("一、入口");
if (!(await clickText("记一餐"))) throw new Error("主页找不到「记一餐」");
await sleep(900);
check("相机面板打开了", (await text()).includes("拍一张照片"));
check("有「没拍照？直接说」这条出口", (await text()).includes("没拍照？直接说"));

if (!(await clickText("没拍照？直接说"))) throw new Error("找不到漏记出口");
await sleep(800);
const t1 = await text();
check("进到了「没拍照片」面板", t1.includes("没拍照片"));
check("相机面板已经关掉，不是叠了两层", !t1.includes("拍一张照片"));

/* ---------- 2. 牛肉：必须问斤两 ---------- */
console.log("\n二、牛肉火锅（他的原例子）");
await typeInto("牛肉火锅");
const labels1 = await presetLabels();
check("问的是斤两，不是碗也不是克", labels1.includes("一斤") && labels1.includes("半斤"),
  `实际给了：${labels1.join("/")}`);
check("档位不多于 4 个（选得过来）", labels1.length <= 4, `${labels1.length} 个`);
await page.screenshot({ path: path.join(OUT, "manual-00-presets.png") });

if (!(await clickText("一斤"))) throw new Error("找不到「一斤」档位");
await sleep(200);
if (!(await clickText("添加"))) throw new Error("找不到「添加」");
// 真实调模型，等久一点
await page.waitForFunction(
  () => document.body.innerText.includes("一共 1 样"),
  { timeout: 30000 },
).catch(() => {});
const t2 = await text();
check("添加成功后出现在列表里", t2.includes("牛肉火锅"));
const kcalMatch = /(\d{3,4})\s*卡/.exec(t2);
const kcal = kcalMatch ? Number(kcalMatch[1]) : 0;
check("算出的是三位数以上的热量", kcal >= 800, `实际 ${kcal} 卡`);
check("一斤牛肉在 1000-1500 这个量级", kcal >= 1000 && kcal <= 1500, `实际 ${kcal} 卡`);
console.log(`    一斤牛肉火锅 → ${kcal} 大卡`);

/* ---------- 3. 米饭：同一套界面，问法必须换 ---------- */
console.log("\n三、换一样东西，问法要跟着变");
await typeInto("米饭");
const labels2 = await presetLabels();
check("米饭问的是碗", labels2.includes("一碗") && labels2.includes("小半碗"),
  `实际给了：${labels2.join("/")}`);
check("米饭不再问斤", !labels2.includes("一斤"), `还在问斤：${labels2.join("/")}`);

/* ---------- 4. 他自己说了量，不许再问 ---------- */
console.log("\n四、他说了「一斤」，就别再问一遍");
await typeInto("一斤牛肉");
const t3 = await text();
check("显示「按你说的算」", t3.includes("按你说的算"));
check("认出的单位是斤", /一斤/.test(t3));
check("这时不再摆档位按钮", (await presetLabels()).length === 0,
  `还给了 ${(await presetLabels()).join("/")}`);

/* ---------- 5. 两样加一起，总计要对 ---------- */
console.log("\n五、多样合计");
if (!(await clickText("添加"))) throw new Error("第二样找不到「添加」");
await page.waitForFunction(
  () => document.body.innerText.includes("一共 2 样"),
  { timeout: 30000 },
).catch(() => {});
const t4 = await text();
check("两样都在列表里", t4.includes("一共 2 样"), "没到两样");
/* 同样不能取第一个 —— 主页顶部那条额度排在面板前面 */
const kcalAll = [...t4.matchAll(/([\d,]+)\s*大卡/g)].map((m) =>
  Number(m[1].replace(/,/g, "")),
);
const totalNum = kcalAll.length ? kcalAll[kcalAll.length - 1] : 0;
check("给了合计", kcalAll.length > 0, "没显示总计");
check("合计比单样大（真加起来了）", totalNum > 1250, `合计只有 ${totalNum}`);
check(
  "名字里不重复含量（不出现「一斤牛肉　一斤」）",
  !t4.includes("一斤牛肉"),
  "名字没剥掉量",
);
console.log(`    合计显示：${totalNum} 大卡`);

await page.screenshot({ path: path.join(OUT, "manual-01-two-items.png") });

/* ---------- 6. 删掉一样 ---------- */
console.log("\n六、删错的那一样");
const before = (await text()).includes("一共 2 样");
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    (x.getAttribute("aria-label") || "").startsWith("删掉"),
  );
  b?.click();
});
await sleep(500);
const t5 = await text();
check("删除后只剩一样", before && t5.includes("一共 1 样"), "删除没生效");

/* ---------- 7. 确定之后真的进账本 ---------- */
console.log("\n七、保存");
/*
 * 不能取第一个"X 大卡" —— 面板是浮层，主页还在后面，
 * 顶部那条"今天还能吃 1719 大卡"排在更前面，会把它抢走。
 * 面板在 DOM 末尾，所以取最后一个才是这一顿的合计。
 */
const allKcal = [...t5.matchAll(/([\d,]+)\s*大卡/g)].map((m) =>
  Number(m[1].replace(/,/g, "")),
);
const savedKcal = allKcal.length ? allKcal[allKcal.length - 1] : 0;
console.log(`    页面上出现的「大卡」数字：${allKcal.join(" / ")}（取最后一个 ${savedKcal}）`);
if (!(await clickText("确定"))) throw new Error("找不到「确定」");
await sleep(1400);
const t6 = await text();
check("面板关掉了", !t6.includes("没拍照片"));
check("主页上出现了这顿的记录", t6.includes("一斤牛肉") || t6.includes("牛肉"),
  "主页没看到刚记的东西");

/* 存到本地的数跟界面显示的一致 —— 界面和账本对不上是最难查的一类错 */
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("mealcoach.v1");
  const s = raw ? JSON.parse(raw) : null;
  return s?.meals?.length ? s.meals : [];
});
check("localStorage 里多了一条记录", stored.length === 1, `实际 ${stored.length} 条`);
if (stored.length) {
  const m = stored[0];
  check("这条没有照片（本来就是没拍）",
    !m.photoIds && !m.image, "不该带图");
  check("餐次自动定了", !!m.mealType, "没定餐次");
  check("热量跟界面一致", Math.abs(m.nutrition.kcal - savedKcal) <= 1,
    `存的 ${m.nutrition.kcal}，界面 ${savedKcal}`);
  console.log(`    存下来：${m.items.length} 样，${m.nutrition.kcal} 大卡，餐次 ${m.mealType}`);
}

await page.screenshot({ path: path.join(OUT, "manual-02-saved.png") });
await browser.close();

console.log(
  errs.length
    ? `\n${errs.length} 项失败：\n  - ${errs.join("\n  - ")}`
    : "\n全部通过",
);
if (errs.length) process.exitCode = 1;
