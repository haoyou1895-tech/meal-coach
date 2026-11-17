# 餐谋 · 代码说明与上线手册

给舅舅用的减重助手。核心就一句话：**拍张照，就知道这顿吃对了没。**

> 产品文档在上一层目录：`../00-方案-v0.1.md`、`../01-PRD-v0.1.md`

---

## 一、本地跑起来（3 分钟）

```bash
cd web
npm install
npm run dev
```

浏览器打开 http://localhost:3000

**没配 AI Key 也能用**：会自动进入「演示模式」，返回示例识别结果，全流程可以完整走一遍。

---

## 二、接上真正的 AI 识别（可选）

1. 去阿里云百炼（或火山引擎/智谱）申请一个 API Key
2. 复制 `.env.example` 为 `.env.local`，填入：

```
AI_API_KEY=sk-xxxxxxxx
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-vl-max
```

3. 重启 `npm run dev`

> 🔒 **Key 只放在服务端**（`src/app/api/recognize/route.ts` 里读 `process.env`），浏览器永远拿不到，不会被盗刷。

---

## 三、部署到 Vercel（这才是"真上线"）

### 1. 推到 GitHub

```bash
git init
git add .
git commit -m "feat: 餐谋 v0.1"
# 在 GitHub 新建一个空仓库，然后：
git remote add origin https://github.com/你的用户名/meal-coach.git
git push -u origin main
```

### 2. 导入 Vercel

1. 打开 https://vercel.com，用 GitHub 账号登录
2. 点 **Add New → Project**
3. 选中刚才的仓库 → **Import**
4. Framework 会自动识别为 Next.js，直接点 **Deploy**

等 2 分钟，会得到一个 `https://xxx.vercel.app` 的地址 —— **这就是能发给舅舅的链接**。

### 3. 填环境变量

Vercel 项目页 → **Settings → Environment Variables**，加三个：

| Name | Value |
|---|---|
| `AI_API_KEY` | 你的 Key |
| `AI_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_MODEL` | `qwen-vl-max` |

加完去 **Deployments → 最新一条 → Redeploy** 才会生效。

### 4. 绑域名（可选，但建议）

买一个域名 → Vercel **Settings → Domains** 添加 → 按提示改 DNS。
HTTPS 会自动配好，不用管。

---

## 四、让舅舅用上（关键一步）

⚠️ **微信里点开的链接，是不能"添加到桌面"的。**

必须这样教他：

1. 微信里收到链接 → 点开
2. 右上角「···」→ **在浏览器打开**
3. 华为浏览器里 → 底部/右上角菜单 → **添加到桌面**
4. 桌面上出现绿色图标，点开就是全屏，跟 App 一样

**建议录一个 30 秒的屏幕视频发给他**，比说十遍都管用。

---

## 五、代码地图（看懂 30% 就够）

```
src/
├── app/
│   ├── page.tsx              主界面：判断是引导还是首页，管状态和保存
│   ├── layout.tsx            全局配置（标题、PWA、主题色）
│   ├── globals.css           配色和字号（长辈友好都调在这里）
│   └── api/recognize/route.ts  【核心】把照片发给 AI，拿回热量
├── components/
│   ├── Onboarding.tsx        8 题设置流程
│   ├── HomeView.tsx          首页：进度环 + 今天吃了什么
│   ├── RecordView.tsx        记录页：体重、7 天柱状图、历史
│   ├── CameraSheet.tsx       【核心】拍照 → 上传 → 确认
│   └── ui.tsx                共用零件（进度环、步进器、弹层）
└── lib/
    ├── nutrition.ts          算基础代谢、每日预算、营养素目标
    ├── comment.ts            【核心】一句话点评的规则引擎
    ├── store.ts              本地存储（浏览器 localStorage）
    ├── mock.ts               演示模式的假数据
    └── types.ts              数据结构定义
```

**最该看懂的两个文件**：`api/recognize/route.ts`（AI 怎么接）和 `lib/comment.ts`（话术怎么定）。

---

## 六、几个关键决策（面试会问）

| 决策 | 为什么 |
|---|---|
| 用网页而不是原生 App | 目标机是华为 Pura 90 / 纯血鸿蒙，装不了安卓 APK；PWA 是唯一可行且体验接近原生的路 |
| AI 只管识别，不管说话 | 话术用规则引擎保证一致、可控、零成本；模型负责它最擅长的部分 |
| 每餐只说一句话 | 说五条长辈一条都记不住，等于没说 |
| 只存本地不建云端 | v0.1 单用户，先用零配置方案跑通闭环；数据同步放 v0.2 |
| 不做运动记录 | 长辈活动量无法量化，假数据会污染热量模型 |

---

## 七、改完代码怎么自检

另开一个终端跑着 `npm run dev`，然后：

```bash
npm run shots
```

会自动在无头浏览器里走一遍完整流程（设置 8 题 → 首页 → 拍照上传 → 识别 → 保存 → 记录页 → 刷新验证数据还在），
截图存到 `.shots/`，最后打印「刷新后记录条数」。跑不通会直接报错。

> 这一步别跳过。改完不看截图就交付，等于闭着眼睛开车。

---

## 八、下一步（v0.2）

- [ ] 接 Supabase，数据上云（换手机不丢）
- [ ] 常吃食物一键重记（减少拍照次数）
- [ ] 周报 + 连续超标提醒
- [ ] 语音记录
- [ ] 埋点（记录耗时、采纳率）

---

## 九、免责声明

本产品提供饮食参考，**不构成医疗建议**，如有疾病请遵医嘱。
