# 餐谋 · 三端结构

一个人用、三端铺开，先说清楚哪份代码是"真的"，免得改完一边另一边不动。

## 目录

```
02-餐谋/
├── web/        网页版（Next.js）—— 线上 canmou.net.cn，是主线
├── mini/       小程序版（Taro + React）—— 微信里用，正在搭
├── harmony/    APP 版（鸿蒙壳）—— 把网页版包成原生 HAP
├── app/        APP 说明和以后的新工程（现在只有一个 README）
├── tools/      同步脚本
├── _backup/    动结构之前的源码快照
└── _preview/   截图
```

## 关键约定：逻辑只写一遍

热量怎么算、建议怎么说、盐怎么判、体重取哪一次 ——
这些是产品本身，改一次必须两端一起变。所以：

- **`web/src/lib/` 是唯一的源**，小程序那边的 `mini/src/lib/` 是自动同步出来的
- 在 `mini` 目录下跑 `npm run sync`（`build` / `dev` 前会自动跑）
- **不要改 `mini/src/lib/` 里的文件**，改了下次同步就被覆盖。要改就改 web 那份

只有三个文件各端自己写，因为它们碰的是平台能力：

| 文件 | 网页版 | 小程序版 |
| --- | --- | --- |
| `storage.ts` | localStorage | `Taro.setStorageSync` |
| `photos.ts` | IndexedDB | 文件系统 `USER_DATA_PATH` |
| `image.ts` | canvas 压缩 | `Taro.compressImage` |

## 命令

```bash
# 网页版
cd web && npm run dev

# 小程序版：编译到 dist/，然后用微信开发者工具打开 mini/ 目录
cd mini && npm run dev      # 改了自动重编
cd mini && npm run build    # 出一次包
```

## 小程序上线要走的七步

1. `mp.weixin.qq.com` 注册（个人主体，身份证 + 扫脸），拿到 AppID
2. 类目选 **工具 → 效率**，不要选医疗健康
3. 装微信开发者工具，导入 `mini/` 目录，把 AppID 填进 `project.config.json`
4. `npm run build` 出 `dist/`
5. 后台配 **request 合法域名**：`https://canmou.net.cn`
6. 用户隐私保护指引里声明 **相机 + 相册**
7. 上传 → 提交审核 → 发布

审核没下来之前，可以先「选为体验版」让指定的人扫码用，一分钟，不经任何人。
