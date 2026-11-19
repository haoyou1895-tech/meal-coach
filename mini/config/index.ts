import path from "node:path";
import devConfig from "./dev";
import prodConfig from "./prod";

/**
 * Taro 4 + webpack5。
 *
 * designWidth 375 + deviceRatio 375:2 —— 这是为了让**样式能一比一照抄网页版**。
 *
 * 之前的写法是 designWidth 750，1px 输出 1rpx，于是每个数值都要人工乘 2
 * （网页版 17px 字号要写成 34rpx）。乘错了看不出来，只是"感觉不一样"——
 * 而"感觉不一样"正是这次返工的原因。现在 SCSS 里写 17px，
 * 编译成 34rpx，在 375pt 的屏幕上就是 17pt，跟网页版同一个字。
 *
 * h5 那边关掉 pxtransform：浏览器里 1px 就是 1px，
 * 这样电脑上预览和网页版可以逐像素对照。
 */
export default async function (merge) {
  const baseConfig = {
    projectName: "canmou-mini",
    date: "2026-11-19",
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    // 分开输出：h5 只是拿来在电脑上预览的，不能把小程序的 dist 盖掉
    outputRoot: process.env.TARO_ENV === "h5" ? "dist-h5" : "dist",
    plugins: [],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: "react",
    /**
     * 每个 .scss 自动注入换算基准（$u / tw() / 颜色）。
     * 不注入的话每个文件都得手写 @import，漏一个就是编译报错。
     */
    sass: {
      resource: [path.resolve(__dirname, "../src/styles/var.scss")],
    },
    compiler: {
      type: "webpack5",
      prebundle: { enable: false },
    },
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: "css/[name].[hash].css",
        chunkFilename: "css/[name].[chunkhash].css",
      },
      postcss: {
        // 浏览器里不需要缩放：px 保持 px，好跟网页版逐像素对照
        pxtransform: {
          enable: false,
          config: {},
        },
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
    },
  };

  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
}
