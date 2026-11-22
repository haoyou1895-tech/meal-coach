/**
 * 验证"识别失败也不丢照片"在小程序版里同样成立。
 *
 * 第一次 /api/recognize 返回 502 → 失败页应该有照片、「再试一次」；
 * 点「再试一次」→ 第二次返回正常数据 → 应该进确认页。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ROOT = join(process.cwd(), "dist-h5");
const PORT = 5181;
const OUT = join(process.cwd(), "..", "_preview");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
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
  meals: [],
  weights: [{ date: today, weightKg: 77.4 }],
  activities: [{ date: today, level: "normal" }],
  onboarded: true,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // 页面在 127.0.0.1，接口在 canmou.net.cn，跨域会被拦。
  // 后端不能为本地预览开 CORS（等于白送接口），所以只在验证脚本里关掉同源策略。
  args: ["--no-sandbox", "--disable-gpu", "--no-proxy-server", "--disable-web-security"],
  userDataDir: join(process.env.TEMP || ".", "mini-verify-profile"),
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
});

let calls = 0;
const page = await browser.newPage();

await page.setRequestInterception(true);
page.on("request", (req) => {
  if (req.url().includes("/api/recognize")) {
    calls += 1;
    if (calls === 1) {
      return req.respond({ status: 502, contentType: "application/json", body: "{}" });
    }
    return req.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ name: "宫保鸡丁盖饭", portion: "1 碗", kcal: 580 }],
        nutrition: { kcal: 580, protein: 24, carb: 72, fat: 22, sodium: 1100 },
        confidence: 0.86,
      }),
    });
  }
  return req.continue();
});

await page.evaluateOnNewDocument((s) => {
  localStorage.setItem("mealcoach.v1", JSON.stringify({ data: JSON.stringify(s) }));
}, state);

await page.goto(`http://127.0.0.1:${PORT}/#/pages/capture/index`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 2000));

try {
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 8000 }),
    page.evaluate(() => {
      const el = document.querySelector(".shot-box");
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }),
  ]);
  await chooser.accept([join(OUT, "_v3-tiny.png")]);
} catch (e) {
  console.log("没弹文件选择器：", e.message);
}

await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: join(OUT, "_new-error.png"), fullPage: true });
const errText = await page.evaluate(() => document.body.innerText);

const hasRetry = errText.includes("再试一次");
if (hasRetry) {
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll(".btn-primary")).find((b) =>
      b.innerText.includes("再试一次"),
    );
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: join(OUT, "_new-retry.png"), fullPage: true });
  console.log("点了再试一次，识别请求次数 =", calls);
}

const after = await page.evaluate(() => document.body.innerText);
console.log(
  JSON.stringify(
    {
      失败页有再试一次: hasRetry,
      失败页有照片: errText.length > 0 && errText.includes("不用重拍"),
      重试后进确认页: after.includes("这一餐") || after.includes("宫保鸡丁盖饭"),
    },
    null,
    2,
  ),
);

await browser.close();
server.close();
