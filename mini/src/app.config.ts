export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/record/index",
    "pages/setup/index",
    "pages/capture/index",
    "pages/settings/index",
  ],
  window: {
    backgroundTextStyle: "dark",
    navigationBarBackgroundColor: "#f4f6f4",
    // 网页版顶部没有标题栏，这里也不放字，只留一条跟背景同色的空导航
    navigationBarTitleText: "",
    navigationBarTextStyle: "black",
    backgroundColor: "#f4f6f4",
  },
  /**
   * 不用原生 tabBar。
   * 原生那条是"白底 + 灰字 + 绿色文字选中"，而网页版是
   * 白色圆角卡片浮在页面上、上面还压着一个绿色大按钮 ——
   * 形状就不一样，调颜色救不回来。所以关掉，由 components/BottomNav 自己画。
   */
  // 不申请定位。餐谋只需要相机和相册，多要一个权限就多一条审核理由。
  // 相机/相册/相册写入不走 permission 配置，是在代码里调 chooseMedia 时由微信弹窗，
  // 但必须在「小程序管理后台 → 用户隐私保护指引」里声明，否则真机会直接失败。
  requiredPrivateInfos: [],
  lazyCodeLoading: "requiredComponents",
});
