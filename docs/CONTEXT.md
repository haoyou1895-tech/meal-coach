# CONTEXT · 餐谋

> 给 AI 的**一页速查**。开工只读这份 + `../AGENTS.md`，其余 `docs/` 有疑问再查。
> 这里只放"现在是什么样"，不放"为什么" —— 为什么在 `05-决策记录.md`。

---

## 1. 现在到哪

| 项 | 状态 |
|---|---|
| 线上 | `https://canmou.net.cn`，最新 **v0.15**（`d81887c`） |
| 网页版 | 主线。底部三页：吃 / 动 / 账 |
| 小程序 | 已改成**三页结构**（吃 / 动 / 账），运动页整页搬完（`00dc07c`），**等他在开发者工具里验收**；账页的「实际消耗」卡和吃页的收工面板还没搬 |
| 鸿蒙 | WebView 壳，编译过但未签名，装不进手机 |
| 数据 | 全在本机 `localStorage`（文字）+ IndexedDB（照片），无账号 |

---

## 2. 文件在哪

| 要找什么 | 在哪 |
|---|---|
| 业务逻辑（唯一源） | `web/src/lib/` —— 绝不手改 `mini/src/lib`，那是同步产物 |
| 额度 / 周数 / 三档 | `web/src/lib/nutrition.ts` 的 `buildPlan`（H20 全在这） |
| 反推真实消耗 | `web/src/lib/expenditure.ts`（**只显示，不接额度**） |
| 运动定义与 MET | `web/src/lib/exercise.ts`（`metric`：公里 / 个数 / 分钟） |
| 三页 | `components/HomeView.tsx`（吃）/ `MoveView.tsx`（动）/ `RecordView.tsx`（账），壳在 `app/page.tsx` |
| 收工面板 | `components/DaySummary.tsx` |
| 图标 | `components/Icon.tsx`（Tabler 原样贴，唯一例外 `exBadminton` 手绘） |
| 版本记录 | `docs/versions.json` → `node tools/changelog.mjs` |
| 验证脚本 | `web/scripts/*.mjs`，截图落 `web/.shots/` |

---

## 3. 下一步

1. 他试完当前线上版说「可以」→ 记一条版本（H23）；说「不行」→ 改完再推，不占号
2. 小程序三页已搬一半：动页在 `00dc07c`，`mini/dist` 已重建；等他在开发者工具里看，账页/吃页接着搬
3. 遗留：改三档算法后，老数据里存的 `goalWeeks` 可能已不是有效档位

---

## 4. 最容易忘的三条

- **推完就停**：不写版本号、不碰 mini
- **只改 `web/src/lib`**：mini 那份会被同步覆盖
- **不本地 build**：tsc 过了直接 push，让 Vercel 构建

---

## 5. 怎么读才不烧钱

- **别通读 `docs/`**（全套十份 120KB）。改文案查 `04` 第 6 节、报错查 `06`、想推翻现状查 `05`、验收查 `03`。
- **读代码先 `grep` 定位**，只读命中的函数，别整文件吞。
- **验证只跑改动那条路径**，不重跑全量脚本。
- **汇报只写三行**（见 `03` 第 5 节）。
