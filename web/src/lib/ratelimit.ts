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

const ipBuckets = new Map<string, Bucket>();

// 全局当日计数：防止换了 IP 也能刷（比如手机流量切换）
let dayStamp = "";
let dayCount = 0;

const PER_MINUTE = Number(process.env.RATE_PER_MINUTE || 6);
const PER_DAY = Number(process.env.RATE_PER_DAY || 80);

function today(): string {
  // 用东八区日期，避免凌晨 0 点按 UTC 算错一天
  const now = new Date(Date.now() + 8 * 3600_000);
  return now.toISOString().slice(0, 10);
}

export function checkRate(ip: string):
  | { ok: true }
  | { ok: false; status: number; message: string } {
  const now = Date.now();
  const todayStr = today();

  if (dayStamp !== todayStr) {
    dayStamp = todayStr;
    dayCount = 0;
  }

  if (PER_DAY > 0 && dayCount >= PER_DAY) {
    return {
      ok: false,
      status: 429,
      message: "今天的识别次数用完了，明天再记吧",
    };
  }

  const bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.reset) {
    ipBuckets.set(ip, { count: 1, reset: now + 60_000 });
    if (PER_DAY > 0) dayCount++;
    return { ok: true };
  }

  if (bucket.count >= PER_MINUTE) {
    return {
      ok: false,
      status: 429,
      message: "点得太快了，歇一分钟再试",
    };
  }

  bucket.count++;
  if (PER_DAY > 0) dayCount++;
  return { ok: true };
}

export function rateLimitInfo() {
  return { perMinute: PER_MINUTE, perDay: PER_DAY, usedToday: dayCount };
}
