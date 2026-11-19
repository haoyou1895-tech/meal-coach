export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/record/index",
    "pages/setup/index",
  ],
  window: {
    backgroundTextStyle: "dark",
    navigationBarBackgroundColor: "#f4f6f4",
    navigationBarTitleText: "餐谋",
    navigationBarTextStyle: "black",
    backgroundColor: "#f4f6f4",
  },
  tabBar: {
    color: "#6b7671",
    selectedColor: "#1f8a5b",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      { pagePath: "pages/index/index", text: "今天" },
      { pagePath: "pages/record/index", text: "记录" },
    ],
  },
  // 不申请定位。餐谋只需要相机和相册，多要一个权限就多一条审核理由。
  // 相机/相册/相册写入不走 permission 配置，是在代码里调 chooseMedia 时由微信弹窗，
  // 但必须在「小程序管理后台 → 用户隐私保护指引」里声明，否则真机会直接失败。
  requiredPrivateInfos: [],
  lazyCodeLoading: "requiredComponents",
});
