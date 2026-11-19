/**
 * 本地预览截图：把 dist-h5 起成静态服务，用手机尺寸截几张。
 *
 * 用途是「不用装微信开发者工具也能看到界面长什么样」，
 * 真正的验收还得在开发者工具和真机上看 —— h5 少了 tabBar、原生组件这些。
 *
 * 用法：npm run build:h5 && node scripts/shot-h5.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

// 直接用网页版装好的 puppeteer-core，小程序这边不再下一份
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ROOT = join(process.cwd(), "dist-h5");
const PORT = 5178;
const OUT = join(process.cwd(), "..", "_preview");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  let file = join(ROOT, url === "/" ? "index.html" : url);
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    try {
      const buf = await readFile(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const state = {
  profile: {
    gender: "male",
    age: 46,
    heightCm: 172,
    weightKg: 78,
    targetWeightKg: 72,
    diseases: ["hypertension"],
    taste: "salty",
    mealRegular: "irregular",
    createdAt: today,
  },
  meals: [
    {
      id: "m1",
      date: today,
      mealType: "breakfast",
      createdAt: `${today}T08:10:00`,
      eatenAt: `${today}T08:10:00`,
      items: [
        { name: "豆浆", portion: "一碗", kcal: 120 },
        { name: "油条", portion: "一根", kcal: 320 },
      ],
      nutrition: { kcal: 440, protein: 12, carb: 52, fat: 20, sodium: 760 },
      comment: "油炸的，下回换茶叶蛋",
      confidence: 0.8,
      adjusted: false,
      tags: ["out", "fried"],
    },
    {
      id: "m2",
      date: today,
      mealType: "lunch",
      createdAt: `${today}T12:40:00`,
      eatenAt: `${today}T12:40:00`,
      items: [
        { name: "米饭", portion: "一碗", kcal: 260 },
        { name: "红烧肉", portion: "五块", kcal: 460 },
        { name: "炒青菜", portion: "一盘", kcal: 90 },
      ],
      nutrition: { kcal: 810, protein: 26, carb: 72, fat: 47, sodium: 1180 },
      comment: "红烧肉太肥，下次两块就够",
      confidence: 0.85,
      adjusted: false,
      tags: ["out"],
    },
  ],
  weights: [
    { date: today, weightKg: 77.4 },
    { date: "2026-11-12", weightKg: 78 },
  ],
  activities: [{ date: today, level: "normal" }],
  onboarded: true,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--no-proxy-server"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
});

async function shot(name, page_, opts = {}) {
  const page = await browser.newPage();
  if (opts.inject !== false) {
    // Taro 的 h5 storage 存的是 {"data": 值}，不是裸值。
    // 直接写裸 JSON 读不出来，会静默变成空状态 —— 这个坑踩过一次。
    await page.evaluateOnNewDocument((s) => {
      localStorage.setItem("mealcoach.v1", JSON.stringify({ data: JSON.stringify(s) }));
    }, opts.state ?? state);
  } else {
    await page.evaluateOnNewDocument(() => localStorage.clear());
  }
  await page.goto(`http://127.0.0.1:${PORT}/#${opts.path ?? "/pages/index/index"}`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1600));
  await page.screenshot({ path: join(OUT, `mini-${name}.png`) });
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`[${name}] ` + text.slice(0, 200).replace(/\n+/g, " | "));
  await page.close();
}

await shot("home", null);
await shot("setup", null, { inject: false });
await shot("record", null, { path: "/pages/record/index" });
await shot("capture", null, { path: "/pages/capture/index" });

await browser.close();
server.close();
console.log("截图在 _preview/mini-*.png");
