"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import { Sheet } from "./ui";
import Stepper from "./Stepper";
import Explain from "./Explain";
import ExerciseSay from "./ExerciseSay";
import type { ParsedExercise } from "@/lib/exerciseParse";
import {
  EXERCISES,
  adviceOf,
  adviseTomorrow,
  burnOfLog,
  exerciseDef,
  kcalPerMin,
  nameOf,
  spreadDebt,
  suggestMinutes,
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
  PlannedExercise,
  Profile,
} from "@/lib/types";

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

/** yyyy-mm-dd 往后推 n 天。用本地日期构造，别交给 new Date("2026-11-24") ——
 *  那是按 UTC 解析的，在负时区会退到前一天。 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(
    t.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * 今天收工面板。
 *
 * 一天结束的时候，人真正想知道的不是"我超标了"，是三件事：
 * 我今天到底吃了多少、我动的那些算不算数、明天该怎么办。
 * 所以这个面板按这三件事分三段，不做成一张仪表盘。
 *
 * 关于"超支"，这一版改过一次口径，要看清再动：
 *
 * 早先写的是「不惩罚昨天」—— 超了也只给一条通用建议，绝不提"补回来"。
 * 当时怕的是运动变成赎罪券，人开始为多吃而运动。
 *
 * 但真正用起来才发现，那套说法解决的是**我的顾虑**，不是**他的问题**。
 * 他超了 500，第二天打开只看到"建议骑车 20 分钟"，会直接判定这软件没用 ——
 * 20 分钟抵不掉 500，他心里有数。
 *
 * 现在的做法：把 500 摊开，分摊到明天起的几天，每天有上限。
 * 赎罪和"有数"的区别不在字数，在这三点：
 *   1. 只往前摊，不往回抵 —— 今天的环封口了，运动不会让今天多吃一口
 *   2. 单日 45 分钟封顶，最多 3 天 —— 这不是惩罚，是一个做得完的量
 *   3. 补不完就说补不完 —— 不凑天数、不假装能补齐
 *
 * 还有一条没变：**界面永不出现「净摄入 = 吃了 − 动了」**。
 * 那个数字一出现，账就变成"我还能吃多少"，而不是"我今天吃了多少"。
 */
export default function DaySummary({
  open,
  onClose,
  profile,
  plan,
  meals,
  exercises,
  weightKg,
  tomorrow,
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
  onPlanMany,
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
  /** 明天的日期，补账从这天开始摊 */
  tomorrow: string;
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
  /** 整组覆盖某一天的计划，传空数组就是取消那天 */
  onPlanItems: (date: string, items: PlannedExercise[]) => void;
  /** 一次写多天。补账不能逐天调上面那个，会互相覆盖（见 commitDebt） */
  onPlanMany: (days: { date: string; items: PlannedExercise[] }[]) => void;
}) {
  /** 展开全部运动项，还是只给常用的几个 */
  const [more, setMore] = useState(false);

  /** 补账：他选了哪一项、每天做多久、定了没有 */
  const [debtKind, setDebtKind] = useState<ExerciseKind | null>(null);
  const [debtMin, setDebtMin] = useState(45);
  const [debtDone, setDebtDone] = useState(false);

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
      tomorrow,
      has ? planned.filter((p) => keyOf(p) !== k) : [...planned, item],
    );
  }

  /**
   * 输入框进来的这几项（没超支时走这条）。
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
    onPlanItems(tomorrow, merged);
  }

  /* ---------- 补账 ---------- */

  /** 选一项 → 系统算要多久、分几天。他说了类型，时间由我们给。 */
  function pickDebt(kind: ExerciseKind) {
    setDebtKind(kind);
    setDebtDone(false);
    const d = spreadDebt(over, kind, weightKg, tomorrow);
    setDebtMin(d.slices[0]?.minutes ?? 45);
  }

  const debt = useMemo(() => {
    if (!debtKind || over <= 0) return null;
    const perMin = kcalPerMin(debtKind, weightKg);
    if (perMin <= 0) return null;
    // 天数按"他实际愿意给的分钟数"算，不是按系统一厢情愿的 45 算
    const days = Math.min(
      3,
      Math.max(1, Math.ceil(over / perMin / Math.max(5, debtMin))),
    );
    const covered = Math.min(over, Math.round(days * debtMin * perMin));
    return { perMin, days, covered, leftover: Math.max(0, over - covered) };
  }, [debtKind, debtMin, over, weightKg]);

  /**
   * 定上这几天。
   *
   * 必须一次交上去，不能循环里逐天调 onPlanItems ——
   * 每次回调拿的都是同一份旧 state，后一次会把前一次覆盖掉，
   * 结果只落下最后一天，而界面上写着"明天起 3 天"。
   * 这个 bug 不会报错，只会让人觉得这软件在骗人。
   */
  function commitDebt() {
    if (!debtKind || !debt) return;
    const days: { date: string; items: PlannedExercise[] }[] = [];
    for (let i = 0; i < debt.days; i++) {
      days.push({
        date: addDays(tomorrow, i),
        items: [{ kind: debtKind, minutes: debtMin }],
      });
    }
    onPlanMany(days);
    setDebtDone(true);
  }

  function clearDebt() {
    onPlanMany(
      [0, 1, 2].map((i) => ({ date: addDays(tomorrow, i), items: [] })),
    );
    setDebtDone(false);
    setDebtKind(null);
  }

  const drinkText = drinksLabel(meals.flatMap((m) => m.drinks ?? []));

  // 常用五项先给，剩下的收起来 —— 一屏塞十七项，他一项都不会点
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
            {exercises.length === 0 ? "还没记" : "记漏了补一句"}
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
                    className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-2.5 py-1.5"
                  >
                    <Icon
                      name={def.icon as IconName}
                      size={16}
                      style={{ color: "#176f49" }}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {nameOf(e)}
                    </span>
                    <Stepper
                      compact
                      value={e.minutes}
                      onChange={(v) => onMinutes(e.id, v)}
                      ariaLabel={`${nameOf(e)}的分钟数`}
                    />
                    <span className="w-11 shrink-0 text-right text-[12px] text-ink-300 tabular-nums">
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

          {/* 只摆名字，不摆时间 —— 时间点开再填 */}
          <PickExercise
            options={(more ? EXERCISES : quick).map((d) => ({
              kind: d.kind,
              label: d.label,
              icon: d.icon as IconName,
            }))}
            actionLabel="记上"
            onCommit={(kind, minutes) => onAddExercises([{ kind, minutes }])}
            footer={
              !more && rest.length > 0 ? (
                <button
                  onClick={() => setMore(true)}
                  className="h-9 rounded-lg px-2 text-[13px] font-medium text-brand-600"
                >
                  更多
                </button>
              ) : null
            }
          />

          <Explain>
            按体重 {round(weightKg, 1)} 公斤算，已经扣掉了这段时间本来就该消耗的那部分。
          </Explain>
        </section>

        {/* ---------- 三、明天怎么办 ---------- */}
        <section className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">明天</span>
            <span className="text-[13px] text-ink-300 tabular-nums">
              预算 {tomorrowBudget} 大卡
            </span>
          </div>

          {over > 0 ? (
            <>
              {/* ---- 补账模式：今天超了多少，摊到明天起几天里 ---- */}
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[30px] font-bold leading-none tabular-nums text-[#b23c2c]">
                  {over}
                </span>
                <span className="pb-0.5 text-[13px] text-ink-500">
                  大卡，是今天多出来的
                </span>
              </div>

              <p className="mt-2 text-[14px] font-medium">补回来要动多久，选一项</p>

              <PickExercise
                options={EXERCISES.filter(
                  (d) => !(profile.diseases.includes("hypertension") && (d.kind === "jog" || d.kind === "rope")),
                ).map((d) => ({
                  kind: d.kind,
                  label: d.label,
                  icon: d.icon as IconName,
                }))}
                actionLabel="算一下"
                showStepper={false}
                onCommit={(kind) => pickDebt(kind)}
              />

              {debtKind && debt && (
                <div className="mt-2.5 rounded-xl border border-brand-500 bg-brand-50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium">
                      {debt.days === 1
                        ? `明天 ${debtMin} 分钟`
                        : debt.days === 2
                          ? `明天、后天各 ${debtMin} 分钟`
                          : `明天起 ${debt.days} 天，每天 ${debtMin} 分钟`}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-ink-500">
                      约 {debt.covered} 卡
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[13px] text-ink-500">每天改一下</span>
                    <Stepper
                      value={debtMin}
                      onChange={(v) => {
                        setDebtMin(v);
                        setDebtDone(false);
                      }}
                      min={5}
                      max={90}
                    />
                  </div>

                  {debt.leftover > 0 && (
                    <p className="mt-2 text-[12px] leading-relaxed text-[#b23c2c]">
                      还差 {debt.leftover} 卡 ——
                      {debt.days >= 3
                        ? "三天补不完。换一项快点的，或者这次就先这样。"
                        : "把每天的时间加上去，或者多摊一天。"}
                    </p>
                  )}

                  {planned.length > 0 && (
                    <Explain className="mt-2 text-[12px] leading-relaxed text-ink-500">
                      明天原本定了 {planned.map(nameOf).join("、")}，定上会换掉。
                    </Explain>
                  )}

                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={commitDebt}
                      className="h-10 flex-1 rounded-xl bg-brand-500 text-[14px] font-medium text-white active:scale-[0.98]"
                    >
                      {debtDone ? "改好了，重新定" : "就这么定"}
                    </button>
                    <button
                      onClick={clearDebt}
                      className="h-10 shrink-0 rounded-xl bg-white/70 px-3 text-[14px] font-medium text-ink-500 active:scale-[0.98]"
                    >
                      清掉
                    </button>
                  </div>

                  {debtDone && (
                    <p className="mt-2 text-[12px] leading-relaxed text-brand-600">
                      定上了。明天打开首页就能看见。
                    </p>
                  )}
                </div>
              )}

              {/* 说一句也行：只说运动类型，时间由上面算 */}
              <div className="mt-3 border-t border-black/[0.05] pt-2">
                <p className="text-[12px] text-ink-300">不想挑？说一项也行</p>
                <ExerciseSay
                  actionLabel="算一下"
                  ariaLabel="用语音说明天想做什么运动"
                  placeholder="游泳"
                  footnote="只说运动类型就行，要动多久我来算。"
                  onSubmit={(items) => {
                    if (items[0]) pickDebt(items[0].kind);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {/* ---- 没超支：给几条建议，他自己挑 ---- */}
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
                {planned.length > 0 ? "明天这几项，打开就在首页上。" : "明天做点什么"}
              </p>

              <Explain>
                建议 {suggest.minutes} 分钟 —— {suggest.why}
              </Explain>

              <ExerciseSay
                actionLabel="定上"
                ariaLabel="用语音说明天想做什么运动"
                placeholder="快走和游泳各半小时"
                footnote="一次能说几种，用「和」隔开；没说时长的，按上面的建议量给。"
                onSubmit={planFromInput}
              />

              {planned.length > 0 && (
                <div className="mt-3 space-y-2">
                  {planned.map((item) => {
                    const a = adviceOf(item.kind, item.minutes, weightKg, profile);
                    return (
                      <div
                        key={keyOf(item)}
                        className="flex items-start gap-2.5 rounded-xl border border-brand-500 bg-brand-50 px-3 py-2"
                      >
                        <Icon
                          name={a.def.icon as IconName}
                          size={18}
                          style={{ color: "#176f49" }}
                          className="mt-1 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-snug">
                            {nameOf(item)}{" "}
                            <span className="text-ink-500">{a.minutes} 分钟</span>
                            <span className="ml-1 text-[13px] font-normal text-ink-300 tabular-nums">
                              约 {a.kcal} 卡
                            </span>
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

              <PickExercise
                options={advices
                  .filter((a) => !planned.some((p) => keyOf(p) === a.def.kind))
                  .map((a) => ({
                    kind: a.def.kind,
                    label: a.def.label,
                    icon: a.def.icon as IconName,
                  }))}
                actionLabel="定上"
                defaultMinutes={() => suggest.minutes}
                onCommit={(kind, minutes) =>
                  togglePlan({ kind, minutes })
                }
              />

              {planned.length > 1 && (
                <button
                  onClick={() => onPlanItems(tomorrow, [])}
                  className="mt-2 text-[12px] font-medium text-ink-300"
                >
                  全清掉，重新挑
                </button>
              )}
            </>
          )}

          <Explain>
            明天的预算按你最近一周实际动的情况算：这周动得多，明天就宽松一点。
          </Explain>
        </section>

        {/*
          这段是整个功能里最重要的一句话。
          没有它，用户会把"运动 380 大卡"读成"我可以再吃 380 大卡"，
          而这正是所有记卡路里软件最后失败的地方。
        */}
        <Explain className="px-1 text-[12px] leading-relaxed text-ink-300">
          运动不抵扣今天的饭量。今天动掉的这些，已经算进明天的预算里了 ——
          它让明天宽松一点，不是给今晚加一顿。
        </Explain>

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

/**
 * 运动选择器：只给名字，点开才填时间。
 *
 * 这一版把按钮上的"40 分"拿掉了，是因为那个数字在撒谎 ——
 * 它看起来像"系统认为你该走 40 分钟"，其实只是库里随手填的默认值。
 * 他要是照着 40 分钟走，走完发现跟自己的习惯对不上，下次就不点了。
 *
 * 现在的顺序是：先认出"我今天干的是这件事"（点名字），
 * 再决定"干了多久"（填数）。第二件事只有他自己知道。
 */
function PickExercise({
  options,
  actionLabel,
  onCommit,
  defaultMinutes,
  showStepper = true,
  footer,
}: {
  options: { kind: ExerciseKind; label: string; icon: IconName }[];
  actionLabel: string;
  onCommit: (kind: ExerciseKind, minutes: number) => void;
  /** 展开时的初始分钟数。不传就用这项运动的默认值 */
  defaultMinutes?: () => number;
  /** 补账那种"时间由系统算"的场景不需要填分钟 */
  showStepper?: boolean;
  footer?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<ExerciseKind | null>(null);
  const [minutes, setMinutes] = useState(30);
  const pickedDef = picked ? exerciseDef(picked) : null;
  const pickedLabel = picked
    ? options.find((o) => o.kind === picked)?.label ?? pickedDef?.label ?? ""
    : "";

  function choose(kind: ExerciseKind) {
    // 时间由系统算的场景（补账），点一下就出结果 —— 不用再点第二次确认。
    // 多一步"算一下"，他会以为还要填什么。
    if (!showStepper) {
      onCommit(kind, 0);
      return;
    }
    if (picked === kind) {
      setPicked(null);
      return;
    }
    setPicked(kind);
    setMinutes(defaultMinutes ? defaultMinutes() : exerciseDef(kind).defaultMin);
  }

  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = picked === o.kind;
          return (
            <button
              key={o.kind}
              onClick={() => choose(o.kind)}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition active:scale-95 ${
                on
                  ? "bg-brand-500 text-white"
                  : "bg-black/[0.04] text-ink-700 active:bg-black/[0.08]"
              }`}
            >
              <Icon
                name={o.icon}
                size={15}
                style={{ color: on ? "#ffffff" : "#5b6660" }}
                className="shrink-0"
              />
              {o.label}
            </button>
          );
        })}
        {footer}
      </div>

      {picked && pickedDef && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-brand-500 bg-brand-50 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
            {pickedLabel}
          </span>
          {showStepper && (
            <Stepper
              value={minutes}
              onChange={setMinutes}
              min={5}
              max={240}
              ariaLabel={`${pickedLabel}的分钟数`}
            />
          )}
          <button
            aria-label={`${actionLabel}${pickedLabel}`}
            onClick={() => {
              onCommit(picked, minutes);
              setPicked(null);
            }}
            className="h-9 shrink-0 rounded-lg bg-brand-500 px-3 text-[13px] font-medium text-white active:scale-95"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </>
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
