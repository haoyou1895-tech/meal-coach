"use client";

import { useMemo, useState } from "react";
import type {
  FoodItem,
  Meal,
  MealType,
  NutritionPlan,
  Profile,
  WeightLog,
} from "@/lib/types";
import { mealTypeLabel, round, sumMeals, todayStr } from "@/lib/nutrition";
import { dateList, latestWeightKg } from "@/lib/store";
import { drinkKcal } from "@/lib/drinks";
import { ruleComment } from "@/lib/comment";
import MealPhoto from "./MealPhoto";
import WeightTrend from "./WeightTrend";
import { Sheet, Stepper } from "./ui";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * 一周柱状图的配色：越晚吃颜色越深（顺序即强度），酒单独一档。
 * 不用四种彩色，是不想让"颜色"变成需要背的图例。
 */
const MEAL_SHADE: Record<string, string> = {
  breakfast: "#b6d4c2",
  lunch: "#6ea98a",
  dinner: "#1f8a5b",
  snack: "#c9cfcb",
  drink: "#c4694a",
};

/** 这顿是几点吃的。旧记录没有 eatenAt，退回记录时刻 */
function mealTime(m: Meal): string {
  const raw = m.eatenAt ?? m.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 正在看的大图。带下标是因为一条记录可能有好几张照片 */
interface Gallery {
  srcs: string[];
  index: number;
}

export default function RecordView({
  profile,
  plan,
  meals,
  weights,
  onWeight,
  onDeleteMeal,
  onUpdateMeal,
}: {
  profile: Profile;
  plan: NutritionPlan;
  meals: Meal[];
  weights: WeightLog[];
  onWeight: (kg: number) => void;
  onDeleteMeal: (id: string) => void;
  onUpdateMeal: (m: Meal) => void;
}) {
  const [weightOpen, setWeightOpen] = useState(false);
  const latest = latestWeightKg(weights, profile.weightKg);
  const [draft, setDraft] = useState(latest);

  // 编辑某一条记录
  const [editing, setEditing] = useState<Meal | null>(null);
  const [editType, setEditType] = useState<MealType>("lunch");
  const [editItems, setEditItems] = useState<FoodItem[]>([]);
  const [factors, setFactors] = useState<number[]>([]);
  const [gallery, setGallery] = useState<Gallery | null>(null);

  const openEditor = (m: Meal) => {
    setEditing(m);
    setEditType(m.mealType);
    setEditItems(m.items.map((it) => ({ ...it })));
    setFactors(m.items.map(() => 1));
  };

  const edited = useMemo(() => {
    if (!editing) return null;
    const scaledKcal = editItems.reduce(
      (s, it, i) => s + it.kcal * (factors[i] ?? 1),
      0,
    );
    // 删掉一道菜之后热量变少，三大营养素按同样比例缩，够用
    const base = editing.nutrition.kcal > 0 ? editing.nutrition.kcal : 1;
    const ratio = scaledKcal / base;
    const scale = (n: number) => Math.round(n * ratio);
    return {
      kcal: Math.round(scaledKcal),
      protein: scale(editing.nutrition.protein),
      carb: scale(editing.nutrition.carb),
      fat: scale(editing.nutrition.fat),
      sodium: scale(editing.nutrition.sodium),
    };
  }, [editing, editItems, factors]);

  /**
   * 能选哪几顿。
   *
   * 加餐不是正餐：一盘米饭炒菜改成"加餐"是在改事实，不是在改错字。
   * 所以正餐只能跟正餐互换；加餐本身倒是可以改成某一顿正餐。
   */
  const typeOptions = useMemo(() => {
    if (!editing) return [];
    return MEAL_TYPES.filter((t) => {
      if (t === "snack" && editing.mealType !== "snack") return false;
      if (t === editing.mealType) return true;
      return !meals.some(
        (m) => m.date === editing.date && m.mealType === t && m.id !== editing.id,
      );
    });
  }, [editing, meals]);

  const removeItem = (i: number) => {
    // 最后一道不给删，这种情况应该删整条记录
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, idx) => idx !== i));
    setFactors((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveEdit = () => {
    if (!editing || !edited || !editItems.length) return;
    const dayTotal = sumMeals(meals.filter((m) => m.date === editing.date)).kcal;
    const before = dayTotal - editing.nutrition.kcal;
    onUpdateMeal({
      ...editing,
      mealType: editType,
      items: editItems.map((it, i) => ({
        ...it,
        kcal: Math.round(it.kcal * (factors[i] ?? 1)),
      })),
      nutrition: edited,
      comment: ruleComment(
        edited,
        profile,
        plan,
        before,
        editType,
        editing.eatenAt ?? editing.createdAt,
      ),
      updatedAt: new Date().toISOString(),
    });
    setEditing(null);
  };

  const last7 = useMemo(() => dateList(7).reverse(), []);
  /**
   * 一天一根柱子看不出"哪顿吃爆了"，也看不出酒占了多少。
   * 改成按餐次叠起来，一眼能看到是晚饭高还是那顿酒高。
   */
  const dailyKcal = useMemo(
    () =>
      last7.map((d) => {
        const list = meals.filter((m) => m.date === d);
        const parts = (
          ["breakfast", "lunch", "dinner", "snack"] as MealType[]
        )
          .map((t) => ({
            key: t as string,
            kcal: sumMeals(list.filter((m) => m.mealType === t)).kcal,
          }))
          .filter((p) => p.kcal > 0);
        const dk = list.reduce((s, m) => s + drinkKcal(m.drinks), 0);
        if (dk > 0) parts.push({ key: "drink", kcal: dk });
        return { date: d, kcal: sumMeals(list).kcal, parts };
      }),
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
              <p
                className={`text-[18px] font-semibold tabular-nums ${
                  lost > 0
                    ? "text-brand-500"
                    : lost < 0
                      ? "text-warn-600"
                      : "text-ink-700"
                }`}
              >
                {lost > 0
                  ? `${lost} kg`
                  : lost < 0
                    ? `+${Math.abs(lost)} kg`
                    : "0 kg"}
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

      <WeightTrend weights={weights} targetWeightKg={profile.targetWeightKg} />

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
              return (
                <div
                  key={d.date}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span className="text-[12px] leading-none tabular-nums text-ink-300">
                    {d.kcal > 0 ? d.kcal : ""}
                  </span>
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-md transition-all duration-500"
                    style={{
                      height: barH,
                      background: d.kcal === 0 ? "#e7eae8" : undefined,
                    }}
                  >
                    {d.parts.map((p) => (
                      <div
                        key={p.key}
                        style={{
                          height: `${(p.kcal / Math.max(1, d.kcal)) * 100}%`,
                          background: MEAL_SHADE[p.key] ?? "#8fae9c",
                        }}
                      />
                    ))}
                  </div>
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
          <div className="mt-2.5 flex items-center gap-2.5 border-t border-black/[0.05] pt-2.5 text-[12px] text-ink-300">
            {/* 预算那根虚线图上已经标了「预算 1345」，这里再说一遍是重复 */}
            {[
              ["早", MEAL_SHADE.breakfast],
              ["午", MEAL_SHADE.lunch],
              ["晚", MEAL_SHADE.dinner],
              ["加", MEAL_SHADE.snack],
              ["酒", MEAL_SHADE.drink],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
          </div>
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
                        className="flex items-center gap-3 rounded-2xl bg-white p-3"
                      >
                        <MealPhoto
                          meal={m}
                          className="h-[88px] w-[88px] shrink-0 rounded-xl"
                          onOpen={(srcs, index) => setGallery({ srcs, index })}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-brand-600">
                            {mealTypeLabel(m.mealType)}
                            <span className="ml-1.5 font-normal tabular-nums text-ink-500">
                              {mealTime(m)}
                            </span>
                            {m.updatedAt && (
                              <span className="ml-1.5 font-normal text-ink-300">
                                已改过
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[16px] font-medium leading-snug">
                            {m.items.map((i) => i.name).join("、")}
                          </p>
                          <p className="mt-0.5 text-[13px] tabular-nums text-ink-500">
                            {m.nutrition.kcal} 大卡
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            onClick={() => openEditor(m)}
                            aria-label="修改这条记录"
                            className="flex h-8 w-10 items-center justify-center rounded-lg bg-brand-50 text-[13px] font-semibold text-brand-600 active:scale-95"
                          >
                            改
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("删掉这条记录？")) onDeleteMeal(m.id);
                            }}
                            aria-label="删除这条记录"
                            className="flex h-8 w-10 items-center justify-center rounded-lg bg-black/[0.04] text-[13px] font-semibold text-ink-500 active:scale-95"
                          >
                            删
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

      {/* 记体重 */}
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

      {/* 改记录 */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="改这条记录"
      >
        {editing && edited && (
          <div className="pb-2">
            <div className="flex items-center gap-3">
              <MealPhoto
                meal={editing}
                className="h-20 w-20 shrink-0 rounded-xl"
                onOpen={(srcs, index) => setGallery({ srcs, index })}
              />
              <div>
                <p className="text-[14px] text-ink-500">
                  {editing.date === todayStr() ? "今天" : editing.date}
                </p>
                <p className="text-[30px] font-bold leading-tight tabular-nums">
                  {edited.kcal}
                  <span className="ml-1 text-[15px] font-medium text-ink-500">
                    大卡
                  </span>
                </p>
              </div>
            </div>

            <p className="mb-2 mt-5 text-[14px] font-medium text-ink-700">
              是哪一顿
            </p>
            <div className="flex gap-2">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setEditType(t)}
                  className={`h-11 flex-1 rounded-xl text-[15px] font-medium transition ${
                    editType === t
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-700 shadow-sm"
                  }`}
                >
                  {mealTypeLabel(t)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              同一顿只能有条记录，已经记过的不在这儿
            </p>

            <div className="mb-2 mt-5 flex items-baseline justify-between">
              <p className="text-[14px] font-medium text-ink-700">吃了什么</p>
              <span className="text-[13px] text-ink-300">
                {editItems.length} 样
              </span>
            </div>
            <div className="space-y-2">
              {editItems.map((it, i) => (
                <div
                  key={`${it.name}-${i}`}
                  className="rounded-2xl bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-medium leading-snug">
                        {it.name}
                      </p>
                      <p className="text-[13px] text-ink-300">
                        {it.portion} · 约{" "}
                        {Math.round(it.kcal * (factors[i] ?? 1))} 大卡
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(i)}
                      disabled={editItems.length <= 1}
                      aria-label={`删掉${it.name}`}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-medium text-ink-500 active:bg-black/[0.05] disabled:opacity-25"
                    >
                      删掉
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-black/[0.04] pt-2.5">
                    <span className="text-[13px] text-ink-300">份量</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setFactors((prev) =>
                            prev.map((f, idx) =>
                              idx === i
                                ? Math.max(0.5, Math.round((f - 0.5) * 10) / 10)
                                : f,
                            ),
                          )
                        }
                        aria-label="减半份"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.05] text-[17px] font-bold text-ink-700 active:scale-95"
                      >
                        −
                      </button>
                      <span className="w-11 text-center text-[14px] font-semibold tabular-nums">
                        {factors[i] ?? 1} 份
                      </span>
                      <button
                        onClick={() =>
                          setFactors((prev) =>
                            prev.map((f, idx) =>
                              idx === i
                                ? Math.min(3, Math.round((f + 0.5) * 10) / 10)
                                : f,
                            ),
                          )
                        }
                        aria-label="加半份"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.05] text-[17px] font-bold text-ink-700 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {editItems.length <= 1 && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
                只剩一样菜了。想整顿都不要，回上一页点「删」。
              </p>
            )}

            <div className="mt-6 space-y-2">
              <button className="btn-primary" onClick={saveEdit}>
                保存修改
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                不改了
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* 看大图，多张可以翻 */}
      {gallery && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90"
          onClick={() => setGallery(null)}
          role="button"
          tabIndex={0}
          aria-label="关闭大图"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              setGallery(null);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gallery.srcs[gallery.index]}
            alt="这顿饭的照片"
            className="max-h-[74vh] max-w-full object-contain"
          />

          {gallery.srcs.length > 1 && (
            <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
              {gallery.srcs.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setGallery({ ...gallery, index: i })}
                  aria-label={`看第 ${i + 1} 张`}
                  className={`h-14 w-14 overflow-hidden rounded-lg transition ${
                    i === gallery.index
                      ? "ring-2 ring-white"
                      : "opacity-45 active:opacity-80"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setGallery(null)}
            aria-label="关闭大图"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/22 text-white backdrop-blur active:scale-95"
            style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <p className="mb-6 mt-4 text-center text-[13px] text-white/55">
            {gallery.srcs.length > 1
              ? `${gallery.index + 1} / ${gallery.srcs.length} · 点下面换着看`
              : "点一下关掉"}
          </p>
        </div>
      )}
    </div>
  );
}
