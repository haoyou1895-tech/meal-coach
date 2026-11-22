"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { Sheet } from "./ui";
import {
  EXERCISES,
  adviceOf,
  adviseTomorrow,
  burnOfLog,
  exerciseDef,
  nameOf,
  suggestMinutes,
} from "@/lib/exercise";
import ExerciseSay from "./ExerciseSay";
import type { ParsedExercise } from "@/lib/exerciseParse";
import { drinksLabel } from "@/lib/drinks";
import { SALT_LABEL, daySalt, saltGram, saltLevelOf } from "@/lib/mealTags";
import { mealTypeLabel, round, sumMeals } from "@/lib/nutrition";
import type {
  ExerciseKind,
  ExerciseLog,
  ExercisePlan,
  Meal,
  NutritionPlan,
  PlannedExercise,
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
  onAddExercises,
  onRemoveExercise,
  onMinutes,
  onCloseDay,
  onReopenDay,
  onPlanItems,
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
  /** 记运动：一句话可能拆出好几条，所以进的是数组 */
  onAddExercises: (items: { kind: ExerciseKind; label?: string; minutes: number }[]) => void;
  onRemoveExercise: (id: string) => void;
  onMinutes: (id: string, minutes: number) => void;
  onCloseDay: () => void;
  onReopenDay: () => void;
  /** 整组覆盖明天的计划，传空数组就是取消 */
  onPlanItems: (items: PlannedExercise[]) => void;
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

  const today = {
    kcal: totals.kcal,
    budget: plan.dailyBudgetKcal,
    protein: totals.protein,
    proteinTarget: plan.proteinTargetG,
  };

  const advices = useMemo(
    () => adviseTomorrow(profile, weightKg, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, weightKg, totals, plan],
  );

  /** 明天建议做多久。用户自己说了时长就不用它 */
  const suggest = useMemo(() => suggestMinutes(today), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    totals,
    plan,
  ]);

  const planned = planTomorrow?.items ?? [];

  /** 计划项的身份证：同一种运动算同一项，"其他"按名字区分 */
  const keyOf = (x: { kind: ExerciseKind; label?: string }) =>
    x.kind === "other" ? `other:${x.label ?? ""}` : x.kind;

  function togglePlan(item: PlannedExercise) {
    const k = keyOf(item);
    const has = planned.some((p) => keyOf(p) === k);
    onPlanItems(
      has ? planned.filter((p) => keyOf(p) !== k) : [...planned, item],
    );
  }

  /**
   * 输入框进来的这几项。
   *
   * 他没说时长的，用建议时长；说了的就听他的 —— 但 5 分钟和 4 小时之间
   * 得有人拦一下，那不是自律问题，是打字打错了。
   */
  function planFromInput(items: ParsedExercise[]) {
    const add: PlannedExercise[] = items.map((p) => ({
      kind: p.kind,
      minutes: p.explicit ? p.minutes : suggest.minutes,
      ...(p.kind === "other" && p.label ? { label: p.label } : {}),
    }));
    const merged = [...planned];
    for (const a of add) {
      const i = merged.findIndex((p) => keyOf(p) === keyOf(a));
      if (i >= 0) merged[i] = a;
      else merged.push(a);
    }
    onPlanItems(merged);
  }

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

          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
            {exercises.length === 0
              ? "还没记。下楼走一圈、拖个地都算，动了就记上 —— 这决定明天能宽松多少。"
              : "记漏了就说一句补上，一种几种一起说都行。"}
          </p>

          <ExerciseSay
            actionLabel="记上"
            ariaLabel="用语音说今天做了什么运动"
            placeholder="快走 40 分钟、游泳半小时"
            footnote="「和」隔开能一次记几种；对不上的名字按中等强度算。"
            onSubmit={(items) =>
              onAddExercises(
                items.map((p) => ({
                  kind: p.kind,
                  minutes: p.minutes,
                  ...(p.kind === "other" && p.label ? { label: p.label } : {}),
                })),
              )
            }
          />

          {exercises.length > 0 && (
            <div className="mt-3 space-y-2">
              {exercises.map((e) => {
                const def = exerciseDef(e.kind);
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2"
                  >
                    <Icon name={def.icon} size={16} style={{ color: "#176f49" }} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {nameOf(e)}
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
                      aria-label={`删掉${nameOf(e)}`}
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
                onClick={() =>
                  onAddExercises([{ kind: def.kind, minutes: def.defaultMin }])
                }
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
            {planned.length > 0
              ? "明天这几项，打开就在首页上。"
              : "挑一个也行，说一句也行 —— 你愿意做的，才排得进明天。"}
          </p>

          {/*
            时长是怎么来的，只说一次。
            三个项目每张卡片都写一遍"为什么 30 分钟"，就成了噪音，
            而他只会记住"这软件很啰嗦"。
          */}
          <p className="mt-1 text-[12px] leading-relaxed text-ink-300">
            建议 {suggest.minutes} 分钟 —— {suggest.why}
          </p>

          <ExerciseSay
            actionLabel="定上"
            ariaLabel="用语音说明天想做什么运动"
            placeholder="想做什么？快走和游泳各半小时"
            footnote="一次能说几种，用「和」隔开；没说时长的，按上面的建议量给。"
            onSubmit={planFromInput}
          />

          {/* 他自己定的，连建议一起摆出来 —— 是他点的，就得告诉他这个量合不合适 */}
          {planned.length > 0 && (
            <div className="mt-3 space-y-2">
              {planned.map((item) => {
                const a = adviceOf(item.kind, item.minutes, weightKg, profile);
                return (
                  <div
                    key={keyOf(item)}
                    className="flex items-start gap-3 rounded-xl border border-brand-500 bg-brand-50 px-3 py-2.5"
                  >
                    <Icon
                      name={a.def.icon}
                      size={20}
                      style={{ color: "#176f49" }}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium leading-snug">
                        {nameOf(item)}{" "}
                        <span className="text-ink-500">{a.minutes} 分钟</span>
                        <span className="ml-1 text-[13px] font-normal text-ink-300 tabular-nums">
                          约 {a.kcal} 卡
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-300">
                        {a.why}
                      </p>
                    </div>
                    <button
                      aria-label={`明天不做${nameOf(item)}了`}
                      onClick={() => togglePlan(item)}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70"
                    >
                      <Icon name="close" size={11} style={{ color: "#8b948f" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 建议只摆没定的那几项，免得同一项出现两遍 */}
          {advices.some((a) => !planned.some((p) => keyOf(p) === a.def.kind)) && (
            <div className="mt-2.5 space-y-2">
              {advices
                .filter((a) => !planned.some((p) => keyOf(p) === a.def.kind))
                .map((a) => (
                  <button
                    key={a.def.kind}
                    onClick={() =>
                      togglePlan({ kind: a.def.kind, minutes: a.minutes })
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-black/[0.03] px-3 py-2.5 text-left transition active:scale-[0.99]"
                  >
                    <Icon
                      name={a.def.icon}
                      size={20}
                      style={{ color: "#8b948f" }}
                      className="shrink-0"
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
                    <span className="shrink-0 text-[18px] font-light text-brand-600">
                      +
                    </span>
                  </button>
                ))}
            </div>
          )}

          {planned.length > 1 && (
            <button
              onClick={() => onPlanItems([])}
              className="mt-2 text-[12px] font-medium text-ink-300"
            >
              全清掉，重新挑
            </button>
          )}

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
