"use client";

import type {
  ActivityLevel,
  ActivityLog,
  Drink,
  DrinkKind,
  Meal,
  MealTag,
  Profile,
  WeightLog,
} from "./types";
import { photoIdsOf, putPhoto } from "./photos";

const KEY = "mealcoach.v1";

export interface AppState {
  profile: Profile | null;
  meals: Meal[];
  weights: WeightLog[];
  activities: ActivityLog[];
  /** 是否已完成首次引导 */
  onboarded: boolean;
}

const EMPTY: AppState = {
  profile: null,
  meals: [],
  weights: [],
  activities: [],
  onboarded: false,
};

export function loadState(): AppState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      profile: parsed.profile ?? null,
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
      weights: Array.isArray(parsed.weights) ? parsed.weights : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      onboarded: !!parsed.onboarded,
    };
  } catch {
    return EMPTY;
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return;
  } catch (e) {
    // 照片已经存进 IndexedDB，localStorage 只剩文字，正常不会超。
    // 真超了（比如老数据还带着 base64），先把老图丢掉保住文字记录。
    try {
      const light: AppState = {
        ...state,
        meals: state.meals.map((m) =>
          m.image ? { ...m, image: undefined } : m,
        ),
      };
      window.localStorage.setItem(KEY, JSON.stringify(light));
      console.warn("本地存储紧张，已清理较早的照片，文字记录都还在");
      return;
    } catch {
      console.warn("保存失败，可能是存储空间不足", e);
    }
  }
}

export function resetState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/**
 * 老记录把 320px 小图直接塞在 localStorage 里，最占地方也最糊。
 * 这里把它们搬进 IndexedDB，搬完清空 image 字段，给 localStorage 腾空间。
 * 失败（浏览器禁用 IndexedDB）就原样保留，不丢数据。
 */
export async function migratePhotos(s: AppState): Promise<AppState> {
  const targets = s.meals.filter((m) => m.image && !m.photoId);
  if (!targets.length) return s;

  const moved = new Set<string>();
  for (const m of targets) {
    const ok = await putPhoto(m.id, m.image as string);
    if (ok) moved.add(m.id);
  }
  if (!moved.size) return s;

  return {
    ...s,
    meals: s.meals.map((m) =>
      moved.has(m.id) ? { ...m, photoId: m.id, image: undefined } : m,
    ),
  };
}

/* ---------- 纯函数式操作，返回新对象 ---------- */

export function withMeal(s: AppState, meal: Meal): AppState {
  return { ...s, meals: [meal, ...s.meals].slice(0, 1000) };
}

/**
 * 同一顿补拍第二次时，酒和标签也要并进去。
 *
 * 以前只合并了 items 和营养，drinks 直接被旧的顶掉 ——
 * 先拍了菜、又补拍一张带酒的，那杯酒就这么没了，而它是这顿最大的热量。
 */
function mergeDrinks(a?: Drink[], b?: Drink[]): Drink[] | undefined {
  const bag = new Map<DrinkKind, number>();
  for (const d of [...(a ?? []), ...(b ?? [])]) {
    if (d.count > 0) bag.set(d.kind, (bag.get(d.kind) ?? 0) + d.count);
  }
  if (!bag.size) return undefined;
  return [...bag.entries()].map(([kind, count]) => ({ kind, count }));
}

function mergeTags(a?: MealTag[], b?: MealTag[]): MealTag[] | undefined {
  const set = [...new Set([...(a ?? []), ...(b ?? [])])];
  return set.length ? set : undefined;
}

/**
 * 同一天同一餐次只允许一条记录。
 * 已有则该餐次合并（追加菜品、营养累加），没有则新增。
 * 这样"晚饭吃过又拍一张"不会变成两条晚餐。
 */
export function upsertMeal(s: AppState, meal: Meal): AppState {
  const idx = s.meals.findIndex(
    (m) => m.date === meal.date && m.mealType === meal.mealType,
  );
  if (idx === -1) return withMeal(s, meal);

  const old = s.meals[idx];
  const merged: Meal = {
    ...old,
    items: [...old.items, ...meal.items],
    nutrition: {
      kcal: old.nutrition.kcal + meal.nutrition.kcal,
      protein: old.nutrition.protein + meal.nutrition.protein,
      carb: old.nutrition.carb + meal.nutrition.carb,
      fat: old.nutrition.fat + meal.nutrition.fat,
      sodium: old.nutrition.sodium + meal.nutrition.sodium,
    },
    comment: meal.comment,
    // 两顿拍的照片都留着。以前只存一张，后拍的会把先拍的顶掉，
    // 结果"盖饭 + 馄饨汤"这条只剩馄饨汤的图。
    photoIds: [...photoIdsOf(meal), ...photoIdsOf(old)].slice(0, 8),
    photoId: undefined,
    image: old.image ?? meal.image,
    // 同一顿补拍第二次，吃饭时间还是第一次那个。
    // 老记录没有 eatenAt，就借这次补拍补上。
    eatenAt: old.eatenAt ?? meal.eatenAt,
    drinks: mergeDrinks(old.drinks, meal.drinks),
    tags: mergeTags(old.tags, meal.tags),
    updatedAt: new Date().toISOString(),
  };
  const next = [...s.meals];
  next[idx] = merged;
  return { ...s, meals: next };
}

/** 整条替换（编辑已有记录时用） */
export function updateMeal(s: AppState, meal: Meal): AppState {
  return {
    ...s,
    meals: s.meals.map((m) => (m.id === meal.id ? meal : m)),
  };
}

export function withoutMeal(s: AppState, id: string): AppState {
  return { ...s, meals: s.meals.filter((m) => m.id !== id) };
}

export function withWeight(s: AppState, log: WeightLog): AppState {
  const rest = s.weights.filter((w) => w.date !== log.date);
  return {
    ...s,
    weights: [log, ...rest].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

/**
 * 取最近一次的体重。
 * 不能直接用 weights[0]——那只在"写入时排好序"的前提下成立，
 * 导入备份、旧版本数据、手动改过的数据都可能是升序，会读成最早的体重。
 */
export function latestWeightKg(weights: WeightLog[], fallback: number): number {
  if (!weights.length) return fallback;
  let best = weights[0];
  for (const w of weights) {
    if (w.date > best.date) best = w;
  }
  return best.weightKg;
}

export function withActivity(
  s: AppState,
  date: string,
  level: ActivityLevel,
): AppState {
  const rest = s.activities.filter((a) => a.date !== date);
  return { ...s, activities: [{ date, level }, ...rest] };
}

export function mealsOfDate(s: AppState, date: string) {
  return s.meals.filter((m) => m.date === date);
}

export function activityOfDate(s: AppState, date: string): ActivityLevel {
  return s.activities.find((a) => a.date === date)?.level ?? "normal";
}

export function latestWeight(s: AppState): number | null {
  if (!s.weights.length) return null;
  const sorted = [...s.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  return sorted[0].weightKg;
}

export function dateList(days: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
    );
  }
  return out;
}
