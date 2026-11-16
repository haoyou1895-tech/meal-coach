"use client";

import { useMemo, useState } from "react";
import type { Meal, NutritionPlan, Profile, WeightLog } from "@/lib/types";
import { mealTypeLabel, round, sumMeals, todayStr } from "@/lib/nutrition";
import { dateList } from "@/lib/store";
import { Sheet, Stepper } from "./ui";

export default function RecordView({
  profile,
  plan,
  meals,
  weights,
  onWeight,
  onDeleteMeal,
}: {
  profile: Profile;
  plan: NutritionPlan;
  meals: Meal[];
  weights: WeightLog[];
  onWeight: (kg: number) => void;
  onDeleteMeal: (id: string) => void;
}) {
  const [weightOpen, setWeightOpen] = useState(false);
  const latest = weights[0]?.weightKg ?? profile.weightKg;
  const [draft, setDraft] = useState(latest);

  const last7 = useMemo(() => dateList(7).reverse(), []);
  const dailyKcal = useMemo(
    () =>
      last7.map((d) => ({
        date: d,
        kcal: sumMeals(meals.filter((m) => m.date === d)).kcal,
      })),
    [last7, meals],
  );
  const maxKcal = Math.max(plan.dailyBudgetKcal * 1.2, ...dailyKcal.map((d) => d.kcal));

  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>();
    const days = dateList(14);
    for (const d of days) {
      const list = meals
        .filter((m) => m.date === d)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      if (list.length) map.set(d, list);
    }
    return Array.from(map.entries());
  }, [meals]);

  const lost = round(profile.weightKg - latest, 1);

  return (
    <div className="pb-52">
      <header className="safe-top px-5 pb-3 pt-5">
        <h1 className="text-[27px] font-bold tracking-tight">我的记录</h1>
      </header>

      {/* 体重 */}
      <section className="px-5">
        <div className="card">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[15px] font-medium text-ink-500">当前体重</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[46px] font-bold leading-none tabular-nums">
                  {latest}
                </span>
                <span className="text-[16px] font-medium text-ink-500">公斤</span>
              </p>
            </div>
            <button
              onClick={() => {
                setDraft(latest);
                setWeightOpen(true);
              }}
              className="h-12 rounded-xl bg-brand-50 px-5 text-[16px] font-semibold text-brand-600 active:scale-95"
            >
              记体重
            </button>
          </div>

          <div className="mt-4 flex gap-3 border-t border-black/[0.05] pt-4">
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">目标</p>
              <p className="text-[18px] font-semibold tabular-nums">
                {profile.targetWeightKg} kg
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">已减</p>
              <p className="text-[18px] font-semibold tabular-nums text-brand-500">
                {lost > 0 ? `${lost} kg` : "0 kg"}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">还剩</p>
              <p className="text-[18px] font-semibold tabular-nums">
                {Math.max(0, round(latest - profile.targetWeightKg, 1))} kg
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 近 7 天热量 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">近 7 天</h2>
        <div className="card">
          <div className="relative flex h-40 items-end gap-1.5">
            {/* 预算参考线 */}
            <div
              className="pointer-events-none absolute inset-x-0 z-10"
              style={{
                bottom: Math.round((plan.dailyBudgetKcal / maxKcal) * 104),
              }}
            >
              <div className="border-t border-dashed border-warn-500/60" />
              <span className="absolute -top-4 right-0 text-[10px] font-medium text-warn-600/80">
                预算 {plan.dailyBudgetKcal}
              </span>
            </div>
            {dailyKcal.map((d) => {
              const barH =
                d.kcal === 0
                  ? 4
                  : Math.max(8, Math.round((d.kcal / maxKcal) * 104));
              const over = d.kcal > plan.dailyBudgetKcal;
              return (
                <div
                  key={d.date}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span className="text-[11px] leading-none tabular-nums text-ink-300">
                    {d.kcal > 0 ? d.kcal : ""}
                  </span>
                  <div
                    className="w-full rounded-md transition-all duration-500"
                    style={{
                      height: barH,
                      background:
                        d.kcal === 0 ? "#e7eae8" : over ? "#d94f3d" : "#1f8a5b",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2">
            {dailyKcal.map((d) => (
              <span
                key={d.date}
                className="flex-1 text-center text-[11px] text-ink-300"
              >
                {d.date.slice(8)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
            灰的是没记的日子。预算 {plan.dailyBudgetKcal} 大卡，超过会变红。
          </p>
        </div>
      </section>

      {/* 历史 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">吃过的</h2>
        {grouped.length === 0 ? (
          <div className="card flex flex-col items-center py-9">
            <p className="text-[16px] text-ink-500">还没有记录</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, list]) => {
              const total = sumMeals(list).kcal;
              return (
                <div key={date}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-[15px] font-semibold text-ink-700">
                      {date === todayStr() ? "今天" : date.slice(5).replace("-", "月") + "日"}
                    </span>
                    <span className="text-[13px] text-ink-300 tabular-nums">
                      {total} 大卡
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-[12px] font-medium text-brand-600">
                            {mealTypeLabel(m.mealType)}
                          </p>
                          <p className="truncate text-[16px] font-medium">
                            {m.items.map((i) => i.name).join("、")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-[16px] font-semibold tabular-nums">
                            {m.nutrition.kcal}
                          </span>
                          <button
                            onClick={() => {
                              if (confirm("删掉这条记录？")) onDeleteMeal(m.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-ink-300"
                            aria-label="删除"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M3 3l8 8M11 3l-8 8"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-8 px-8 text-center text-[12px] leading-relaxed text-ink-300">
        本产品提供饮食参考，不构成医疗建议。
        <br />
        如有疾病请遵医嘱。
      </p>

      <Sheet
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        title="记体重"
      >
        <p className="mb-6 text-center text-[15px] leading-relaxed text-ink-500">
          早上空腹称最准，一天记一次就够
        </p>
        <Stepper
          value={draft}
          onChange={setDraft}
          min={40}
          max={150}
          step={0.1}
          unit="公斤"
          big
        />
        <div className="mt-8">
          <button
            className="btn-primary"
            onClick={() => {
              onWeight(Math.round(draft * 10) / 10);
              setWeightOpen(false);
            }}
          >
            记下了
          </button>
        </div>
      </Sheet>
    </div>
  );
}
