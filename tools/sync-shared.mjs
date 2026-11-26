/**
 * 把网页版里「跟平台无关」的逻辑同步到小程序版。
 *
 * 为什么要有这一步：热量算法、建议话术、盐的判定、体重取最近一次 ——
 * 这些是产品本身，改一次就该两端一起变。如果靠手抄，改完网页忘了小程序，
 * 舅舅在微信里看到的「今天还能吃 800 大卡」和网页上的对不上，那就废了。
 *
 * 平台相关的三个文件不参与同步，各端自己写：
 *   storage.ts  浏览器 localStorage / 小程序 Taro.setStorageSync
 *   photos.ts   IndexedDB / 小程序文件系统
 *   image.ts    canvas 压缩 / 小程序 compressImage
 *
 * 用法：npm run sync（mini 目录下），build / dev 之前会自动跑。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FROM = join(root, "web", "src", "lib");
const TO = join(root, "mini", "src", "lib");

/** 两端共用，源文件在 web，单方向覆盖到 mini */
const SHARED = [
  "types.ts",
  "nutrition.ts",
  "advice.ts",
  "comment.ts",
  "drinks.ts",
  "mealTags.ts",
  "portion.ts",
  "ranking.ts",
  "mock.ts",
  "store.ts",
  /* 运动：定义（MET / 单位 / 默认量）和口语解析，都是纯逻辑，两岸一致 */
  "exercise.ts",
  "exerciseParse.ts",
  /*
   * 使用概况：只数天数和条数，纯函数，两端算出来的必须一样。
   * 小程序那边以后也会用到（同一个用户可能两边都在记）。
   */
  "digest.ts",
  /*
   * 漏记时"问什么单位"的规则。小程序要是自己做一套，
   * 同一个"牛肉"在网页问斤两、在微信问碗 —— 那是静默分叉。
   */
  "manual.ts",
];

mkdirSync(TO, { recursive: true });

let changed = 0;
for (const name of SHARED) {
  const src = readFileSync(join(FROM, name), "utf8");
  // Next.js 的 "use client" 指令对小程序没意义，Taro 会当成普通字符串留着
  const body = src.replace(/^"use client";\r?\n\r?\n/, "");
  const head =
    "/* 自动同步自 web/src/lib/" +
    name +
    "，不要在这里改，改 web 那份再跑 npm run sync */\n";
  const next = head + body;

  let old = "";
  try {
    old = readFileSync(join(TO, name), "utf8");
  } catch {
    /* 第一次同步，文件还不存在 */
  }
  if (old !== next) {
    writeFileSync(join(TO, name), next, "utf8");
    changed++;
    console.log("同步 " + name);
  }
}

console.log(
  changed
    ? `共 ${changed} 个文件有更新 → mini/src/lib`
    : "已经是同步状态",
);
