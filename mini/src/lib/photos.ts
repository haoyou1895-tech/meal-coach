import Taro from "@tarojs/taro";
import type { Meal } from "./types";

/**
 * 一条记录有哪些照片。这段是纯函数，跟网页版一字不差 ——
 * 老数据有 image / photoId / photoIds 三种写法，只有这里统一成数组。
 */
export function photoIdsOf(m: Meal): string[] {
  if (m.photoIds?.length) return m.photoIds;
  if (m.photoId) return [m.photoId];
  return [];
}

export function legacyImageOf(m: Meal): string | null {
  return m.image ?? null;
}

/**
 * 照片仓库，小程序版。
 *
 * 网页版用 IndexedDB，小程序没有 IndexedDB，但有文件系统：
 * 拍照拿到的临时文件会被系统清掉，所以必须搬进 USER_DATA_PATH 才算存住。
 * 记录里只存一个文件名，取的时候拼回绝对路径，界面直接 <Image src={path}>。
 *
 * 仍然只存这台手机，不上传。
 */
const cache = new Map<string, string>();

function dir(): string {
  return `${Taro.env.USER_DATA_PATH}/photos`;
}

function fs() {
  return Taro.getFileSystemManager();
}

function ensureDir() {
  try {
    fs().accessSync(dir());
  } catch {
    try {
      fs().mkdirSync(dir(), true);
    } catch {
      /* 已经存在时会抛，忽略 */
    }
  }
}

function pathOf(id: string): string {
  return `${dir()}/${id}.jpg`;
}

/**
 * 存一张。dataUrl 可以是 data:image/jpeg;base64,xxx，
 * 也可以是一个本地临时文件路径（拍照/选图拿到的就是路径）。
 */
export async function putPhoto(id: string, dataUrl: string): Promise<boolean> {
  ensureDir();
  const dest = pathOf(id);
  try {
    if (dataUrl.startsWith("data:")) {
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      fs().writeFileSync(dest, base64, "base64");
    } else {
      fs().copyFileSync(dataUrl, dest);
    }
    cache.set(id, dest);
    return true;
  } catch (e) {
    console.warn("照片存不下", e);
    return false;
  }
}

/** 返回可以直接放进 <Image src> 的路径，没有就 null */
export async function getPhoto(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = pathOf(id);
  try {
    fs().accessSync(p);
    cache.set(id, p);
    return p;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  cache.delete(id);
  try {
    fs().unlinkSync(pathOf(id));
  } catch {
    /* 本来就没有 */
  }
}

export async function clearPhotos(): Promise<void> {
  cache.clear();
  try {
    fs().rmdirSync(dir(), true);
  } catch {
    /* 目录不存在 */
  }
}

export async function photoStorageReady(): Promise<boolean> {
  return true;
}
