/**
 * 极简频率限制
 *
 * 为什么需要：/api/recognize 一旦部署到公网就是公开地址，
 * 任何人拿到链接都能直接调用，烧的是你自己的账户额度。
 * 这层限制保证「最坏情况有上限」。
 *
 * 已知局限（诚实说明）：
 * 内存计数只在单个实例内有效，Serverless 冷启动或扩容会重置/分片。
 * 对「一个人用的小工具」够用；要严格限制得换 Redis / KV。
 */

type Bucket = { count: number; reset: number };

export type Limiter = {
  check: (
    ip: string,
  ) => { ok: true } | { ok: false; status: number; message: string };
  info: () => { perMinute: number; perDay: number; usedToday: number };
};

/**
 * 造一个限流器。
 *
 * 为什么要能造多个：拍照识别和「改菜名后重估热量」是两件成本完全不同的事
 * （一个是视觉模型、一个只是文本），共用一个计数器会导致改名把拍照的额度吃光。
 * 分开算，各花各的。
 */
export function createLimiter(
  opts: {
    perMinute?: number;
    perDay?: number;
    dayMessage?: string;
  } = {},
): Limiter {
  const perMinute = opts.perMinute ?? Number(process.env.RATE_PER_MINUTE || 6);
  const perDay = opts.perDay ?? Number(process.env.RATE_PER_DAY || 80);
  const dayMessage =
    opts.dayMessage ?? "今天的识别次数用完了，明天再记吧";

  const ipBuckets = new Map<string, Bucket>();
  // 全局当日计数：防止换了 IP 也能刷（比如手机流量切换）
  let dayStamp = "";
  let dayCount = 0;

  function today(): string {
    // 用东八区日期，避免凌晨 0 点按 UTC 算错一天
    const now = new Date(Date.now() + 8 * 3600_000);
    return now.toISOString().slice(0, 10);
  }

  return {
    check(ip: string) {
      const now = Date.now();
      const todayStr = today();

      if (dayStamp !== todayStr) {
        dayStamp = todayStr;
        dayCount = 0;
      }

      if (perDay > 0 && dayCount >= perDay) {
        return { ok: false, status: 429, message: dayMessage };
      }

      const bucket = ipBuckets.get(ip);
      if (!bucket || now > bucket.reset) {
        ipBuckets.set(ip, { count: 1, reset: now + 60_000 });
        if (perDay > 0) dayCount++;
        return { ok: true };
      }

      if (bucket.count >= perMinute) {
        return {
          ok: false,
          status: 429,
          message: "点得太快了，歇一分钟再试",
        };
      }

      bucket.count++;
      if (perDay > 0) dayCount++;
      return { ok: true };
    },
    info() {
      return { perMinute, perDay, usedToday: dayCount };
    },
  };
}

/** 拍照识别用的限额，读环境变量，跟以前一样 */
const recognizeLimiter = createLimiter();

export const checkRate = recognizeLimiter.check;

export const rateLimitInfo = recognizeLimiter.info;
