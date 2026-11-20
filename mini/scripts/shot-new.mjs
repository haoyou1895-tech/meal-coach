/**
 * 截新页面的图：设置、记一餐、改记录。
 * 只为"看一眼对不对"，不复刻对比。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ROOT = join(process.cwd(), "dist-h5");
const PORT = 5179;
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
  ],
  weights: [{ date: today, weightKg: 77.4 }],
  activities: [{ date: today, level: "normal" }],
  onboarded: true,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--no-proxy-server"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
});

const miniInject = (s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify({ data: JSON.stringify(s) }));
};

async function grab(path, name, after) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(miniInject, state);
  await page.goto(`http://127.0.0.1:${PORT}/#${path}`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 2000));
  if (after) {
    await page.evaluate(after);
    await new Promise((r) => setTimeout(r, 800));
  }
  const p = join(OUT, `_new-${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  await page.close();
  console.log(p);
}

await grab("/pages/settings/index", "settings");
await grab("/pages/record/index", "record");
await grab("/pages/capture/index", "capture");
await grab("/pages/record/index", "record-edit", () => {
  // 点第一行的「改」：图标按钮没有文字，按 aria-label 找不到，取 .rec-act.is-edit
  const btn = document.querySelector(".rec-act.is-edit");
  btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

await browser.close();
server.close();
