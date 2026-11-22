"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { Sheet } from "./ui";
import {
  EXERCISES,
  adviseTomorrow,
  burnKcal,
  burnOfLog,
  exerciseDef,
} from "@/lib/exercise";
import { drinksLabel } from "@/lib/drinks";
import { SALT_LABEL, daySalt, saltGram, saltLevelOf } from "@/lib/mealTags";
import { mealTypeLabel, round, sumMeals } from "@/lib/nutrition";
import type {
  ExerciseKind,
  ExerciseLog,
  ExercisePlan,
  Meal,
  NutritionPlan,
  Profile,
} from "@/lib/types";

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * 今天收工面板。
 *
 * 一天结束的时候，人真正想知道的不是"我超标了"，是三件事：
 * 我今天到底吃了多少、我动的那些算不算数、明天该怎么办。
 * 所以这个面板按这三件事分三段，不做成一张仪表盘。
 *
 * 有两件事刻意没做：
 *
 * 1. 不显示"净摄入 = 吃了 - 动了"。
 *    这个数字一出现，他就学会用运动赎罪 —— 今晚多走半小时，换一碗面。
 *    运动不该是饭的货币。所以两个数分开摆，中间用一句话说清关系。
 *
 * 2. 不用红色大字批评超支。
 *    超支是事实，不是道德问题。他要的是明天怎么办，不是被数落。
 */
export default function DaySummary({
  open,
  onClose,
  profile,
  plan,
  meals,
  exercises,
  weightKg,
  tomorrowBudget,
  planTomorrow,
  closed,
  closedAtLabel,
  onExercise,
  onRemoveExercise,
  onMinutes,
  onCloseDay,
  onReopenDay,
  onPlan,
  onUnplan,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  plan: NutritionPlan;
  /** 今天的记录 */
  meals: Meal[];
  /** 今天已经记下的运动 */
  exercises: ExerciseLog[];
  weightKg: number;
  /** 明天的预算：用截至今天的 7 天运动均值算 */
  tomorrowBudget: number;
  /** 已经定给明天的计划 */
  planTomorrow: ExercisePlan | null;
  closed: boolean;
  closedAtLabel: string | null;
  onExercise: (kind: ExerciseKind, minutes: number) => void;
  onRemoveExercise: (id: string) => void;
  onMinutes: (id: string, minutes: number) => void;
  onCloseDay: () => void;
  onReopenDay: () => void;
  onPlan: (kind: ExerciseKind, minutes: number) => void;
  onUnplan: () => void;
}) {
  /** 展开全部运动项，还是只给常用的几个 */
  const [more, setMore] = useState(false);

  const totals = useMemo(() => sumMeals(meals), [meals]);
  const salt = useMemo(() => daySalt(meals), [meals]);
  const burn = useMemo(
    () => exercises.reduce((s, e) => s + burnOfLog(e, weightKg), 0),
    [exercises, weightKg],
  );

  const over = Math.round(totals.kcal - plan.dailyBudgetKcal);
  const saltG = saltGram(salt.mg);
  const left = Math.round(plan.dailyBudgetKcal - totals.kcal);

  const perMeal = useMemo(() => {
    return MEAL_ORDER.map((t) => {
      const list = meals.filter((m) => m.mealType === t);
      if (!list.length) return null;
      return {
        type: t,
        kcal: Math.round(list.reduce((s, m) => s + m.nutrition.kcal, 0)),
      };
    }).filter(Boolean) as { type: (typeof MEAL_ORDER)[number]; kcal: number }[];
  }, [meals]);

  const advices = useMemo(
    () =>
      adviseTomorrow(profile, weightKg, {
        kcal: totals.kcal,
        budget: plan.dailyBudgetKcal,
        protein: totals.protein,
        proteinTarget: plan.proteinTargetG,
      }),
    [profile, weightKg, totals, plan],
  );

  const drinkText = drinksLabel(
    meals.flatMap((m) => m.drinks ?? []),
  );

  // 常用五项先给，剩下的收起来 —— 一屏塞十一项，他一项都不会点
  const quick = EXERCISES.slice(0, 5);
  const rest = EXERCISES.slice(5);

  return (
    <Sheet open={open} onClose={onClose} title={closed ? "今天已收工" : "今天的账"}>
      <div className="space-y-3 pb-4">
        {/* ---------- 一、今天吃了多少 ---------- */}
        <section className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-ink-500">
              {closed ? `收工于 ${closedAtLabel ?? ""}` : "今天吃了"}
            </span>
            <span
              className={`text-[14px] font-medium ${
                over > 0 ? "text-[#b23c2c]" : "text-brand-600"
              }`}
            >
              {over > 0
                ? `超了 ${over}`
                : left > 0
                  ? `还剩 ${left}`
                  : "刚刚好"}
            </span>
          </div>

          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[40px] font-bold leading-none tabular-nums tracking-tight">
              {Math.round(totals.kcal)}
            </span>
            <span className="text-[15px] text-ink-300">
              / {plan.dailyBudgetKcal} 大卡
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, plan.dailyBudgetKcal > 0 ? (totals.kcal / plan.dailyBudgetKcal) * 100 : 0)}%`,
                background: over > 0 ? "#d94f3d" : "#1f8a5b",
              }}
            />
          </div>

          {perMeal.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              {perMeal.map((m) => (
                <span key={m.type} className="text-[13px] text-ink-500">
                  {mealTypeLabel(m.type)}{" "}
                  <b className="tabular-nums text-ink-700">{m.kcal}</b>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-black/[0.04] pt-3">
            <span className="text-[13px] text-ink-500">
              蛋白{" "}
              <b
                className={`tabular-nums ${
                  totals.protein < plan.proteinTargetG * 0.8
                    ? "text-[#b23c2c]"
                    : "text-ink-700"
                }`}
              >
                {Math.round(totals.protein)}
              </b>
              /{plan.proteinTargetG}g
            </span>
            <span className="text-[13px] text-ink-500">
              盐{" "}
              <b className="tabular-nums text-ink-700">{saltG}</b>/
              {saltGram(plan.sodiumLimitMg)}g
              <span className="ml-1 text-ink-300">
                {SALT_LABEL[saltLevelOf(salt.mg, salt.taggedCount)]}
              </span>
            </span>
            {drinkText && (
              <span className="text-[13px] text-ink-500">{drinkText}</span>
            )}
          </div>

          {totals.kcal === 0 && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
              今天一条都没记。没记不等于没吃 —— 记不记都行，但记了对你自己有用。
            </p>
          )}
        </section>

        {/* ---------- 二、今天动了多少 ---------- */}
        <section className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">今天动了多少</span>
            {burn > 0 && (
              <span className="text-[13px] font-medium text-brand-600 tabular-nums">
                消耗 {burn} 大卡
              </span>
            )}
          </div>

          {exercises.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
              还没记。下楼走一圈、拖个地都算，动了就记上 —— 这决定明天能宽松多少。
            </p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {exercises.map((e) => {
                const def = exerciseDef(e.kind);
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2"
                  >
                    <Icon name={def.icon} size={16} style={{ color: "#176f49" }} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {def.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        aria-label="减五分钟"
                        onClick={() => onMinutes(e.id, e.minutes - 5)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[15px] font-bold text-ink-700 active:scale-95"
                      >
                        −
                      </button>
                      <span className="w-10 shrink-0 text-center text-[13px] font-semibold tabular-nums">
                        {e.minutes} 分
                      </span>
                      <button
                        aria-label="加五分钟"
                        onClick={() => onMinutes(e.id, e.minutes + 5)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[15px] font-bold text-ink-700 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-12 shrink-0 text-right text-[12px] text-ink-300 tabular-nums">
                      {burnOfLog(e, weightKg)} 卡
                    </span>
                    <button
                      aria-label={`删掉${def.label}`}
                      onClick={() => onRemoveExercise(e.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.04]"
                    >
                      <Icon name="close" size={11} style={{ color: "#8b948f" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(more ? EXERCISES : quick).map((def) => (
              <button
                key={def.kind}
                onClick={() => onExercise(def.kind, def.defaultMin)}
                className="h-9 rounded-lg bg-black/[0.04] px-3 text-[13px] font-medium text-ink-700 active:scale-95 active:bg-black/[0.08]"
              >
                {def.label}
                <span className="ml-1 text-[11px] font-normal text-ink-300">
                  {def.defaultMin}分
                </span>
              </button>
            ))}
            {!more && rest.length > 0 && (
              <button
                onClick={() => setMore(true)}
                className="h-9 rounded-lg px-2 text-[13px] font-medium text-brand-600"
              >
                更多
              </button>
            )}
          </div>

          {burn > 0 && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-300">
              按体重 {round(weightKg, 1)} 公斤算，已经扣掉了这段时间本来就该消耗的那部分。
            </p>
          )}
        </section>

        {/* ---------- 三、明天怎么办 ---------- */}
        <section className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">明天</span>
            <span className="text-[13px] text-ink-300 tabular-nums">
              预算 {tomorrowBudget} 大卡
            </span>
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
            挑一个，明天打开就在首页上。
          </p>

          <div className="mt-2.5 space-y-2">
            {advices.map((a) => {
              const on = planTomorrow?.kind === a.def.kind;
              return (
                <button
                  key={a.def.kind}
                  onClick={() =>
                    on ? onUnplan() : onPlan(a.def.kind, a.minutes)
                  }
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                    on
                      ? "border-brand-500 bg-brand-50"
                      : "border-transparent bg-black/[0.03]"
                  }`}
                >
                  <Icon
                    name={a.def.icon}
                    size={20}
                    style={{ color: on ? "#176f49" : "#8b948f" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium leading-snug">
                      {a.def.label}{" "}
                      <span className="text-ink-500">{a.minutes} 分钟</span>
                      <span className="ml-1 text-[13px] font-normal text-ink-300 tabular-nums">
                        约 {a.kcal} 卡
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-300">
                      {a.why}
                    </p>
                  </div>
                  {on && (
                    <span className="shrink-0 rounded-md bg-brand-500 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      已定
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-300">
            明天的预算按你最近一周实际动的情况算：这周动得多，明天就宽松一点。
            只看今天这一次，明天不练了额度又掉回去，那才叫乱。
          </p>
        </section>

        {/*
          这段是整个功能里最重要的一句话。
          没有它，用户会把"运动 380 大卡"读成"我可以再吃 380 大卡"，
          而这正是所有记卡路里软件最后失败的地方。
        */}
        <p className="px-1 text-[12px] leading-relaxed text-ink-300">
          运动不抵扣今天的饭量。今天动掉的这些，已经算进明天的预算里了 ——
          它让明天宽松一点，不是给今晚加一顿。
        </p>

        {/* ---------- 四、收工 ---------- */}
        {closed ? (
          <>
            <button
              className="btn-primary"
              onClick={() => {
                // 撤销之后得把面板收起来：留在原地，他会以为没生效
                onReopenDay();
                onClose();
              }}
            >
              改一下，继续记
            </button>
            <button className="btn-ghost" onClick={onClose}>
              关掉
            </button>
          </>
        ) : (
          <>
            <button
              className="btn-primary"
              onClick={() => {
                onCloseDay();
                onClose();
              }}
            >
              今天就吃到这
            </button>
            <button className="btn-ghost" onClick={onClose}>
              还没完，等会儿再记
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** 首页底部那一行入口，收工和没收工长得不一样 */
export function DaySummaryBar({
  closed,
  kcal,
  budget,
  planLabel,
  todayPlanLabel,
  onClick,
}: {
  closed: boolean;
  kcal: number;
  budget: number;
  /** 给明天定下的计划，收工后才显示 */
  planLabel: string | null;
  /**
   * 今天该做的运动（昨天定下的）。
   * 未收工时优先显示它，而不是"还剩多少卡" ——
   * 剩多少在环里已经写了，而这个承诺只在这里出现一次，过了今天就没意义了。
   */
  todayPlanLabel: string | null;
  onClick: () => void;
}) {
  const over = kcal > budget;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left transition active:scale-[0.99] ${
        closed ? "bg-brand-50" : "bg-white shadow-sm"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-tight">
          {closed ? "今天已收工" : "今天吃完了？算一笔"}
        </p>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-300">
          {closed
            ? planLabel
              ? `明天：${planLabel}`
              : "明天再说，今晚不用再想"
            : todayPlanLabel
              ? `昨天定的：${todayPlanLabel}，做完进来记上`
              : over
                ? `已经 ${kcal} 大卡，看看明天怎么调`
                : `还剩 ${Math.max(0, budget - kcal)} 大卡，看看还能吃点什么`}
        </p>
      </div>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-ink-300">
        <path
          d="M7 4l5 5-5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
