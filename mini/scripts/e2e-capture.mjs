/**
 * 端到端跑一次：从相册选图 → 压缩 → 调识别接口 → 结果页。
 * 只为验证链路，不产出交付物。跑完自己看 _preview/mini-capture-result.png。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const ROOT = join(process.cwd(), "dist-h5");
const PORT = 5181;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
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

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  // 浏览器有同源策略，localhost 直接打 canmou.net.cn 会被 CORS 拦掉。
  // 小程序不受这个限制（微信客户端发的请求），所以只在本地测试时关掉校验，
  // 后端那边不能为了预览去开 CORS —— 那等于把接口白送出去。
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-web-security",
    `--user-data-dir=${join(tmpdir(), "canmou-e2e")}`,
  ],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
});

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
page.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(0, 80), r.failure()?.errorText));

await page.evaluateOnNewDocument(() => {
  const state = {
    profile: {
      gender: "male", age: 46, heightCm: 172, weightKg: 78, targetWeightKg: 72,
      diseases: ["hypertension"], taste: "salty", mealRegular: "irregular",
      createdAt: new Date().toISOString().slice(0, 10),
    },
    meals: [],
    weights: [],
    activities: [],
    onboarded: true,
  };
  localStorage.setItem("mealcoach.v1", JSON.stringify({ data: JSON.stringify(state) }));
});

await page.goto(`http://127.0.0.1:${PORT}/#/pages/capture/index`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));

// 点「从相册选」
const [chooser] = await Promise.all([
  page.waitForFileChooser({ timeout: 15000 }),
  page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (n) => n.textContent?.trim() === "从相册选" && n.children.length === 0,
    );
    el?.closest("taro-view-core, div")?.click();
  }),
]);
await chooser.accept([
  join(process.cwd(), "..", "_preview", "_test-small.jpg"),
]);
await new Promise((r) => setTimeout(r, 2500));

console.log("选图后：", (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 120));

// 点「看看吃了啥」
await page.evaluate(() => {
  const el = [...document.querySelectorAll("*")].find(
    (n) => n.textContent?.trim() === "看看吃了啥" && n.children.length === 0,
  );
  el?.closest("taro-view-core, div")?.click();
});

const t = Date.now();
await page
  .waitForFunction(() => /存进|大卡/.test(document.body.innerText), { timeout: 70000 })
  .catch(() => console.log("等结果超时"));
console.log(`识别耗时 ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log("结果：", (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 400));

await page.screenshot({ path: join(process.cwd(), "..", "_preview", "mini-capture-result.png") });

await browser.close();
server.close();
