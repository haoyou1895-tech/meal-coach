import type { CSSProperties, JSX } from "react";

/**
 * 一套自己画的图标。
 *
 * 为什么要自己画：这个应用的目标用户是四十多岁、天天在外面应酬的人，
 * 文字一多他就不看了。而"脂肪""碳水""在外吃"这些词，他读一眼要停顿，
 * 看一个图标不用。
 *
 * 全用内联 SVG，不引第三方库：(1) 包体积 (2) 线上已经是 PWA，
 * 少一个外链就少一个白屏的可能。
 *
 * ── 图标来源规则（AGENTS.md 的 H11，别违背）────────────────────
 *
 * 1. **界面与运动图标只有一个来源：Lucide v0.469.0（ISC）。**
 *    下面的 `footprints / bike / waves / trendingUp / personStanding /
 *    music / circleDot / dumbbell / mountain / zap / activity / sprayCan / move`
 *    是从 `lucide-static@0.469.0` 抄进来的原始 path，**一个坐标都没改**。
 *    要加图标就去库里取，取完原样贴进来，别照着感觉画。
 * 2. **不引 npm 包，也不引 CDN**。只把用到的十几个 path 抄进来，
 *    这样既有统一风格，又不给首屏多一个网络请求。
 * 3. **不用 Emoji、不用 Unicode 字符、不临时生成 SVG**。
 *    一个 🏃 在安卓和 iOS 上长得完全不同，那就不叫一套图标了。
 * 4. 食物那六个（蛋 / 猪 / 盐罐 / 饭 / 油 / 菜）是这块产品的视觉资产，
 *    不在 Lucide 的能力范围里，属于**冻结**状态：不改、不新增、不扩散到界面。
 *    它们只出现在营养分类上，不参与 UI 图标系统。
 */
export type IconName =
  | "alert"
  | "eyeOff"
  | "check"
  | "close"
  | "plus"
  | "camera"
  | "gallery"
  | "mic"
  | "fire"
  | "protein"
  | "meat"
  | "edit"
  | "trash"
  | "carb"
  | "fat"
  | "veg"
  | "salt"
  | "alcohol"
  | "sunrise"
  | "sun"
  | "moon"
  | "apple"
  | "sit"
  | "walk"
  | "dumbbell"
  | "heart"
  | "droplet"
  | "soup"
  | "pickled"
  | "out"
  | "fried"
  | "sweet"
  | "scale"
  | "clock"
  // ↓ 以下取自 Lucide v0.469.0，供运动项使用
  | "footprints"
  | "bike"
  | "waves"
  | "trendingUp"
  | "personStanding"
  | "music"
  | "circleDot"
  | "mountain"
  | "zap"
  | "activity"
  | "sprayCan"
  | "move";

const P: Record<IconName, JSX.Element> = {
  alert: (
    <>
      <path d="M12 4.2l8.2 14.4a1 1 0 01-.9 1.5H4.7a1 1 0 01-.9-1.5L12 4.2z" />
      <path d="M12 9.6v4.2" />
      <circle cx="12" cy="16.4" r="0.95" fill="currentColor" stroke="none" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 12s3.4-5.6 8-5.6S20 12 20 12s-3.4 5.6-8 5.6S4 12 4 12z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M5 19.5L19 4.5" />
    </>
  ),
  check: <path d="M4.5 12.6l4.8 4.7L19.5 7" />,
  close: <path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="M3 8.6A2.6 2.6 0 015.6 6h1.3a2 2 0 001.7-1l.4-.7a1 1 0 01.9-.5h4.2a1 1 0 01.9.5l.4.7a2 2 0 001.7 1h1.3A2.6 2.6 0 0121 8.6v9A2.6 2.6 0 0118.4 20H5.6A2.6 2.6 0 013 17.4v-8.8z" />
      <circle cx="12" cy="12.9" r="3.5" />
    </>
  ),
  gallery: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.6" />
      <circle cx="8.6" cy="10" r="1.5" />
      <path d="M4 17l4.6-4.2a1.6 1.6 0 012.1 0L20 20" />
    </>
  ),
  mic: (
    <>
      <rect x="9.2" y="3" width="5.6" height="10.4" rx="2.8" />
      <path d="M5.8 11.6a6.2 6.2 0 0012.4 0M12 17.8V21" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3.2c.2 2.4 2 3.6 3.3 5.3A6.6 6.6 0 0117 13a5 5 0 01-10 0c0-1.7.7-3.3 1.8-4.6.6 1 1.5 1.5 2.2 1.5.9 0 1.5-.7 1.4-1.7-.1-1.6-.4-3.4-.4-5z" />
    </>
  ),
  /**
   * 煎蛋：蛋白摊开、蛋黄居中。
   *
   * 之前蛋黄偏在一边（cx 9.2），缩到 17px 整颗蛋是歪的，读起来像"被咬了一口"。
   * 现在蛋黄落在正中，蛋白做成左右对称的圆盘 + 底部两滴蛋液 ——
   * 对称是这个小尺寸下唯一还能看出"这是一颗蛋"的结构。
   *
   * 白蛋白在白卡片上等于隐形，所以必须给它一圈很浅的描边（#ded3b8）；
   * 没有这圈描边，21px 下只剩一颗黄点飘着。
   */
  protein: (
    <>
      <path
        d="M12 3.6c4.7 0 8.4 3.1 8.4 7 0 2.5-1.4 4.6-3.5 5.8l1 2.3c.3.7-.4 1.3-1 1-1-.4-2-1-2.8-1.7-1.3.3-2.7.4-4.1.1-.8.6-1.7 1.2-2.6 1.6-.6.3-1.3-.3-1-1l1-2.3C5 15.2 3.6 13.1 3.6 10.6c0-3.9 3.7-7 8.4-7z"
        fill="#fffdf6"
        stroke="#ded3b8"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <ellipse cx="12" cy="10.4" rx="3.5" ry="3.3" fill="#f0a93c" stroke="none" />
      <ellipse cx="10.8" cy="9.3" rx="1.1" ry="0.8" fill="#f9cc72" stroke="none" />
    </>
  ),
  /**
   * 猪。
   *
   * 鸡腿这一格废了十几版，最后认定问题不在画法，在"鸡腿"这个对象本身：
   * 它的辨识度全靠肉和骨的比例，而这个比例在 21px 下可调节的余量只有一两个像素，
   * 怎么调都在这条线上来回翻（一会儿棒棒糖，一会儿蘑菇）。
   *
   * 换成猪头就绕开了这个问题 —— 猪的辨识度不靠比例，靠三样结构：
   * 头顶两只耳朵、中间一个圆鼻子、鼻子上两个孔。
   * 这三样任意两样同时出现，21px 下也不会认错，而且比例怎么变都还是猪。
   *
   * 每个形状都要显式 stroke="none"：父级 svg 默认描边是 currentColor 1.7，
   * 不关掉的话 21px 下会给每个色块镶一圈黑边，直接糊成一团。
   */
  meat: (
    <>
      <path
        d="M6.1 8.2 4.6 3.6c-.2-.7.5-1.3 1.2-1.1l3.8 1.4z"
        fill="#e9899f"
        stroke="none"
      />
      <path
        d="M17.9 8.2 19.4 3.6c.2-.7-.5-1.3-1.2-1.1l-3.8 1.4z"
        fill="#e9899f"
        stroke="none"
      />
      <ellipse cx="12" cy="13.4" rx="8.5" ry="7.4" fill="#f7bcc9" stroke="none" />
      <circle cx="8.7" cy="11.8" r="1.15" fill="#5c2f39" stroke="none" />
      <circle cx="15.3" cy="11.8" r="1.15" fill="#5c2f39" stroke="none" />
      <ellipse cx="12" cy="16.4" rx="3.6" ry="2.8" fill="#e9899f" stroke="none" />
      <ellipse cx="10.7" cy="16.4" rx="0.62" ry="0.95" fill="#7d3d4b" stroke="none" />
      <ellipse cx="13.3" cy="16.4" rx="0.62" ry="0.95" fill="#7d3d4b" stroke="none" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5h4L19.2 8.8a2.5 2.5 0 10-3.5-3.5L4.5 15.5v4z" />
      <path d="M14.6 6.4l3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.6 7h14.8" />
      <path d="M9.6 7V4.9h4.8V7" />
      <path d="M6.7 7l.9 11.9a1.7 1.7 0 001.7 1.6h5.4a1.7 1.7 0 001.7-1.6L17.3 7" />
      <path d="M10.6 11v5.4M13.4 11v5.4" />
    </>
  ),
  carb: (
    <>
      <path d="M3.6 11.4h16.8c0 4.6-3.8 8.2-8.4 8.2s-8.4-3.6-8.4-8.2z" />
      <path d="M7 11.4V9.6h10v1.8" />
      <path d="M9.6 6.4c0-.9.7-1.4 1.4-1.4M14 6.4c0-.9-.7-1.4-1.4-1.4" />
    </>
  ),
  fat: (
    <>
      <rect x="10.1" y="2.6" width="3.8" height="2.7" rx="0.9" fill="#8a6b3a" stroke="none" />
      <path d="M11.2 5.3v2.5M12.8 5.3v2.5" stroke="#c9a05a" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M9.4 7.8h5.2c1.3 0 2.2 1 2.2 2.2v9.2c0 1.3-1 2.2-2.2 2.2H9.4c-1.2 0-2.2-.9-2.2-2.2V10c0-1.2.9-2.2 2.2-2.2z"
        fill="#f4d888"
        stroke="#c9a05a"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M7.7 14.6c2.8-.8 5.8-.8 8.6 0v4.6c0 1.3-1 2.2-2.2 2.2H9.9c-1.2 0-2.2-.9-2.2-2.2z"
        fill="#e8b93f"
        stroke="none"
      />
    </>
  ),
  veg: (
    <>
      <path
        d="M12 20.4c0-6 3.2-10.6 8-12.4-.4 6.6-3.4 11-8 12.4z"
        fill="#5aa877"
        stroke="#3d7d55"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M12 20.4C9.6 15 6.2 12.4 3.6 11.4c.6 5.4 3.6 8.6 8.4 9z"
        fill="#7cc294"
        stroke="#3d7d55"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M12 20.4V9" stroke="#3d7d55" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  salt: (
    <>
      <path d="M8.2 8.6h7.6v8.6a2.2 2.2 0 01-2.2 2.2h-3.2a2.2 2.2 0 01-2.2-2.2V8.6z" />
      <path d="M7 8.6h10M10 5h4l.6 3.6H9.4L10 5z" />
      <circle cx="10.6" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="15.4" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  alcohol: (
    <>
      <path d="M8.2 4h7.6l-1 5.4a2.9 2.9 0 01-5.6 0L8.2 4z" />
      <path d="M12 12.6V19M9.2 19h5.6" />
    </>
  ),
  sunrise: (
    <>
      <path d="M6.4 16.4a5.6 5.6 0 0111.2 0" />
      <path d="M12 4.4v4M5 8.6l1.9 1.9M19 8.6l-1.9 1.9M3 16.4h18M4 20h16" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18" />
    </>
  ),
  moon: <path d="M20.2 14.4A8.6 8.6 0 019.6 3.8a8.6 8.6 0 1010.6 10.6z" />,
  apple: (
    <>
      <path d="M12 8.6c1.6-1.4 4.6-1.4 5.8 1.2 1.4 3.1-.4 9-3.3 9.4-1 .1-1.6-.5-2.5-.5s-1.5.6-2.5.5c-2.9-.4-4.7-6.3-3.3-9.4 1.2-2.6 4.2-2.6 5.8-1.2z" />
      <path d="M12 8.6V6.4c0-1.2.9-2.2 2.1-2.4" />
    </>
  ),
  sit: (
    <>
      <path d="M7.4 12.6V7.2a1.8 1.8 0 011.8-1.8h5.6a1.8 1.8 0 011.8 1.8v5.4" />
      <path d="M4.6 12.6h14.8v4.2H4.6z" />
      <path d="M7 16.8V19M17 16.8V19" />
    </>
  ),
  walk: (
    <>
      <circle cx="13.4" cy="4.6" r="1.7" />
      <path d="M13 7.4v4.4M13 11.8l-2.6 6.4M13 11.8l2.8 6.4M13 9.2l-3.2 2M13 9.2l3 1.6" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.6-4.6-7.6-9.4A4.1 4.1 0 0112 7.9a4.1 4.1 0 017.6 2.7C19.6 15.4 12 20 12 20z" />
  ),
  droplet: <path d="M12 3.4c3.1 3.6 5.4 6.3 5.4 9.2a5.4 5.4 0 01-10.8 0c0-2.9 2.3-5.6 5.4-9.2z" />,
  soup: (
    <>
      <path d="M4 11.6h16c0 4.3-3.6 7.6-8 7.6s-8-3.3-8-7.6z" />
      <path d="M9 8.4c0-1.2 1-1.6 1-2.8M14.4 8.4c0-1.2 1-1.6 1-2.8" />
    </>
  ),
  pickled: (
    <>
      <path d="M7.6 8.4h8.8l-.9 9.8a2 2 0 01-2 1.8h-3a2 2 0 01-2-1.8L7.6 8.4z" />
      <path d="M6.4 8.4h11.2M8.8 5.2h6.4v3.2H8.8z" />
    </>
  ),
  out: (
    <>
      <path d="M6.4 3.4v7.2a2.4 2.4 0 004.8 0V3.4M8.8 10.6V20.6" />
      <path d="M16.4 3.4c1.6 1.2 2.4 2.8 2.4 4.8 0 1.6-.9 2.6-2.4 2.8v9.6" />
    </>
  ),
  fried: (
    <>
      <path d="M8.4 8.2l1-4.4M12 8.2V3.4M15.6 8.2l-1-4.4" />
      <path d="M6.6 8.2h10.8l-1 11.4a1.6 1.6 0 01-1.6 1.4H9.2a1.6 1.6 0 01-1.6-1.4L6.6 8.2z" />
    </>
  ),
  sweet: (
    <>
      <path d="M9.4 3.4h5.2l-.7 4.4H10l-.6-4.4z" />
      <path d="M8.6 7.8h6.8l-.6 6.4h-5.6L8.6 7.8z" />
      <path d="M9.2 14.2h5.6v1.4a2.8 2.8 0 01-5.6 0v-1.4z" />
      <path d="M12 18.4v2.6" />
    </>
  ),
  scale: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" />
      <path d="M8.4 10.4a4.6 4.6 0 018 0" />
      <path d="M12 10.4l1.8-1.8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3 1.8" />
    </>
  ),

  /* ── Lucide v0.469.0 原始数据，请勿改动坐标 ───────────────── */

  /** 快走 / 散步 */
  footprints: (
    <>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
      <path d="M16 17h4" />
      <path d="M4 13h4" />
    </>
  ),
  bike: (
    <>
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </>
  ),
  waves: (
    <>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </>
  ),
  trendingUp: (
    <>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </>
  ),
  personStanding: (
    <>
      <circle cx="12" cy="5" r="1" />
      <path d="m9 20 3-6 3 6" />
      <path d="m6 8 6 2 6-2" />
      <path d="M12 10v4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  circleDot: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  mountain: <path d="m8 3 4 8 5-5 5 15H2L8 3z" />,
  zap: (
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  ),
  activity: (
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  ),
  sprayCan: (
    <>
      <path d="M3 3h.01" />
      <path d="M7 5h.01" />
      <path d="M11 7h.01" />
      <path d="M3 7h.01" />
      <path d="M7 9h.01" />
      <path d="M3 11h.01" />
      <rect width="4" height="4" x="15" y="5" />
      <path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2" />
      <path d="m13 14 8-2" />
      <path d="m13 19 8-2" />
    </>
  ),
  move: (
    <>
      <path d="M12 2v20" />
      <path d="m15 19-3 3-3-3" />
      <path d="m19 9 3 3-3 3" />
      <path d="M2 12h20" />
      <path d="m5 9-3 3 3 3" />
      <path d="m9 5 3-3 3 3" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** 颜色有时得按状态算（红/橙/绿），只能用 inline style */
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
