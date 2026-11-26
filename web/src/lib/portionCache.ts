/**
 * AI 想出来的档位放在本地 —— 同一个词只问一次。
 *
 * 为什么必须缓存，而不只是「少请求几次」：
 * ① 延迟。没缓存时输入「玉米」要等 1~2 秒才出档位，有缓存是瞬出。
 *    同一个东西他一个月吃十几次，让他等十几次是不合理的。
 * ② 稳定。他今天看到玉米问「根」和「两根」，下次变成「一根」和「三根」，
 *    会觉得这东西不靠谱 —— 而这件事本地能保证，不花一分钱。
 *
 * 为什么单独一个文件、不塞进 manual.ts：
 * manual.ts 在同步清单里，要原样复制到小程序。它引一个 localStorage 过去，
 * 小程序那边直接崩（Taro 没有这个全局）。所以带浏览器能力的东西必须留在 web。
 *
 * 存不进去（配额满、隐私模式）时静默跳过 —— 下次再问一遍而已，
 * 不能因为缓存写失败把整个录入流程弄挂。
 */

export type CachedClass = {
  id: string;
  prompt: string;
  presets: Array<{ label: string; amount: number; unit: "克" | "毫升" }>;
};

const KEY = "canmou.portion.v1";
/** 食物名不会无限多，但也不能不管 —— 手机存储配额就 5MB */
const MAX = 200;

type Entry = { cls: CachedClass; t: number };
type Bag = Record<string, Entry>;

function read(): Bag {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const bag = JSON.parse(raw) as Bag;
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) return {};
    return bag;
  } catch {
    // 存的东西坏了就当没有，下次重新问
    return {};
  }
}

/** 读的时候也要校验 —— 缓存可能是上一版代码写的，字段对不上就当作没有 */
export function getCached(name: string): CachedClass | null {
  const key = (name || "").trim();
  if (!key) return null;
  const entry = read()[key];
  const cls = entry?.cls;
  if (!cls || typeof cls.prompt !== "string" || !cls.prompt) return null;
  if (!Array.isArray(cls.presets) || cls.presets.length < 2) return null;
  const ok = cls.presets.every(
    (p) =>
      p &&
      typeof p.label === "string" &&
      p.label.length > 0 &&
      typeof p.amount === "number" &&
      p.amount > 0,
  );
  return ok ? cls : null;
}

export function putCached(name: string, cls: CachedClass): void {
  const key = (name || "").trim();
  if (!key || typeof localStorage === "undefined") return;
  try {
    const bag = read();
    bag[key] = { cls, t: Date.now() };
    const keys = Object.keys(bag);
    if (keys.length > MAX) {
      // 超过上限就丢最久没用的 —— 他上个月吃的那个东西也不会再问第二遍
      keys
        .sort((a, b) => (bag[a]?.t ?? 0) - (bag[b]?.t ?? 0))
        .slice(0, keys.length - MAX)
        .forEach((k) => delete bag[k]);
    }
    localStorage.setItem(KEY, JSON.stringify(bag));
  } catch {
    // 配额满 / 隐私模式：跳过。下次多问一遍模型而已
  }
}
