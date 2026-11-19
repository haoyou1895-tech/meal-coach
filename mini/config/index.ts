import devConfig from "./dev";
import prodConfig from "./prod";

/**
 * Taro 4 + webpack5。
 *
 * designWidth 750：设计稿按 750 宽写，样式里 1px 就是 1rpx。
 * 网页版的字号是「手机实际像素」（17px），搬过来要乘 2 变成 34rpx，
 * 否则在手机上会小一半 —— 这个 App 是给 46 岁的人看的，字号不能缩水。
 */
export default async function (merge) {
  const baseConfig = {
    projectName: "canmou-mini",
    date: "2026-11-19",
    designWidth: 750,
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
