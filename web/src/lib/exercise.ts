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
 * 运动图标一律取 Lucide（v0.469.0）里的现成图标，不自己画。
 *
 * 早先只有"走路 / 哑铃 / 心"三个图标做分组，十七项运动挤在三个符号上，
 * 看起来像同一件事 —— 而"游泳"和"家务"是两件事。
 *
 * 但也不能十七项各画一个：乒乓球和羽毛球的区别，24px 下画不出来，
 * 硬画只会得到两个都看不懂的方块。
 * 所以按"动作方式"分配，同一种方式共用图标（快走和散步都是脚印），
 * 靠旁边的中文名区分 —— 图标是索引，不是名词。
 */
export type ExerciseIcon =
  | "footprints"
  | "bike"
  | "waves"
  | "trendingUp"
  | "personStanding"
  | "music"
  | "circleDot"
  | "dumbbell"
  | "mountain"
  | "zap"
  | "activity"
  | "sprayCan"
  | "move";

export interface ExerciseDef {
  kind: ExerciseKind;
  label: string;
  /** 代谢当量，取自体力活动纲要（Compendium of Physical Activities） */
  met: number;
  /** 加进来时的默认时长 */
  defaultMin: number;
  /** 取 Lucide 图标名，见上方 ExerciseIcon */
  icon: ExerciseIcon;
  /** 这个运动对他意味着什么，一句话 */
  note: string;
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
    icon: "footprints",
    note: "最省事的一种，出门就能做",
    jointSafe: true,
    },
  {
    kind: "stroll",
    label: "散步",
    met: 3.0,
    defaultMin: 40,
    icon: "footprints",
    note: "饭后溜达，主要是让血糖别蹿太快",
    jointSafe: true,
    },
  {
    kind: "jog",
    label: "慢跑",
    met: 7.0,
    defaultMin: 30,
    icon: "activity",
    note: "同样时间消耗最大，但别一上来就冲",
    caution: "血压没控好的时候先别跑，改成快走",
    },
  {
    kind: "bike",
    label: "骑车",
    met: 6.8,
    defaultMin: 40,
    icon: "bike",
    note: "膝盖不吃力，通勤路上就能完成",
    jointSafe: true,
    },
  {
    kind: "swim",
    label: "游泳",
    met: 6.0,
    defaultMin: 30,
    icon: "waves",
    note: "对关节最友好的有氧",
    jointSafe: true,
    },
  {
    kind: "stairs",
    label: "爬楼",
    met: 5.0,
    defaultMin: 15,
    icon: "trendingUp",
    note: "十几分钟就顶得上散步半小时",
    caution: "下楼伤膝盖，坐电梯下来",
    },
  {
    kind: "taiji",
    label: "太极",
    met: 3.0,
    defaultMin: 40,
    icon: "personStanding",
    note: "消耗不大，但对血压和平衡是真有用",
    jointSafe: true,
    },
  {
    kind: "dance",
    label: "广场舞",
    met: 4.5,
    defaultMin: 40,
    icon: "music",
    note: "能坚持下来的运动才算运动",
    jointSafe: true,
    },
  {
    kind: "badminton",
    label: "羽毛球",
    met: 5.5,
    defaultMin: 40,
    icon: "circleDot",
    note: "有来有回，比一个人练容易坚持",
    },
  {
    kind: "strength",
    label: "力量训练",
    met: 3.5,
    defaultMin: 25,
    icon: "dumbbell",
    note: "减重时保住肌肉，靠的是这个",
    caution: "发力时呼气，别憋着劲举",
    },
  {
    kind: "chore",
    label: "家务",
    met: 3.3,
    defaultMin: 40,
    icon: "sprayCan",
    note: "拖地擦窗也算，不用换衣服",
    jointSafe: true,
    },
  {
    kind: "yoga",
    label: "瑜伽",
    met: 2.5,
    defaultMin: 40,
    icon: "personStanding",
    note: "消耗不大，主要是让人肯躺下来放松",
    jointSafe: true,
    },
  {
    kind: "baduanjin",
    label: "八段锦",
    met: 3.0,
    defaultMin: 20,
    icon: "personStanding",
    note: "十几分钟一套，比太极门槛低，在家就能做",
    jointSafe: true,
    },
  {
    kind: "pingpong",
    label: "乒乓球",
    met: 4.0,
    defaultMin: 40,
    icon: "circleDot",
    note: "有对手才打得起来，强度全看对面",
    jointSafe: true,
    },
  {
    kind: "hike",
    label: "爬山",
    met: 6.0,
    defaultMin: 60,
    icon: "mountain",
    note: "一次顶好几次散步，但下来那半天腿是废的",
    caution: "下山对膝盖的冲击最大，有登山杖就用上",
    },
  {
    kind: "rope",
    label: "跳绳",
    met: 10.0,
    defaultMin: 10,
    icon: "zap",
    note: "十分钟就出汗，性价比最高的有氧",
    caution: "体重偏大的先别跳，膝盖承受不住",
    },
  {
    kind: "aerobic",
    label: "健身操",
    met: 6.5,
    defaultMin: 30,
    icon: "activity",
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
  icon: "move",
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

/* ---------- 把今天超支的，摊到明天开始补 ---------- */

export interface DebtSlice {
  date: string;
  minutes: number;
  kcal: number;
}

export interface DebtPlan {
  /** 要补回去的大卡（今天超支的数） */
  total: number;
  /** 排进计划的每一天 */
  slices: DebtSlice[];
  /** 这几天的估算消耗合计 */
  covered: number;
  /** 排不下、补不完的部分 */
  leftover: number;
  /** 单日上限 */
  capMin: number;
  /** 每分钟多少大卡，用来说明"这项够不够快" */
  perMin: number;
}

/**
 * 今天超了 500，明天要动多久。
 *
 * 这条规则是用户明确要的：他不想听"明天注意点"，他要一个能打勾的数。
 * 但它和 ADR-004「运动不换饭」的边界必须划清，否则就变成赎罪：
 *
 * 1. **只往前摊，不往回抵**。今天超的 500，不会让今天的环变大 ——
 *    今天的账已经封了口。补的这几天，动掉的是"已经吃进肚子的"，
 *    不是"再换一顿"。
 * 2. **单日封顶 45 分钟**。这是 46 岁、血压偏高、平时不太动的人能承受的上限。
 *    写 120 分钟，他第一天就不会开始，而没开始的计划消耗是 0。
 * 3. **最多摊 3 天，摊不完就说摊不完**。硬凑四天、五天，
 *    等于把一次晚饭的代价变成一个星期的刑期。
 * 4. **均分，不搞"先苦后甜"**。第一天 45 第二天 20，
 *    他会觉得被算计；每天一样长，才像一件事。
 *
 * 瑜伽这类温和项目，三天 135 分钟也补不完 500 —— 那就如实报 leftover，
 * 让他自己决定是换一项，还是接受"这次补不完"。
 */
export function spreadDebt(
  overKcal: number,
  kind: ExerciseKind,
  weightKg: number,
  startDate: string,
  capMin = 45,
  maxDays = 3,
): DebtPlan {
  const total = Math.max(0, Math.round(overKcal));
  const perMin = kcalPerMin(kind, weightKg);

  if (total <= 0 || perMin <= 0) {
    return { total, slices: [], covered: 0, leftover: total, capMin, perMin };
  }

  const need = total / perMin;
  const days = Math.min(maxDays, Math.max(1, Math.ceil(need / capMin)));
  // 均分，再向上取到 5 分钟 —— "37 分钟"这种数没人会照着做
  let each = Math.ceil(need / days / 5) * 5;
  if (each > capMin) each = capMin;

  const slices: DebtSlice[] = Array.from({ length: days }, (_, i) => ({
    date: shiftDate(startDate, i),
    minutes: each,
    kcal: Math.round(each * perMin),
  }));

  const covered = slices.reduce((s, x) => s + x.kcal, 0);
  return {
    total,
    slices,
    covered,
    leftover: Math.max(0, total - covered),
    capMin,
    perMin,
  };
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
