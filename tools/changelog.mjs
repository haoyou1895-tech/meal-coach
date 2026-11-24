#!/usr/bin/env node
/**
 * 版本记录生成器。
 *
 *   node tools/changelog.mjs           校验 + 生成
 *   node tools/changelog.mjs --check   只校验，不写文件（提交前用）
 *
 * 输入：docs/versions.json（唯一数据源，手写）
 * 输出：docs/08-版本记录.md 里的表格段、docs/changelog.html
 *
 * 为什么要有这个脚本：同一份版本记录如果 md 表格和 HTML 各写一份，
 * 必然有一处先过期。所以只留一个 json，其余全是生成物。
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs", "versions.json");
const MD = path.join(ROOT, "docs", "08-版本记录.md");
const HTML = path.join(ROOT, "docs", "changelog.html");
// 再写一份到站点静态目录：这样发个链接就能看，面试时不用发截图
const HTML_WEB = path.join(ROOT, "web", "public", "changelog.html");
const CHECK_ONLY = process.argv.includes("--check");

const KINDS = {
  feat: { label: "新增", color: "#3f9d74" },
  fix: { label: "修正", color: "#c4694a" },
  refactor: { label: "重构", color: "#5b7fa6" },
};

/* ---------------- 读 ---------------- */
let data;
try {
  data = JSON.parse(fs.readFileSync(SRC, "utf8"));
} catch (e) {
  console.error("✗ 读不了 docs/versions.json：" + e.message);
  process.exit(1);
}
const versions = data.versions;

/* ---------------- 校验 ---------------- */
const errors = [];

// 拿全量 40 位哈希，校验时按前缀匹配 —— 短哈希写 6 位还是 7 位都能对上
const hashes = (() => {
  try {
    return execSync("git rev-list --all", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null; // 没有 git 就跳过这一项
  }
})();

const minor = (v) => parseInt(v.split(".")[1], 10);
const seen = new Set();

versions.forEach((v, i) => {
  const at = `第 ${i + 1} 条（v${v.version}）`;
  if (!/^0\.\d+$/.test(v.version)) errors.push(`${at} 版本号不是 0.N`);
  if (seen.has(v.version)) errors.push(`${at} 版本号重复`);
  seen.add(v.version);
  if (i > 0 && minor(v.version) !== minor(versions[i - 1].version) + 1)
    errors.push(`${at} 版本号不连续，上一条是 v${versions[i - 1].version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "")) errors.push(`${at} 日期格式错`);
  if (i > 0 && v.date < versions[i - 1].date) errors.push(`${at} 日期比上一条早`);
  if (!/^[0-9a-f]{6,40}$/.test(v.commit ?? "")) errors.push(`${at} commit 不是短哈希`);
  else if (hashes && !hashes.some((h) => h.startsWith(v.commit)))
    errors.push(`${at} commit ${v.commit} 在 git 里找不到`);
  if (!KINDS[v.kind]) errors.push(`${at} kind 只能是 feat / fix / refactor`);
  if (!v.title || v.title.length < 4) errors.push(`${at} 标题太短`);
  if (v.title.length > 24) errors.push(`${at} 标题超过 24 字，写不下一行`);
  if (!v.detail || v.detail.length < 10)
    errors.push(`${at} detail 太短 —— 写不出具体变化的改动，本来就不该发`);
});

if (errors.length) {
  console.error("✗ 版本记录有问题：");
  for (const e of errors) console.error("  · " + e);
  process.exit(1);
}
console.log(`✓ 校验通过：${versions.length} 个版本`);

/* ---------------- 节奏提醒（不拦，只问） ----------------
 * H23：版本号记的是他验收通过的那一下，一天一个就够。
 * 同一天挤了好几个号，通常不是"那天做了很多事"，而是修补硬占了号 ——
 * 但也不能一概拦下，所以只提醒，退出码仍是 0。
 */
const perDay = versions.reduce((m, v) => ((m[v.date] = (m[v.date] || 0) + 1), m), {});
const crowded = Object.entries(perDay).filter(([, n]) => n > 1);
if (crowded.length) {
  console.log("\n  节奏提醒：这些天记了不止一个版本");
  for (const [d, n] of crowded) console.log(`    · ${d}　${n} 个`);
  console.log("  一句话讲得出来才占号；修补可以并进当天那条（H23）");
}

if (CHECK_ONLY) process.exit(0);

/* ---------------- 统计 ---------------- */
const totalCommits = (() => {
  try {
    return execSync("git rev-list --count HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();
const days =
  Math.round(
    (new Date(versions.at(-1).date) - new Date(versions[0].date)) / 86400000,
  ) + 1;
const current = versions.at(-1).version;

/* ---------------- 生成 md 表格 ---------------- */
const mdRows = versions
  .map((v) => {
    const mmdd = v.date.slice(5).replace("-", "-");
    const star = v.milestone ? "**" : "";
    // 表格只放一句人话。detail 在 json 和 html 里，表格是扫读用的，
    // 塞进去会变成"标题 —— 细节"两个破折号，反而难读
    return `| ${star}v${v.version}${star} | ${mmdd} | \`${v.commit}\` | ${v.title} |`;
  })
  .join("\n");

const mdBlock = `<!-- VERSIONS:BEGIN 这段由 tools/changelog.mjs 从 docs/versions.json 生成，别手改 -->

| 版本 | 日期 | commit | 一句话 |
|---|---|---|---|
${mdRows}

**当前线上：v${current}**　·　共 ${versions.length} 个版本　·　${days} 天

<!-- VERSIONS:END -->`;

let md = fs.readFileSync(MD, "utf8");
const B = "<!-- VERSIONS:BEGIN";
const E = "<!-- VERSIONS:END -->";
const bi = md.indexOf(B);
const ei = md.indexOf(E);
if (bi < 0 || ei < 0) {
  console.error("✗ docs/08-版本记录.md 里找不到 VERSIONS:BEGIN / END 标记");
  process.exit(1);
}
md = md.slice(0, bi) + mdBlock + md.slice(ei + E.length);
fs.writeFileSync(MD, md, "utf8");
console.log("✓ 已重写 docs/08-版本记录.md 的表格段");

/* ---------------- 生成 html ---------------- */
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 按日期分组，同一天的版本并到一个日期块里
const groups = [];
for (const v of versions) {
  const last = groups.at(-1);
  if (last && last.date === v.date) last.items.push(v);
  else groups.push({ date: v.date, items: [v] });
}
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const fmt = (d) => {
  const [y, m, dd] = d.split("-");
  const wd = weekdays[new Date(d + "T00:00:00").getDay()];
  return { md: `${+m} 月 ${+dd} 日`, wd, y };
};

const dayBlocks = groups
  .map((g, gi) => {
    const f = fmt(g.date);
    const cards = g.items
      .map((v) => {
        const k = KINDS[v.kind];
        return `
        <article class="card${v.milestone ? " is-milestone" : ""}" data-kind="${v.kind}" data-milestone="${v.milestone ? 1 : 0}">
          <div class="card-head">
            <span class="ver">v${esc(v.version)}</span>
            <span class="kind" style="--kc:${k.color}">${k.label}</span>
            ${v.milestone ? `<span class="star">节点</span>` : ""}
            <span class="hash">${esc(v.commit)}</span>
          </div>
          <h3>${esc(v.title)}</h3>
          <p>${esc(v.detail)}</p>
        </article>`;
      })
      .join("");
    return `
      <section class="day">
        <div class="day-label">
          <span class="day-md">${f.md}</span>
          <span class="day-wd">${f.wd}</span>
          <span class="day-y">${f.y}</span>
        </div>
        <div class="day-cards">${cards}</div>
      </section>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>餐谋 · 版本记录</title>
<style>
  :root{
    --bg:#f5f7f4; --card:#fff; --ink:#1c2320; --ink-2:#4c554f; --ink-3:#8a938d;
    --line:#e2e7e2; --brand:#3f9d74; --brand-deep:#176f49; --brand-soft:#eaf4ee;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:840px;margin:0 auto;padding:56px 22px 96px}

  header.hero{margin-bottom:40px}
  .eyebrow{color:var(--brand-deep);font-size:13px;font-weight:600;letter-spacing:.08em}
  h1{font-size:34px;line-height:1.25;margin:10px 0 12px;letter-spacing:-.02em}
  .lede{color:var(--ink-2);font-size:15px;max-width:52ch;margin:0}
  .stats{display:flex;gap:44px;margin-top:26px;padding:18px 24px;background:var(--card);
    border:1px solid var(--line);border-radius:16px}
  .stat b{display:block;font-size:26px;line-height:1.2;font-variant-numeric:tabular-nums}
  .stat span{font-size:12px;color:var(--ink-3)}

  .filter{display:flex;gap:8px;margin:28px 0 8px;flex-wrap:wrap}
  .filter button{
    border:1px solid var(--line);background:var(--card);color:var(--ink-2);
    padding:6px 14px;border-radius:999px;font:inherit;font-size:13px;cursor:pointer;
  }
  .filter button[aria-pressed="true"]{background:var(--brand-deep);border-color:var(--brand-deep);color:#fff}

  .timeline{margin-top:22px}
  .day{display:grid;grid-template-columns:104px 1fr;gap:20px;position:relative}
  .day + .day{margin-top:6px}
  .day::before{content:"";position:absolute;left:99px;top:0;bottom:0;width:1px;background:var(--line)}
  .day:last-child::before{bottom:calc(100% - 34px)}
  .day-label{position:relative;padding-top:12px;text-align:right;padding-right:22px}
  .day-label::after{content:"";position:absolute;right:-4px;top:17px;width:9px;height:9px;
    border-radius:50%;background:var(--brand);box-shadow:0 0 0 3px var(--bg)}
  .day-md{display:block;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .day-wd{display:block;font-size:11px;color:var(--ink-3)}
  .day-y{display:block;font-size:10px;color:var(--ink-3);opacity:.7}

  .day-cards{padding-bottom:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
  .card + .card{margin-top:10px}
  .card.is-milestone{border-color:#cfe4d8;box-shadow:inset 3px 0 0 var(--brand)}
  .card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .ver{font-weight:700;font-size:13px;color:var(--brand-deep);font-variant-numeric:tabular-nums}
  .kind{font-size:11px;padding:1px 7px;border-radius:5px;color:var(--kc);
    background:color-mix(in srgb,var(--kc) 12%,#fff)}
  .star{font-size:11px;padding:1px 7px;border-radius:5px;color:#fff;background:var(--brand)}
  .hash{margin-left:auto;font-size:11px;color:var(--ink-3);font-family:ui-monospace,Consolas,monospace}
  .card h3{margin:0 0 4px;font-size:16px;line-height:1.45;letter-spacing:-.01em}
  .card p{margin:0;font-size:13.5px;color:var(--ink-2);line-height:1.7}

  .hidden{display:none}
  footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);
    font-size:12px;color:var(--ink-3);line-height:1.9}
  code{font-family:ui-monospace,Consolas,monospace;background:var(--brand-soft);
    padding:1px 5px;border-radius:4px;font-size:12px;color:var(--brand-deep)}

  @media (max-width:640px){
    .wrap{padding:36px 16px 72px}
    h1{font-size:26px}
    .stats{gap:26px 34px;padding:16px;flex-wrap:wrap}
    .stat b{font-size:21px}
    .day{grid-template-columns:1fr;gap:8px}
    .day::before{display:none}
    .day-label{text-align:left;padding:0;display:flex;align-items:baseline;gap:8px}
    .day-label::after{display:none}
    .day-md,.day-wd,.day-y{display:inline}
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="eyebrow">餐谋 · CHANGELOG</div>
    <h1>${versions.length} 次上线，${days} 天</h1>
    <p class="lede">每一行都能在 <code>git log</code> 里对上。一个版本 = 一次推到线上、他自己能看见变化的改动；改了没发的不算，纯内部改动不占号。</p>
    <div class="stats">
      <div class="stat"><b>${versions.length}</b><span>个版本</span></div>
      <div class="stat"><b>${totalCommits ?? "—"}</b><span>次提交</span></div>
      <div class="stat"><b>${days}</b><span>天</span></div>
      <div class="stat"><b>v${current}</b><span>当前线上</span></div>
    </div>
  </header>

  <div class="filter">
    <button aria-pressed="true" data-f="all">全部</button>
    <button aria-pressed="false" data-f="milestone">只看节点</button>
    <button aria-pressed="false" data-f="fix">只看修正</button>
    <button aria-pressed="false" data-f="feat">只看新增</button>
  </div>

  <div class="timeline">${dayBlocks}</div>

  <footer>
    数据源 <code>docs/versions.json</code>；这个页面和 <code>docs/08</code> 的表格都是
    <code>node tools/changelog.mjs</code> 生成的，别手改。<br>
    生成时间 ${(() => {
      const n = new Date();
      const z = (x) => String(x).padStart(2, "0");
      return `${n.getFullYear()}-${z(n.getMonth() + 1)}-${z(n.getDate())} ${z(n.getHours())}:${z(n.getMinutes())}`;
    })()}
  </footer>
</div>

<script>
  const btns = [...document.querySelectorAll(".filter button")];
  const cards = [...document.querySelectorAll(".card")];
  const days = [...document.querySelectorAll(".day")];
  btns.forEach((b) => b.addEventListener("click", () => {
    btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const f = b.dataset.f;
    cards.forEach((c) => {
      const ok = f === "all" ? true
        : f === "milestone" ? c.dataset.milestone === "1"
        : c.dataset.kind === f;
      c.classList.toggle("hidden", !ok);
    });
    days.forEach((d) => {
      const any = [...d.querySelectorAll(".card")].some((c) => !c.classList.contains("hidden"));
      d.classList.toggle("hidden", !any);
    });
  }));
</script>
</body>
</html>`;

fs.writeFileSync(HTML, html, "utf8");
if (fs.existsSync(path.dirname(HTML_WEB))) {
  fs.writeFileSync(HTML_WEB, html, "utf8");
  console.log("✓ 已生成 docs/changelog.html 和 web/public/changelog.html");
} else {
  console.log("✓ 已生成 docs/changelog.html");
}
console.log(`\n当前 v${current} · ${versions.length} 个版本 · ${totalCommits ?? "?"} 次提交 · ${days} 天`);
