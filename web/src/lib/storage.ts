/**
 * 本地存储的读写，只做「拿字符串 / 存字符串」这一件事。
 *
 * 单独一层是为了让 store.ts 变成平台无关的纯逻辑：
 * 浏览器用 localStorage，小程序换成 Taro 的 Storage，
 * 两边的记录合并、体重取最近一次、补拍合并照片这些规则完全一样，不该抄两遍。
 */

export function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 存不下（配额满）时返回 false，让调用方自己决定丢什么 */
export function writeRaw(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeRaw(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 隐私模式下会抛，忽略 */
  }
}
