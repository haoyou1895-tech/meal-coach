/**
 * 把「快走四十分钟，游泳半小时」这句话拆成几条运动。
 *
 * 为什么要做这件事，而不是让他点按钮：
 * 点按钮的前提是他先认出"我做的事叫什么"。可他说的是"楼下遛了一圈""打了两局乒乓"，
 * 这些话和按钮上的"散步""乒乓球"之间隔着一层翻译 —— 而翻译这一步，
 * 只要有一次对不上，他就不记了。所以输入框必须收口语。
 *
 * 规则很简单，只有三层：
 * 1. 先认项目（别名表，长词优先，"慢跑"不会被"跑"抢走）
 * 2. 再认时长（数字、中文数字、半小时、一个半小时）
 * 3. 认不出来但有时长的，当成"其他运动"存下来，用他原话当名字
 *
 * 刻意不上大模型：这句话的词汇量就那么多，规则能覆盖九成，
 * 而且规则是立刻出结果的 —— 他说完话半秒内必须看到结果，
 * 等两秒他就以为没听清，会再说一遍。
 */

import { EXERCISES, exerciseDef } from "./exercise";
import type { ExerciseKind } from "./types";

export interface ParsedExercise {
  kind: ExerciseKind;
  /** kind=other 时的项目名，用他原话 */
  label?: string;
  /** 这里给的是兜底时长；调用方可以换成自己的建议时长 */
  minutes: number;
  /** 时长是他自己说的，还是我们兜的 */
  explicit: boolean;
}

/**
 * 别名表。左边是他会说的话，右边是库里的项目。
 *
 * 只收"说了就知道是什么"的词。"打球""锻炼"这种不收 ——
 * 打篮球和打乒乓的消耗差一倍，猜错了账就是假的，不如落到"其他运动"里明说按中等算。
 */
const ALIASES: [string, ExerciseKind][] = [
  // 走
  ["快步走", "walk"],
  ["快走", "walk"],
  ["健走", "walk"],
  ["走步", "walk"],
  ["走路", "walk"],
  ["步行", "walk"],
  ["散步", "stroll"],
  ["遛弯", "stroll"],
  ["溜达", "stroll"],
  ["遛狗", "stroll"],
  ["闲逛", "stroll"],
  // 跑
  ["慢跑", "jog"],
  ["跑步", "jog"],
  ["晨跑", "jog"],
  ["夜跑", "jog"],
  ["跑了", "jog"],
  ["跑步机", "jog"],
  // 骑
  ["动感单车", "bike"],
  ["骑自行车", "bike"],
  ["自行车", "bike"],
  ["骑车", "bike"],
  ["单车", "bike"],
  ["骑行", "bike"],
  // 水
  ["游泳", "swim"],
  ["游了", "swim"],
  // 楼
  ["爬楼梯", "stairs"],
  ["爬楼", "stairs"],
  ["上楼", "stairs"],
  ["登楼", "stairs"],
  // 传统
  ["太极拳", "taiji"],
  ["太极", "taiji"],
  ["八段锦", "baduanjin"],
  ["瑜伽", "yoga"],
  // 舞 / 操
  ["广场舞", "dance"],
  ["跳舞", "dance"],
  ["舞蹈", "dance"],
  ["健身操", "aerobic"],
  ["健美操", "aerobic"],
  ["有氧操", "aerobic"],
  ["跳操", "aerobic"],
  // 球
  ["羽毛球", "badminton"],
  ["乒乓球", "pingpong"],
  ["乒乓", "pingpong"],
  // 其他
  ["力量训练", "strength"],
  ["力量", "strength"],
  ["撸铁", "strength"],
  ["举铁", "strength"],
  ["健身", "strength"],
  ["器械", "strength"],
  ["深蹲", "strength"],
  ["俯卧撑", "strength"],
  ["爬山", "hike"],
  ["登山", "hike"],
  ["徒步", "hike"],
  ["跳绳", "rope"],
  ["家务", "chore"],
  ["拖地", "chore"],
  ["扫地", "chore"],
  ["打扫", "chore"],
  ["擦窗", "chore"],
  ["收拾屋子", "chore"],
].sort((a, b) => b[0].length - a[0].length) as [string, ExerciseKind][];

/** 全角转半角，顺手把各种标点统一成逗号 */
function normalize(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[，、。；;,.!?！？\s]+/g, ",")
    .trim();
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 只处理到九十九，运动时长不会更大 */
function toNumber(s: string): number | null {
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === "半") return 0.5;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    const tens = a ? CN_DIGIT[a] : 1;
    const ones = b ? CN_DIGIT[b] : 0;
    if (tens === undefined || ones === undefined) return null;
    return tens * 10 + ones;
  }
  const v = CN_DIGIT[s];
  return v === undefined ? null : v;
}

const NUM = "(?:(\\d+(?:\\.\\d+)?)|(半)|([一二两三四五六七八九十]+))";

interface Span {
  start: number;
  end: number;
  minutes: number;
  /** "各半小时" —— 这一段时间要分给前后几个项目 */
  each: boolean;
}

/** 在 text 里找第一个时长表达 */
function findDuration(text: string): Span | null {
  if (!text) return null;
  // "走了三公里"不是时长，别把 3 当成 3 分钟
  if (/公里|千米|km|步/.test(text)) return null;

  // 小时档：两小时、一个半小时、半小时、1.5 小时
  // NUM 自带三个捕获组，所以后面的组号从 4 开始
  const hourRe = new RegExp(`${NUM}\\s*个?\\s*(半)?\\s*(小时|钟头|h)`);
  const hm = hourRe.exec(text);
  if (hm) {
    const v = toNumber(hm[1] ?? hm[2] ?? hm[3] ?? "");
    if (v !== null) {
      const minutes = Math.round((hm[4] ? v + 0.5 : v) * 60);
      return {
        start: hm.index,
        end: hm.index + hm[0].length,
        minutes,
        each: /各|都|均/.test(text.slice(Math.max(0, hm.index - 2), hm.index)),
      };
    }
  }

  // 一刻钟
  const qm = /一刻钟/.exec(text);
  if (qm) {
    return { start: qm.index, end: qm.index + 3, minutes: 15, each: false };
  }

  // 分钟档：四十分钟、40 min、半小时
  const minRe = new RegExp(`${NUM}\\s*(分钟|分|min)`);
  const mm = minRe.exec(text);
  if (mm) {
    const v = toNumber(mm[1] ?? mm[2] ?? mm[3] ?? "");
    if (v !== null) {
      return {
        start: mm.index,
        end: mm.index + mm[0].length,
        minutes: Math.round(v),
        each: /各|都|均/.test(text.slice(Math.max(0, mm.index - 2), mm.index)),
      };
    }
  }

  // 光溜溜一个数字，没单位：当成分钟（"快走 40"）
  const bare = /(\d{1,3})/.exec(text);
  if (bare) {
    return {
      start: bare.index,
      end: bare.index + bare[0].length,
      minutes: Number(bare[1]),
      each: false,
    };
  }
  return null;
}

interface Hit {
  start: number;
  end: number;
  kind: ExerciseKind;
  word: string;
}

function findAliases(text: string): Hit[] {
  // 已经占掉的位置打标，避免"慢跑"里再吃出一个"跑"
  const taken = new Array(text.length).fill(false);
  const hits: Hit[] = [];

  for (const [word, kind] of ALIASES) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(word, from);
      if (i < 0) break;
      let free = true;
      for (let k = i; k < i + word.length; k++) if (taken[k]) free = false;
      if (free) {
        for (let k = i; k < i + word.length; k++) taken[k] = true;
        hits.push({ start: i, end: i + word.length, kind, word });
      }
      from = i + word.length;
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function clamp(minutes: number): number {
  return Math.max(5, Math.min(240, Math.round(minutes)));
}

/** 他说的这些词说明今天没动，不该被解析成一条运动 */
const NEGATIVE = /没动|没有动|没运动|休息|没练|不想动/;

/**
 * 解析一句话。解析不出来返回空数组，由界面提示他换个说法。
 */
export function parseExerciseText(input: string): ParsedExercise[] {
  const text = normalize(input);
  if (!text) return [];

  const hits = findAliases(text);

  if (!hits.length) {
    if (NEGATIVE.test(text)) return [];
    // 没认出来，但有时长 —— 那就是个库里没有的项目，用原话存
    const d = findDuration(text);
    if (!d) return [];
    const rest = (text.slice(0, d.start) + text.slice(d.end))
      .replace(/,/g, "")
      .replace(/做了|进行|运动|锻炼|了/g, "")
      .trim();
    if (!rest || rest.length > 8) return [];
    return [{ kind: "other", label: rest, minutes: clamp(d.minutes), explicit: true }];
  }

  // 先看有没有"各半小时"这种共享时长
  let shared = 0;
  for (const h of hits) {
    const next = hits.find((x) => x.start >= h.end);
    const seg = text.slice(h.end, next ? next.start : text.length);
    const d = findDuration(seg);
    if (d?.each) shared = d.minutes;
  }

  const out: ParsedExercise[] = [];
  hits.forEach((h, i) => {
    const segEnd = hits[i + 1]?.start ?? text.length;
    const seg = text.slice(h.end, segEnd);
    // 时长一般跟在项目后面（"快走四十分钟"），但也会说在前面（"打了半小时乒乓球"）
    let d = findDuration(seg);
    if (!d && hits.length === 1) d = findDuration(text.slice(0, h.start));

    const explicit = !!d;
    const minutes = explicit
      ? clamp(d!.minutes)
      : shared || exerciseDef(h.kind).defaultMin;

    out.push({
      kind: h.kind,
      minutes,
      explicit: explicit || shared > 0,
    });
  });

  // 同名同类的合并，别让"快走十分钟，又走了二十分钟"变两条
  const merged: ParsedExercise[] = [];
  for (const p of out) {
    const prev = merged.find((m) => m.kind === p.kind && p.kind !== "other");
    if (prev) prev.minutes = clamp(prev.minutes + p.minutes);
    else merged.push({ ...p });
  }
  return merged;
}

/** 一句话里所有项目名，给界面做提示用 */
export function describeParsed(list: ParsedExercise[]): string {
  return list
    .map((p) => `${p.kind === "other" ? p.label : exerciseDef(p.kind).label} ${p.minutes} 分钟`)
    .join("、");
}

/** 库里所有项目名，输入框的占位提示从这里取两个例子 */
export const SAMPLE_HINT = `${EXERCISES[0].label} 40 分钟、游泳半小时`;
