/**
 * 并排对比：网页版（线上）vs 小程序（h5 编译产物），同一份数据、同一个视口。
 *
 * 复刻是不是"一模一样"，眼睛说了不算，得两张截图挨着放。
 * 输出 _preview/cmp-top.png（首屏）和 cmp-mid.png（滚动到餐卡）。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ROOT = join(process.cwd(), "dist-h5");
const PORT = 5177;
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
  const file = join(ROOT, url === "/" ? "index.html" : url);
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    const buf = await readFile(join(ROOT, "index.html"));
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(buf);
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

async function grab(url, injector, name, opts = {}) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(injector, state);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  // 网页版是 PWA，首屏要等 hydration 完才出内容；不等的话截到的是启动页
  await page.waitForSelector("header", { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  if (opts.tab) {
    // 网页版的「记录」不是路由，是同一个页面里换 tab，只能点
    await page.evaluate((label) => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === label,
      );
      btn?.click();
    }, opts.tab);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const out = [];
  for (const [suffix, y] of opts.stops ?? [
    ["top", 0],
    ["mid", 520],
  ]) {
    const probe = await page.evaluate((yy) => {
      window.scrollTo(0, yy);
      const box = document.querySelector(".taro_page");
      if (box) box.scrollTop = yy;
      const app = document.getElementById("app");
      if (app && app.scrollHeight > app.clientHeight) app.scrollTop = yy;
      const hd = document.querySelector(".hd") || document.querySelector("header");
      const r = hd ? hd.getBoundingClientRect() : null;
      return {
        scrollY: window.scrollY,
        boxTop: box ? box.scrollTop : null,
        hdTop: r ? Math.round(r.top) : null,
        hdH: r ? Math.round(r.height) : null,
        docH: document.documentElement.scrollHeight,
      };
    }, y);
    console.log(name, suffix, JSON.stringify(probe));
    await new Promise((r) => setTimeout(r, 500));
    const p = join(OUT, `_cmp-${name}-${suffix}.png`);
    await page.screenshot({ path: p });
    out.push(p);
  }
  await page.close();
  return out;
}

// 网页版：localStorage 里直接是 JSON
const webInject = (s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify(s));
  localStorage.setItem("mealcoach.installHint", "off");
};
// 小程序 h5：Taro 的 storage 外面还包一层 { data }
const miniInject = (s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify({ data: JSON.stringify(s) }));
};

const web = await grab("https://canmou.net.cn", webInject, "web");
const mini = await grab(`http://127.0.0.1:${PORT}/#/pages/index/index`, miniInject, "mini");

const webRec = await grab("https://canmou.net.cn", webInject, "web-rec", { tab: "记录" });
const miniRec = await grab(`http://127.0.0.1:${PORT}/#/pages/record/index`, miniInject, "mini-rec");

async function stitch(aPath, bPath, out) {
  const [a, b] = await Promise.all([readFile(aPath), readFile(bPath)]);
  const html =
    `<html><body style="margin:0;background:#dfe3e0;font:600 13px sans-serif;color:#444">` +
    `<div style="display:flex;gap:14px;padding:14px">` +
    `<div><div style="padding:4px 0">网页版</div><img src="data:image/png;base64,${a.toString("base64")}" style="width:390px;display:block;border:1px solid #b9c2bd"></div>` +
    `<div><div style="padding:4px 0">小程序</div><img src="data:image/png;base64,${b.toString("base64")}" style="width:390px;display:block;border:1px solid #b9c2bd"></div>` +
    `</div></body></html>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 822, height: 900, deviceScaleFactor: 1.6 });
  await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(html), { waitUntil: "load" });
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await stitch(web[0], mini[0], join(OUT, "cmp-top.png"));
await stitch(web[1], mini[1], join(OUT, "cmp-mid.png"));
await stitch(webRec[0], miniRec[0], join(OUT, "cmp-rec.png"));

await browser.close();
server.close();
console.log("对比图：_preview/cmp-top.png / cmp-mid.png / cmp-rec.png");
