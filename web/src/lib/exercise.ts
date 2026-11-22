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

export interface ExerciseDef {
  kind: ExerciseKind;
  label: string;
  /** 代谢当量，取自体力活动纲要（Compendium of Physical Activities） */
  met: number;
  /** 加进来时的默认时长 */
  defaultMin: number;
  /** 图标只做分组：移动 / 力量 / 舒缓，不给每项单独画 */
  icon: "walk" | "dumbbell" | "heart";
  /** 这个运动对他意味着什么，一句话 */
  note: string;
  /** 高血压、体重偏大的人要注意的地方。没有就不填 */
  caution?: string;
  /** 关节负担小，膝盖不好也能做 */
  jointSafe?: boolean;
}

/**
 * 运动库。刻意只有十一项。
 *
 * 不做一个几十项的大菜单：他打开这个面板是在饭局散场后、或者睡前，
 * 不是来逛商场的。给多了他反而挑不出来，最后一项都不选。
 * 这十一项覆盖了 46 岁、体重 78 公斤的男性真实会做的事，
 * 从"楼下遛一圈"到"游个泳"，中间没有断层。
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
    icon: "walk",
    note: "最省事的一种，出门就能做",
    jointSafe: true,
  },
  {
    kind: "stroll",
    label: "散步",
    met: 3.0,
    defaultMin: 40,
    icon: "walk",
    note: "饭后溜达，主要是让血糖别蹿太快",
    jointSafe: true,
  },
  {
    kind: "jog",
    label: "慢跑",
    met: 7.0,
    defaultMin: 30,
    icon: "walk",
    note: "同样时间消耗最大，但别一上来就冲",
    caution: "血压没控好的时候先别跑，改成快走",
  },
  {
    kind: "bike",
    label: "骑车",
    met: 6.8,
    defaultMin: 40,
    icon: "walk",
    note: "膝盖不吃力，通勤路上就能完成",
    jointSafe: true,
  },
  {
    kind: "swim",
    label: "游泳",
    met: 6.0,
    defaultMin: 30,
    icon: "walk",
    note: "对关节最友好的有氧",
    jointSafe: true,
  },
  {
    kind: "stairs",
    label: "爬楼",
    met: 5.0,
    defaultMin: 15,
    icon: "walk",
    note: "十几分钟就顶得上散步半小时",
    caution: "下楼伤膝盖，坐电梯下来",
  },
  {
    kind: "taiji",
    label: "太极",
    met: 3.0,
    defaultMin: 40,
    icon: "heart",
    note: "消耗不大，但对血压和平衡是真有用",
    jointSafe: true,
  },
  {
    kind: "dance",
    label: "广场舞",
    met: 4.5,
    defaultMin: 40,
    icon: "heart",
    note: "能坚持下来的运动才算运动",
    jointSafe: true,
  },
  {
    kind: "badminton",
    label: "羽毛球",
    met: 5.5,
    defaultMin: 40,
    icon: "walk",
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
    icon: "walk",
    note: "拖地擦窗也算，不用换衣服",
    jointSafe: true,
  },
];

const BY_KIND = new Map(EXERCISES.map((e) => [e.kind, e]));

export function exerciseDef(kind: ExerciseKind): ExerciseDef {
  return BY_KIND.get(kind) ?? EXERCISES[0];
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
  const over = today.kcal - today.budget;
  const hypertension = profile.diseases.includes("hypertension");
  const heavy = weightKg > 0 && weightKg - profile.targetWeightKg > 12;

  // 时长：以指南的"每周 4-7 天、每次 30 分钟中等强度"为基线，
  // 按今天超支的幅度微调，封顶 45 分钟。再多就不现实了。
  let minutes = 30;
  if (over > 500) minutes = 45;
  else if (over > 0) minutes = 35;
  else if (over < -300) minutes = 20;

  // 为什么给这个时长，得说人话
  let why = "指南给成年人的基本量：一周四到五次、每次半小时左右";
  if (over > 500) {
    why = "今天超得不少，多十分钟；但真正的账要明天在饭桌上还，不在这半小时里";
  } else if (over > 0) {
    why = "今天略微超了一点，加五分钟就够，不用额外惩罚自己";
  } else if (over < -300) {
    why = "今天吃得偏少，运动量就别加了，先保证吃够";
  }

  // 候选池：按他的身体状况筛，不是把所有项目倒给他
  const pool = EXERCISES.filter((e) => {
    // 血压没控好的人，不优先推高冲击
    if (hypertension && (e.kind === "jog" || e.kind === "badminton")) return false;
    // 体重基数大，跳跃和爬楼对膝盖不划算
    if (heavy && (e.kind === "stairs" || e.kind === "jog")) return false;
    return true;
  });

  // 排序：先看关节友好（能长期做），再看 MET 是否配得上今天的时长
  const ranked = [...pool].sort((a, b) => {
    if (a.jointSafe !== b.jointSafe) return a.jointSafe ? -1 : 1;
    return b.met - a.met;
  });

  return ranked.slice(0, 3).map((def) => ({
    def,
    minutes,
    kcal: burnKcal(def.kind, weightKg, minutes),
    why: def.caution ? `${def.note}。${def.caution}` : def.note,
  }));
}
