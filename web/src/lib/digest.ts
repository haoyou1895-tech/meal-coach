/**
 * 一行「使用概况」：只回答"还在不在用"，不含任何一条具体记录。
 *
 * 为什么要有这个东西：备份是给换手机用的，几千条记录、上万字符，
 * 微信内置浏览器根本不让你下载文件，复制也粘不下 —— 那个通道天生走不通。
 * 但判断"这个人还在不在用"只需要几个数字。
 * 用一万字的方案去解决两百字的需求，就是它存在的理由。
 *
 * 刻意不含：吃了什么、体重具体多少、疾病史。
 * 它唯一的用途是让人一眼看出"记了几天、断在哪天"，所以只留计数和日期。
 */

export type DigestInput = {
  meals: { date: string }[];
  weights: { date: string }[];
  exercises: { date: string; minutes: number }[];
  closedDays: { date: string }[];
};

export type Digest = {
  /** 首次记录日期 */
  first: string;
  /** 最后一次记录日期 */
  last: string;
  /** 有记录的天数（不是首尾跨度 —— 中间空着的不算） */
  days: number;
  /** 总餐数 */
  meals: number;
  /** 最长连续记录天数 */
  bestRun: number;
  /** 中间断过几次（隔了 ≥2 天算一次） */
  gaps: number;
  /** 最后一次记录距今几天；今天记过就是 0 */
  sinceLast: number;
  /** 体重记了几次 */
  weights: number;
  /** 运动记了几次 */
  exercises: number;
  /** 运动累计多少分钟 */
  exerciseMinutes: number;
  /** 收工过几天 */
  closedDays: number;
  /** 有记录的那几天平均一天几顿 */
  perDay: number;
};

/** yyyy-mm-dd → 第几天。用 UTC 是为了不受时区和夏令时影响 */
const dayNum = (iso: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000;
};

function uniqDays(list: { date: string }[]): string[] {
  const set = new Set<string>();
  for (const x of list) {
    if (dayNum(x.date) === dayNum(x.date)) set.add(x.date); // NaN 检查
  }
  return [...set].sort();
}

/**
 * 数据不够就返回 null，不返回一堆 0 ——
 * 一串 0 看起来像"他用了但什么都没记"，那会得出反向结论。
 */
export function buildDigest(
  input: DigestInput,
  todayIso: string,
): Digest | null {
  const dates = uniqDays(input.meals);
  if (!dates.length) return null;

  let bestRun = 1;
  let run = 1;
  let gaps = 0;
  for (let i = 1; i < dates.length; i++) {
    const step = dayNum(dates[i]) - dayNum(dates[i - 1]);
    if (step === 1) {
      run += 1;
    } else {
      run = 1;
      if (step > 1) gaps += 1;
    }
    if (run > bestRun) bestRun = run;
  }

  const last = dates[dates.length - 1];
  const today = dayNum(todayIso);
  const sinceLast = Number.isFinite(today) ? today - dayNum(last) : 0;

  return {
    first: dates[0],
    last,
    days: dates.length,
    meals: input.meals.length,
    bestRun,
    gaps,
    sinceLast: sinceLast > 0 ? sinceLast : 0,
    weights: uniqDays(input.weights).length,
    exercises: input.exercises.length,
    exerciseMinutes: input.exercises.reduce(
      (sum, e) => sum + (Number(e.minutes) || 0),
      0,
    ),
    closedDays: uniqDays(input.closedDays).length,
    perDay: Math.round((input.meals.length / dates.length) * 10) / 10,
  };
}

/**
 * 一行码。
 * 键名故意短 —— 这段文字要被人手动复制、粘进微信，
 * 每个字都在增加"复制漏了一段"的概率。
 */
export function digestCode(d: Digest): string {
  return JSON.stringify({
    v: 1,
    f: d.first,
    l: d.last,
    days: d.days,
    meals: d.meals,
    best: d.bestRun,
    gaps: d.gaps,
    since: d.sinceLast,
    w: d.weights,
    ex: d.exercises,
    exm: d.exerciseMinutes,
    close: d.closedDays,
    per: d.perDay,
  });
}

/**
 * 给人看的一行摘要。
 * 有它的理由：交数据的人得知道自己交的是什么。
 * 只显示一串乱码，他会怀疑"这是不是把我体重发给别人了"。
 */
export function digestSummary(d: Digest): string {
  const span =
    d.first === d.last
      ? d.first.slice(5)
      : `${d.first.slice(5)} 到 ${d.last.slice(5)}`;
  const tail =
    d.sinceLast === 0
      ? "今天还记了"
      : d.sinceLast === 1
        ? "最后一次是昨天"
        : `最后一次是 ${d.sinceLast} 天前`;
  return `${span} · 记了 ${d.days} 天 ${d.meals} 顿 · 最长连着 ${d.bestRun} 天 · ${tail}`;
}
