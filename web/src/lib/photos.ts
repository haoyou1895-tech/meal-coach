"use client";

import type { Meal } from "./types";

/**
 * 一条记录有哪些照片。
 * 兼容三个版本：最早的 image（base64）、上一版的 photoId（单张）、现在的 photoIds（多张）。
 */
export function photoIdsOf(m: Meal): string[] {
  if (m.photoIds?.length) return m.photoIds;
  if (m.photoId) return [m.photoId];
  return [];
}

/** 老的 base64 图，只有最早那批记录才有 */
export function legacyImageOf(m: Meal): string | null {
  return m.image ?? null;
}

/**
 * 餐食照片的本地仓库。
 *
 * 为什么不用 localStorage：它只有 5MB，而一张压缩后的照片约 100–150KB。
 * 二十几张就满了，所以之前只能存 320px 的小图，糊得看不清。
 *
 * IndexedDB 的配额是磁盘可用空间的一定比例，通常几百 MB 到几 GB，
 * 存几千张照片没问题。数据同样只在这台设备上，不上传任何服务器。
 */

const DB_NAME = "mealcoach-photos";
const STORE = "photos";
const VERSION = 1;

/** 内存缓存，避免列表滚动时反复读盘 */
const cache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** 存一张，返回是否成功。失败时调用方应降级处理，别让照片凭空消失 */
export async function putPhoto(id: string, dataUrl: string): Promise<boolean> {
  cache.set(id, dataUrl);
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getPhoto(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const v = typeof req.result === "string" ? req.result : null;
        if (v) cache.set(id, v);
        resolve(v);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deletePhoto(id: string): Promise<void> {
  cache.delete(id);
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearPhotos(): Promise<void> {
  cache.clear();
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Identifier / 隐私模式下 IndexedDB 可能被禁用，用来给界面提示 */
export async function photoStorageReady(): Promise<boolean> {
  return (await openDB()) !== null;
}
