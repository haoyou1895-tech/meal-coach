"use client";

import type {
  ActivityLevel,
  ActivityLog,
  Meal,
  Profile,
  WeightLog,
} from "./types";

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
  } catch (e) {
    console.warn("保存失败，可能是存储空间不足", e);
  }
}

export function resetState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/* ---------- 纯函数式操作，返回新对象 ---------- */

export function withMeal(s: AppState, meal: Meal): AppState {
  return { ...s, meals: [meal, ...s.meals].slice(0, 1000) };
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
