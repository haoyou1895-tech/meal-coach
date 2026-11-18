# 餐谋 · 鸿蒙壳（HarmonyOS HAP）

把 `https://canmou.net.cn` 包成一个原生鸿蒙应用。网页代码一行不改，改的只是「谁来显示它」。

## 为什么需要这一层

鸿蒙自带浏览器把「添加到桌面」做成了网页快捷方式，即使 manifest 声明 `display: standalone` 也不给独立窗口。原生壳能拿到浏览器永远不给的两个能力：

1. **忽略证书错误**（`onSslErrorEventReceive`），不会因为证书链问题白屏
2. **无地址栏全屏**，桌面上就是一个普通 App 图标

## 目录

```
harmony/
├── AppScope/
│   ├── app.json5                    包名 cn.net.canmou.mealcoach、版本、图标
│   └── resources/base/media/        应用图标（从网页 PWA 图标复制）
├── entry/src/main/
│   ├── module.json5                 权限（INTERNET）、入口 Ability
│   └── ets/pages/Index.ets          ★ 全部业务代码就这一个文件
└── build-profile.json5              compatibleSdkVersion 26.0.0
```

**要改的东西只有一处**：`entry/src/main/ets/pages/Index.ets` 第 9 行的 `HOME_URL`。

## 必须知道的一个坑

**鸿蒙构建工具不接受中文路径。** 本仓库在 `02-作品集/02-餐谋/` 下面，路径含中文，直接在这里跑 `hvigorw` 会报：

```
Invalid project path. Current path does not match:
Please modify the project path to ensure that it only contains letters, digits,
hyphens (-), underscores (_), periods (.), english parentheses (()), spaces, or the @ symbol
```

所以真正用来构建的工程放在 **`D:\DevEco\projects\canmou`**，本目录是源码存档（内容一致）。两个目录用 robocopy 保持同步：

```powershell
robocopy "D:\DevEco\projects\canmou" "D:\AI产品经理养成计划\02-作品集\02-餐谋\harmony" `
  /E /XD node_modules oh_modules .hvigor build .cxx .preview /XF *.hap pack.info sourceMaps.map
```

## 命令行构建

```powershell
$env:DEVECO_SDK_HOME = "D:\DevEco\DevEco Studio\sdk"
$env:PATH = "D:\DevEco\DevEco Studio\tools\node;" + $env:PATH
Set-Location "D:\DevEco\projects\canmou"
& "D:\DevEco\DevEco Studio\tools\hvigor\bin\hvigorw.bat" assembleHap `
  --mode module -p product=default -p buildMode=debug --no-daemon
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`（约 158 KB）

未签名的 hap **装不进手机**，必须签名。

## 签名与装机

签名要绑定一台具体设备的 UDID，所以必须在真机连着电脑时做：

1. DevEco Studio 打开 `D:\DevEco\projects\canmou`
2. 右上角 **Sign In** 登录华为开发者账号（免费，需实名）
3. **File → Project Structure → Signing Configs → 勾选 Automatically generate signature**
4. 手机开 **设置 → 系统 → 开发者选项 → USB 调试**，数据线连电脑
5. 点运行（▶）或命令行 `hdc install -r entry-default-signed.hap`

## 有效期

自动生成的调试证书**绑定设备、有效期约 90 天**，到期 App 打不开，需要重新签名安装。长期使用要申请个人开发者发布证书（一年一签）。
