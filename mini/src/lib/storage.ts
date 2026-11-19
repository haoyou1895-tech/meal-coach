import Taro from "@tarojs/taro";

/**
 * 小程序的本地存储。跟网页版的 storage.ts 接口一致，
 * 上层 store.ts 因此可以两端共用一份。
 *
 * 小程序 storage 的上限是单个 key 1MB、总共 10MB，
 * 比 localStorage 的 5MB 宽松一些，但照片仍然必须走文件系统，不能塞进来。
 */
export function readRaw(key: string): string | null {
  try {
    const v = Taro.getStorageSync(key);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): boolean {
  try {
    Taro.setStorageSync(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeRaw(key: string): void {
  try {
    Taro.removeStorageSync(key);
  } catch {
    /* 清不掉就算了，别让界面崩 */
  }
}
