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
 */
export type IconName =
  | "alert"
  | "eyeOff"
  | "check"
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
  | "clock";

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
   * 鸡腿。
   *
   * 这一格废了十版。前九版都死在"骨架"上：
   * 肉画成一个正圆、骨头竖直插在下面，21px 下就是一根棒棒糖；
   * 肉只画半边弧，就成了"被啃过的残骸"。
   *
   * 表情包那个鸡腿能一眼认出来，靠的是三件事同时成立：
   * (1) 肉是完整闭合的一大块，不是残弧 —— 所以这里用整椭圆；
   * (2) 骨头和肉成 40° 斜角，形成"方向"，比竖直更容易读出"腿"；
   * (3) 骨头要伸出去够长（露出约肉半径的 3/4），末端一颗圆节收尾。
   * 少了第 (3) 条就还是棒棒糖 —— 前面几版骨头只露出十几个像素。
   */
  meat: (
    <>
      <ellipse cx="8.9" cy="9.2" rx="6.9" ry="6.3" fill="#b0543a" stroke="none" />
      <path d="M12.4 13.4l5.8 5.2" stroke="#fdf7ec" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M12.4 13.4l5.8 5.2"
        stroke="#c9b79b"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="19.6" cy="19.7" r="2.2" fill="#fdf7ec" stroke="#c9b79b" strokeWidth="0.8" />
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
      <path d="M3.4 9.6v4.8M6.8 7.2v9.6M17.2 7.2v9.6M20.6 9.6v4.8M6.8 12h10.4" />
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
