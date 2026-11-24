/**
 * 运动量与消耗。
 *
 * 替换掉的是原来那套「活动系数」：低=1.2、中=1.3、高=1.45，乘一次完事。
 * 那套算法有三个问题，都是致命的：
 *
 * 1. 用户看不懂。1.3 是什么意思？他没法验证，也没法反驳，只能信或不信。
 * 2. 它把一整天糊成一个数。走路、搬货、游泳、躺着刷手机，全被折进"中等"。
 * 3. 它没有反馈回路。他今天真游了一小时，系统毫无反应 —— 那他凭什么还记。
 *
 * 换成 MET：每种活动有一个公认的代谢当量，消耗 = (MET - 1) × 体重 × 小时。
 *
 * 为什么减 1：预算里的基础代谢已经包含了「这一小时就算躺着也要消耗的那 1 MET」。
 * 不减，运动的那一小时就把基础代谢算了两遍，一天能虚高两三百大卡 ——
 * 而这三百大卡会直接变成他多吃的一碗饭。
 *
 * ⚠️ 消耗数字永远是估算，误差 ±20%。所以这个系统的设计前提是：
 * 运动量不去放宽今天的饭量，只影响明天的预算（用过去 7 天平均）。
 * 详见 avgBurnEndingOn 的注释。
 */

import type { ExerciseLog, ExerciseKind, Profile } from "./types";

/**
 * 运动图标一律取 Tabler Icons（v3.24.0）里的现成图标，不自己画。
 *
 * 上一版用的是 Lucide，十七项运动只能挤在十二个符号上："快走/散步"共用脚印、
 * "慢跑/健身操"共用一条心跳线、"羽毛球/乒乓球"共用同一个圆点。
 * 用户拿截图来问"这些含义不符合" —— 他说得对，那不是省事，那是没画。
 *
 * 换成 Tabler 之后每一项都有自己的图标：跑步的人、一双鞋、瑜伽、伸展、
 * 跳绳、乒乓拍、拳架、杠铃、台阶、刷子、火苗。
 * 只有"其他运动"用火苗兜底，因为那时确实不知道是什么。
 *
 * **一个例外**：Tabler 全库没有羽毛球（连 shuttlecock 都没有），
 * 上一版只好拿 `ball-tennis`（一个网球）顶替 —— 用户第二次拿截图来问
 * "羽毛球图标还是不对"。网球和羽毛球不是一回事，这个顶替是错的。
 * 所以 `exBadminton` 是照 24 网格手绘的羽毛球（球头 + 羽毛裙），
 * 线宽和 Tabler 一致，见 Icon.tsx。这条例外已登记在 docs/04。
 */
export type ExerciseIcon =
  | "exWalk"
  | "exShoe"
  | "exRun"
  | "exBike"
  | "exSwim"
  | "exStairs"
  | "exKarate"
  | "exMusic"
  | "exBadminton"
  | "exBarbell"
  | "exBrush"
  | "exYoga"
  | "exStretch"
  | "exPingpong"
  | "exMountain"
  | "exRope"
  | "exHeartbeat"
  | "exFlame";

/**
 * 用什么东西量"今天做了多少"。
 *
 * 这一条是用户提出来的：他说"跑步和散步，你要判断是公里数更能反映运动量
 * 还是时间；跳绳是次数还是时间"。答案是**不一样**：
 *
 * - 走路、跑步、骑车、游泳、爬山：同样 30 分钟，配速差一倍，消耗差一倍。
 *   说"5 公里"是确定的，说"半小时"什么也没说。所以这些用**公里**。
 * - 跳绳的人自己数个数，不数分钟。所以用**个**。
 * - 太极、瑜伽、广场舞、家务、力量：本来就是按时间做的，用**分钟**。
 *
 * 但内部只认分钟：MET 是按小时算的，公里和个数必须先折成分钟。
 * 折算率写在每一项的 metric 里，都是常见速度，不是拍脑袋。
 */
export type MetricUnit = "min" | "km" | "count";

export interface Metric {
  unit: MetricUnit;
  /** 一个单位折合多少分钟 */
  minPerUnit: number;
  /** 加减一次的步长 */
  step: number;
  min: number;
  max: number;
  /** 输入框后面那个字 */
  suffix: string;
  /** 要不要允许小数（公里要，次数不要） */
  decimal?: boolean;
}

/** 按时间量的那些项目共用这一个 */
export const MIN_METRIC: Metric = {
  unit: "min",
  minPerUnit: 1,
  step: 5,
  min: 5,
  max: 240,
  suffix: "分钟",
};

/** 按距离量。参数是"一公里要走多少分钟"，等于时速的倒数 */
function km(minPerKm: number): Metric {
  return {
    unit: "km",
    minPerUnit: minPerKm,
    step: 0.5,
    min: 0.5,
    max: 40,
    suffix: "公里",
    decimal: true,
  };
}

/** 按个数量。参数是每分钟大约多少个 */
function count(perMin: number): Metric {
  return {
    unit: "count",
    minPerUnit: 1 / perMin,
    step: 100,
    min: 100,
    max: 6000,
    suffix: "个",
  };
}

export interface ExerciseDef {
  kind: ExerciseKind;
  label: string;
  /** 代谢当量，取自体力活动纲要（Compendium of Physical Activities） */
  met: number;
  /** 加进来时的默认时长 */
  defaultMin: number;
  /** 取 Tabler 图标名，见上方 ExerciseIcon */
  icon: ExerciseIcon;
  /** 这个运动对他意味着什么，一句话 */
  note: string;
  /** 用什么量"做了多少"。不填就是按分钟 */
  metric?: Metric;
  /** 高血压、体重偏大的人要注意的地方。没有就不填 */
  caution?: string;
  /** 关节负担小，膝盖不好也能做 */
  jointSafe?: boolean;
}

/**
 * 运动库。十六项，按"他真会做的事"挑的。
 *
 * 早先只有十一项，理由是"给多了他反而挑不出来"。这个判断现在只对了一半：
 * 打字的人挑不出来，说话的人不会 —— 他说"打乒乓球"，系统却只有乒乓球以外的十一项，
 * 那他就只能记成"羽毛球"，账从此不可信。所以库里该有的得有，
 * 但**摆在按钮上的仍然只有常用的**（见 DaySummary 的 quick）。
 *
 * MET 取的是中等强度那档，不是我挑个好看的数：
 * 快走 5.6km/h 是 4.3，慢跑 8km/h 是 8.3，太极 3.0，家务 3.3。
 */
export const EXERCISES: ExerciseDef[] = [
  {
    kind: "walk",
    label: "快走",
    met: 4.3,
    defaultMin: 40,
    icon: "exWalk",
    /** 5.6 公里/小时，一公里约 10.7 分钟 */
    metric: km(10.7),
    note: "最省事的一种，出门就能做",
    jointSafe: true,
    },
  {
    kind: "stroll",
    label: "散步",
    met: 3.0,
    defaultMin: 40,
    icon: "exShoe",
    /** 4 公里/小时，一公里 15 分钟 */
    metric: km(15),
    note: "饭后溜达，主要是让血糖别蹿太快",
    jointSafe: true,
    },
  {
    kind: "jog",
    label: "慢跑",
    met: 7.0,
    defaultMin: 30,
    icon: "exRun",
    /** 8 公里/小时，一公里 7.5 分钟 */
    metric: km(7.5),
    note: "同样时间消耗最大，但别一上来就冲",
    caution: "血压没控好的时候先别跑，改成快走",
    },
  {
    kind: "bike",
    label: "骑车",
    met: 6.8,
    defaultMin: 40,
    icon: "exBike",
    /** 16 公里/小时，一公里约 3.8 分钟 */
    metric: km(3.8),
    note: "膝盖不吃力，通勤路上就能完成",
    jointSafe: true,
    },
  {
    kind: "swim",
    label: "游泳",
    met: 6.0,
    defaultMin: 30,
    icon: "exSwim",
    /** 2 公里/小时，一公里 30 分钟 —— 游泳的人本来就说游了多少米 */
    metric: km(30),
    note: "对关节最友好的有氧",
    jointSafe: true,
    },
  {
    kind: "stairs",
    label: "爬楼",
    met: 5.0,
    defaultMin: 15,
    icon: "exStairs",
    note: "十几分钟就顶得上散步半小时",
    caution: "下楼伤膝盖，坐电梯下来",
    },
  {
    kind: "taiji",
    label: "太极",
    met: 3.0,
    defaultMin: 40,
    icon: "exKarate",
    note: "消耗不大，但对血压和平衡是真有用",
    jointSafe: true,
    },
  {
    kind: "dance",
    label: "广场舞",
    met: 4.5,
    defaultMin: 40,
    icon: "exMusic",
    note: "能坚持下来的运动才算运动",
    jointSafe: true,
    },
  {
    kind: "badminton",
    label: "羽毛球",
    met: 5.5,
    defaultMin: 40,
    icon: "exBadminton",
    note: "有来有回，比一个人练容易坚持",
    },
  {
    kind: "strength",
    label: "力量训练",
    met: 3.5,
    defaultMin: 25,
    icon: "exBarbell",
    note: "减重时保住肌肉，靠的是这个",
    caution: "发力时呼气，别憋着劲举",
    },
  {
    kind: "chore",
    label: "家务",
    met: 3.3,
    defaultMin: 40,
    icon: "exBrush",
    note: "拖地擦窗也算，不用换衣服",
    jointSafe: true,
    },
  {
    kind: "yoga",
    label: "瑜伽",
    met: 2.5,
    defaultMin: 40,
    icon: "exYoga",
    note: "消耗不大，主要是让人肯躺下来放松",
    jointSafe: true,
    },
  {
    kind: "baduanjin",
    label: "八段锦",
    met: 3.0,
    defaultMin: 20,
    icon: "exStretch",
    note: "十几分钟一套，比太极门槛低，在家就能做",
    jointSafe: true,
    },
  {
    kind: "pingpong",
    label: "乒乓球",
    met: 4.0,
    defaultMin: 40,
    icon: "exPingpong",
    note: "有对手才打得起来，强度全看对面",
    jointSafe: true,
    },
  {
    kind: "hike",
    label: "爬山",
    met: 6.0,
    defaultMin: 60,
    icon: "exMountain",
    /** 上坡 3 公里/小时，一公里 20 分钟 */
    metric: km(20),
    note: "一次顶好几次散步，但下来那半天腿是废的",
    caution: "下山对膝盖的冲击最大，有登山杖就用上",
    },
  {
    kind: "rope",
    label: "跳绳",
    met: 10.0,
    defaultMin: 10,
    icon: "exRope",
    /** 一分钟 100 个 —— 中等速度连着跳，停下来喘的时间也算在里面 */
    metric: count(100),
    note: "十分钟就出汗，性价比最高的有氧",
    caution: "体重偏大的先别跳，膝盖承受不住",
    },
  {
    kind: "aerobic",
    label: "健身操",
    met: 6.5,
    defaultMin: 30,
    icon: "exHeartbeat",
    note: "跟着视频就能做，比一个人硬练有意思",
    },
];

/**
 * 他说的项目库里没有，按中等强度 4.0 估。
 * 4.0 约等于"快走偏快点"：估高了明天预算虚高，估低了运动白记，
 * 宁可保守。面板上会明写"按中等强度估的"，让他知道这个数不准。
 */
export const OTHER_DEF: ExerciseDef = {
  kind: "other",
  label: "其他运动",
  met: 4.0,
  defaultMin: 30,
  icon: "exFlame",
  note: "没对上名字，按中等强度估的",
};

const BY_KIND = new Map(EXERCISES.map((e) => [e.kind, e]));

export function exerciseDef(kind: ExerciseKind): ExerciseDef {
  if (kind === "other") return OTHER_DEF;
  return BY_KIND.get(kind) ?? EXERCISES[0];
}

/** 显示用的名字：库里没有的项目，用他当时说的那个词 */
export function nameOf(x: { kind: ExerciseKind; label?: string }): string {
  if (x.kind === "other") return x.label?.trim() || OTHER_DEF.label;
  return exerciseDef(x.kind).label;
}

/**
 * 净消耗。减 1 的理由见文件头。
 * 40 分钟快走、78 公斤：(4.3-1) × 78 × 0.667 ≈ 172 大卡。
 */
export function burnKcal(
  kind: ExerciseKind,
  weightKg: number,
  minutes: number,
): number {
  const def = exerciseDef(kind);
  if (minutes <= 0 || weightKg <= 0) return 0;
  return Math.round((def.met - 1) * weightKg * (minutes / 60));
}

export function burnOfLog(log: ExerciseLog, weightKg: number): number {
  return burnKcal(log.kind, weightKg, log.minutes);
}

/* ---------- 运动量：公里 / 个数 / 分钟 三选一，内部只认分钟 ---------- */

/** 这一项用什么量 */
export function metricOf(kind: ExerciseKind): Metric {
  return exerciseDef(kind).metric ?? MIN_METRIC;
}

/** 他填的那个量。老记录没有这个字段，返回 null */
export function amountOf(x: { amount?: number }): number | null {
  return typeof x.amount === "number" && x.amount > 0 ? x.amount : null;
}

/** 公里/个数 → 分钟。MET 算的是时间，所以这一步躲不掉 */
export function minutesOfAmount(kind: ExerciseKind, amount: number): number {
  const m = metricOf(kind);
  const raw = amount * m.minPerUnit;
  return Math.max(1, Math.round(raw));
}

/** 分钟 → 公里/个数。显示和编辑时要反着换一次 */
export function amountFromMinutes(kind: ExerciseKind, minutes: number): number {
  const m = metricOf(kind);
  const raw = minutes / m.minPerUnit;
  // 公里留一位小数，个数取整到十位 —— "1523 个"没人这么说话
  return m.unit === "km"
    ? Math.max(m.min, Math.round(raw * 10) / 10)
    : Math.max(m.min, Math.round(raw / 10) * 10);
}

/** 显示用："5 公里" / "1500 个" / "40 分钟" */
export function amountText(kind: ExerciseKind, amount: number): string {
  const m = metricOf(kind);
  const n =
    m.unit === "km"
      ? String(Math.round(amount * 10) / 10)
      : String(Math.round(amount));
  return `${n} ${m.suffix}`;
}

/**
 * 一条记录"做了多少"的那几个字。
 * 有量就写量（那是他自己填的事实），没有就退回分钟数（老记录）。
 */
export function logAmountText(log: ExerciseLog): string {
  const a = amountOf(log);
  return a ? amountText(log.kind, a) : `${log.minutes} 分钟`;
}

/** 一天总共动了多少 */
export function dayBurn(logs: ExerciseLog[], date: string, weightKg: number) {
  return logs
    .filter((l) => l.date === date)
    .reduce((sum, l) => sum + burnOfLog(l, weightKg), 0);
}

/** yyyy-mm-dd 往前推 n 天（n 为负就是往后） */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(
    t.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * 以某天为最后一天，往前 days 天的日均消耗。
 *
 * 这个函数是整套设计的关键，两个用途必须分清：
 *
 * - 算**今天**的预算时，传昨天。今天的运动今天不算进额度。
 *   否则他晚上跑了 40 分钟，环里立刻多出 170 大卡可吃 ——
 *   那不是奖励，那是把运动变成换饭吃的筹码。而且他会记住这个回路。
 *
 * - 算**明天**的预算时，传今天。用 7 天平均而不是今天的数：
 *   今天游了泳不代表明天还游。用单日数，明天预算虚高，后天掉回去，
 *   他只会觉得这软件在抽风。平均值稳，而且奖励的是"最近一直在动"。
 */
export function avgBurnEndingOn(
  logs: ExerciseLog[],
  endDate: string,
  weightKg: number,
  days = 7,
): number {
  if (!logs.length) return 0;
  const from = shiftDate(endDate, -(days - 1));
  const inRange = logs.filter((l) => l.date >= from && l.date <= endDate);
  if (!inRange.length) return 0;
  const total = inRange.reduce((s, l) => s + burnOfLog(l, weightKg), 0);
  return Math.round(total / days);
}

/**
 * 这一项每分钟净消耗多少。
 * 40 分钟快走、78 公斤 → 172 / 40 ≈ 4.3 大卡/分钟。
 */
export function kcalPerMin(kind: ExerciseKind, weightKg: number): number {
  if (weightKg <= 0) return 0;
  return ((exerciseDef(kind).met - 1) * weightKg) / 60;
}

/* ---------- 补账：他自己填量，系统只负责换算 ---------- */

/**
 * 小到不值得专门动一次的账。
 *
 * 13 大卡是三分之一个香蕉；而 MET 本身就有 ±20% 的误差 ——
 * 一次 40 分钟快走自己就带着 ±35 卡的偏差。所以为 13 卡排"骑车 1.3 公里"，
 * 是拿一个比误差还小的数去换一次真实的时间支出，不成比例。
 * 用户看截图第一句就是"为什么 36 卡才能顶掉 13 卡"，问的正是这个。
 *
 * 30 卡以下不排运动，只把话说清楚：这点差额在误差里，明天照常吃。
 * 30 卡约等于骑车 4 分钟、快走 7 分钟 —— 也是"人真会做的最小一次"。
 */
export const MIN_DEBT_KCAL = 30;

/**
 * 补账时一项运动的默认量。
 *
 * 上一版是每项固定 10 分钟起步，用户拿截图来问"为啥默认全是 10 分钟"。
 * 那 10 分钟不是算出来的，是算法为了让"每项都占一份"硬凑的，
 * 跟这笔账没关系：超 13 大卡也能排出 277 大卡的组合。
 *
 * 现在默认值照这笔账平摊：这笔账分给几项，每项就只给够它那一份的量；
 * 不低于这一项的最小单位，也不超过"他真会做"的默认时长。
 * 往上加是他自己在加，不是系统替他加。
 */
export function makeupDefaultAmount(
  kind: ExerciseKind,
  weightKg: number,
  shareKcal: number,
): number {
  const m = metricOf(kind);
  const perMin = kcalPerMin(kind, weightKg);
  // 一份账要多少分钟。算不出来（体重没填）就退回这一项的默认时长
  const raw = perMin > 0 ? shareKcal / perMin : exerciseDef(kind).defaultMin;
  const mins = Math.min(
    exerciseDef(kind).defaultMin,
    Math.max(5, Math.ceil(raw / 5) * 5),
  );
  if (m.unit === "min") return mins;
  return amountFromMinutes(kind, mins);
}

/**
 * 他填的那个量值多少卡。公里、个数、分钟都走这一个口 ——
 * 面板上实时跳的那个数必须和记账时算出来的同一个，否则填完就变。
 */
export function burnOfAmount(
  kind: ExerciseKind,
  weightKg: number,
  amount: number,
): number {
  return burnKcal(kind, weightKg, minutesOfAmount(kind, amount));
}

/* ---------- 明天练什么 ---------- */


export interface ExerciseAdvice {
  def: ExerciseDef;
  /** 建议做多少分钟 */
  minutes: number;
  /** 按当前体重，这些分钟大约消耗多少 */
  kcal: number;
  /** 为什么给这个建议 */
  why: string;
}

/**
 * 明天的运动建议。
 *
 * 三条规则，顺序不能换：
 *
 * (1) 安全先于效果。有高血压的人，先剔掉不要命的项目，再谈消耗。
 * (2) 效果服从于能坚持。给一个 46 岁、78 公斤、天天跑业务的人排
 *     一小时高强度，他做两天就停了。停掉的计划消耗是 0。
 * (3) 不惩罚昨天。今天吃多了，明天不是"加练把账还上" ——
 *     这个逻辑一旦成立，他会开始用运动赎罪，而赎罪是会崩的。
 */
export function adviseTomorrow(
  profile: Profile,
  weightKg: number,
  today: { kcal: number; budget: number; protein: number; proteinTarget: number },
): ExerciseAdvice[] {
  const { minutes } = suggestMinutes(today);

  // 候选池：按他的身体状况筛，不是把所有项目倒给他
  const pool = EXERCISES.filter((e) => !riskOf(e.kind, profile, weightKg));

  // 排序：先看关节友好（能长期做），再看 MET 是否配得上今天的时长
  const ranked = [...pool].sort((a, b) => {
    if (a.jointSafe !== b.jointSafe) return a.jointSafe ? -1 : 1;
    return b.met - a.met;
  });

  return ranked.slice(0, 3).map((def) => adviceOf(def.kind, minutes, weightKg, profile));
}

/**
 * 建议做多少分钟。
 *
 * 以指南的"每周 4-7 天、每次 30 分钟中等强度"为基线，
 * 按今天超支的幅度微调，封顶 45 分钟。再多就不现实了。
 */
export function suggestMinutes(today: { kcal: number; budget: number }): {
  minutes: number;
  why: string;
} {
  const over = today.kcal - today.budget;

  let minutes = 30;
  if (over > 500) minutes = 45;
  else if (over > 0) minutes = 35;
  else if (over < -300) minutes = 20;

  let why = "指南给成年人的基本量：一周四到五次、每次半小时左右";
  if (over > 500) {
    why = "今天超得不少，多十分钟；但真正的账要明天在饭桌上还，不在这半小时里";
  } else if (over > 0) {
    why = "今天略微超了一点，加五分钟就够，不用额外惩罚自己";
  } else if (over < -300) {
    why = "今天吃得偏少，运动量就别加了，先保证吃够";
  }
  return { minutes, why };
}

/**
 * 给某一项运动配一句人话。
 *
 * 用户在输入框里点名了他想做的项目，这时候不该再劝他换一个 ——
 * 他要的是"这个做多久合适、大约多少卡"，不是被系统改志愿。
 * 所以这里只算两件事：按时长算消耗、说清这一项对他的意义。
 *
 * 时长是怎么来的，不在这句里说 —— 三个项目各重复一遍"为什么是 30 分钟"
 * 就成了噪音。那段话只在面板上出现一次（见 suggestMinutes）。
 */
export function adviceOf(
  kind: ExerciseKind,
  minutes: number,
  weightKg: number,
  profile: Profile,
): ExerciseAdvice {
  const def = exerciseDef(kind);
  const risk = riskOf(kind, profile, weightKg);

  let why: string;
  if (risk) {
    why = risk;
  } else if (def.caution) {
    why = `${def.note}。${def.caution}`;
  } else {
    why = def.note;
  }

  return {
    def,
    minutes,
    kcal: burnKcal(kind, weightKg, minutes),
    why,
  };
}

/**
 * 这一项对他有没有风险。返回一句提醒，没有风险返回 null。
 * 不拦着他做 —— 他要真想打羽毛球，系统没资格说不；
 * 但已经有高血压的人不该在不知情的情况下被推去打羽毛球。
 */
export function riskOf(
  kind: ExerciseKind,
  profile: Profile,
  weightKg: number,
): string | null {
  const hypertension = profile.diseases.includes("hypertension");
  const heavy = weightKg > 0 && weightKg - profile.targetWeightKg > 12;

  if (hypertension && (kind === "jog" || kind === "badminton" || kind === "rope")) {
    return "血压没控好的时候，这种有冲刺和憋气的项目先放一放，改成快走或骑车";
  }
  if (heavy && (kind === "stairs" || kind === "jog" || kind === "rope")) {
    return "体重还没降下来之前，跳跃和上下楼对膝盖不划算，换成游泳或骑车";
  }
  return null;
}
