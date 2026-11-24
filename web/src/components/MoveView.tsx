"use client";

import { useMemo, useState } from "react";
import Icon, { type IconName } from "./Icon";
import Stepper from "./Stepper";
import Explain from "./Explain";
import ExerciseSay from "./ExerciseSay";
import type { ParsedExercise } from "@/lib/exerciseParse";
import {
  EXERCISES,
  adviceOf,
  adviseTomorrow,
  amountFromMinutes,
  burnKcal,
  burnOfLog,
  exerciseDef,
  metricOf,
  minutesOfAmount,
  nameOf,
  riskOf,
  shiftDate,
  spreadDebt,
  suggestMinutes,
} from "@/lib/exercise";
import { round } from "@/lib/nutrition";
import type {
  ExerciseKind,
  ExerciseLog,
  ExercisePlan,
  NutritionPlan,
  PlannedExercise,
  Profile,
} from "@/lib/types";

/** 补账最多摊三天 */
const DAY_WORD = ["明天", "后天", "大后天"];

/** 计划项的身份证：同一种运动算同一项，"其他"按名字区分 */
function keyOf(x: { kind: ExerciseKind; label?: string }) {
  return x.kind === "other" ? `other:${x.label ?? ""}` : x.kind;
}

/**
 * 运动这一页。
 *
 * 为什么要单独一页：原来它是首页底部的一行入口，点开是个弹层，
 * 里面塞着"今天动了多少 / 超支怎么办 / 明天做什么"三段。
 * 结果是首页被一个次要入口占掉一格，弹层里三件事挤在一屏 ——
 * 用户原话："如果作为首页的附件，他的占比不对，而且内容太多了"。
 *
 * 拆出来之后职责就清楚了：
 * - 首页只管**吃**（吃了多少、下一顿吃什么）
 * - 这一页只管**动**（记今天、看昨天定的、排明天）
 * - 总账页把两边的数并排放在一起，但不做减法（H5）
 *
 * 三页的分工写进 docs/05 的 ADR-021。
 */
export default function MoveView({
  profile,
  plan,
  weightKg,
  exercises,
  allExercises,
  planToday,
  planTomorrow,
  tomorrow,
  tomorrowBudget,
  over,
  onAddExercises,
  onRemoveExercise,
  onAmount,
  onPlanItems,
  onPlanMany,
}: {
  profile: Profile;
  plan: NutritionPlan;
  weightKg: number;
  /** 今天的运动记录 */
  exercises: ExerciseLog[];
  /** 全部记录，画近 7 天用 */
  allExercises: ExerciseLog[];
  /** 昨天定给今天的 */
  planToday: ExercisePlan | null;
  /** 已经定给明天的 */
  planTomorrow: ExercisePlan | null;
  tomorrow: string;
  tomorrowBudget: number;
  /** 今天超了多少（正数才是超） */
  over: number;
  onAddExercises: (
    items: { kind: ExerciseKind; label?: string; minutes: number; amount?: number }[],
  ) => void;
  onRemoveExercise: (id: string) => void;
  /** 改运动量：量（公里/个数/null）和折算出来的分钟一起写 */
  onAmount: (id: string, amount: number | null, minutes: number) => void;
  onPlanItems: (date: string, items: PlannedExercise[]) => void;
  onPlanMany: (days: { date: string; items: PlannedExercise[] }[]) => void;
}) {
  const [more, setMore] = useState(false);
  /*
   * 录入区默认收起。
   *
   * 一屏里原来同时摆着：两条已记的运动（带 ± 和垃圾桶）、
   * 一个"说一句"输入框加确定、一个麦克风、以及八个运动按钮 ——
   * 光能点的东西就有二十来个，而他打开这一页通常只想看一眼今天动了多少。
   *
   * 现在只在需要加的时候展开。今天一条都没有的人仍然直接看到它，
   * 否则他会在一个空页面上找入口。
   */
  const [adding, setAdding] = useState(false);
  const showAdd = adding || exercises.length === 0;

  /* 明天的排期入口同样收起来 —— 它是铺垫，不该占着一整套输入控件 */
  const [planOpen, setPlanOpen] = useState(false);

  /** 补账：选了哪几项、每天最多动多久、定了没有 */
  const [debtKinds, setDebtKinds] = useState<ExerciseKind[]>([]);
  const [dayCap, setDayCap] = useState(75);
  const [debtDone, setDebtDone] = useState(false);

  const burn = useMemo(
    () => exercises.reduce((s, e) => s + burnOfLog(e, weightKg), 0),
    [exercises, weightKg],
  );

  const today = {
    kcal: plan.dailyBudgetKcal + over,
    budget: plan.dailyBudgetKcal,
    protein: 0,
    proteinTarget: plan.proteinTargetG,
  };

  const advices = useMemo(
    () => adviseTomorrow(profile, weightKg, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, weightKg, over, plan],
  );

  const suggest = useMemo(() => suggestMinutes(today), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    over,
    plan,
  ]);

  const planned = planTomorrow?.items ?? [];
  const todo = planToday?.items ?? [];

  /** 昨天定给今天的，哪几项已经记上了 */
  const doneKinds = useMemo(
    () => new Set(exercises.map((e) => keyOf(e))),
    [exercises],
  );

  function togglePlan(item: PlannedExercise) {
    const k = keyOf(item);
    const has = planned.some((p) => keyOf(p) === k);
    onPlanItems(
      tomorrow,
      has ? planned.filter((p) => keyOf(p) !== k) : [...planned, item],
    );
  }

  /** 输入框进来的这几项（没超支时走这条） */
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

  function toggleDebtKind(kind: ExerciseKind) {
    setDebtDone(false);
    setDebtKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  const debt = useMemo(
    () =>
      debtKinds.length
        ? spreadDebt(over, debtKinds, weightKg, tomorrow, dayCap)
        : null,
    [debtKinds, over, weightKg, tomorrow, dayCap],
  );

  /**
   * 定上这几天。
   * 必须一次交上去，不能循环里逐天调 onPlanItems —— 每次回调拿的都是同一份
   * 旧 state，后一次会把前一次覆盖掉，结果只落下最后一天（K43）。
   */
  function commitDebt() {
    if (!debt || !debt.days.length) return;
    onPlanMany(
      debt.days.map((d) => ({
        date: d.date,
        items: d.items.map((x) => ({ kind: x.kind, minutes: x.minutes })),
      })),
    );
    setDebtDone(true);
  }

  function clearDebt() {
    onPlanMany(
      [0, 1, 2].map((i) => ({ date: shiftDate(tomorrow, i), items: [] })),
    );
    setDebtDone(false);
    setDebtKinds([]);
  }

  const quick = EXERCISES.slice(0, 5);
  const rest = EXERCISES.slice(5);

  /* ---------- 近 7 天 ---------- */
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(tomorrow, i - 7));
    return days.map((d) => ({
      date: d,
      kcal: allExercises
        .filter((e) => e.date === d)
        .reduce((s, e) => s + burnOfLog(e, weightKg), 0),
    }));
  }, [allExercises, tomorrow, weightKg]);
  const weekMax = Math.max(1, ...week.map((d) => d.kcal));
  const weekTotal = week.reduce((s, d) => s + d.kcal, 0);

  return (
    <div className="pb-52">
      <header className="safe-top flex items-end justify-between px-5 pb-3 pt-3">
        <h1 className="text-[27px] font-bold tracking-tight">运动</h1>
        <span className="pb-1 text-[13px] tabular-nums text-ink-400">
          今天消耗 <b className="text-[16px] font-semibold text-brand-600">{burn}</b> 大卡
        </span>
      </header>

      {/* ---------- 一、今天 ---------- */}
      <section className="px-5">
        <div className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">今天动了多少</span>
            {exercises.length > 0 && (
              <span className="text-[13px] tabular-nums text-ink-300">
                {exercises.length} 项
              </span>
            )}
          </div>

          {exercises.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-300">还没记</p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {exercises.map((e) => (
                <ExerciseRow
                  key={e.id}
                  log={e}
                  weightKg={weightKg}
                  onAmount={onAmount}
                  onRemove={() => onRemoveExercise(e.id)}
                />
              ))}
            </div>
          )}

          {/* 说一句：口语也能记，时长没说的按默认给。收起时只留一行入口 */}
          <div className="mt-3 border-t border-black/[0.05] pt-2.5">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              aria-expanded={showAdd}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-1.5 text-[15px] font-medium text-brand-600">
                <Icon name={showAdd ? "close" : "plus"} size={14} />
                {showAdd ? "收起" : "加一项"}
              </span>
              {!showAdd && (
                <span className="text-[12px] text-ink-300">
                  说一句也行
                </span>
              )}
            </button>

            {showAdd && (
              <>
                <div className="mt-2.5">
                  <ExerciseSay
                    actionLabel="确定"
                    ariaLabel="用语音说今天做了什么运动"
                    placeholder="快走 40 分钟、跳绳 1000 个"
                    onSubmit={(items) =>
                      onAddExercises(
                        items.map((p) => ({
                          kind: p.kind,
                          minutes: p.minutes,
                          ...(p.kind === "other" && p.label
                            ? { label: p.label }
                            : {}),
                        })),
                      )
                    }
                  />
                </div>

                {/* 挑一项：按这一项自己的量填（公里 / 个 / 分钟） */}
                <PickExercise
                  options={(more ? EXERCISES : quick).map((d) => ({
                    kind: d.kind,
                    label: d.label,
                    icon: d.icon as IconName,
                  }))}
                  weightKg={weightKg}
                  onCommit={(kind, minutes, amount) =>
                    onAddExercises([
                      {
                        kind,
                        minutes,
                        ...(amount ? { amount } : {}),
                      },
                    ])
                  }
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
              </>
            )}
          </div>
        </div>
      </section>

      {/* ---------- 二、今天该做的（昨天定下的） ---------- */}
      {todo.length > 0 && (
        <section className="mt-3 px-5">
          <div className="rounded-2xl bg-brand-50 px-3.5 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-brand-700">
                今天要做的
              </span>
              <span className="text-[12px] text-brand-600/70">
                {doneKinds.size > 0 && todo.some((t) => doneKinds.has(keyOf(t)))
                  ? "做完就记上"
                  : "昨天定的"}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {todo.map((t) => {
                const done = doneKinds.has(keyOf(t));
                const def = exerciseDef(t.kind);
                return (
                  <div key={keyOf(t)} className="flex items-center gap-2">
                    <Icon
                      name={def.icon as IconName}
                      size={17}
                      className="shrink-0 text-brand-700"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-700">
                      {nameOf(t)}{" "}
                      <span className="text-[13px] text-ink-400">
                        {t.minutes} 分钟
                      </span>
                    </span>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-brand-600">
                        <Icon name="check" size={14} />
                        已记
                      </span>
                    ) : (
                      <button
                        onClick={() => onAddExercises([{ kind: t.kind, minutes: t.minutes }])}
                        className="h-8 shrink-0 rounded-lg bg-brand-500 px-3 text-[13px] font-medium text-white active:scale-95"
                      >
                        记上
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---------- 三、明天 ---------- */}
      <section className="mt-3 px-5">
        <div className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">明天</span>
            <span className="text-[13px] tabular-nums text-ink-300">
              预算 {tomorrowBudget} 大卡
            </span>
          </div>

          {over > 0 ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[30px] font-bold leading-none tabular-nums text-[#b23c2c]">
                  {over}
                </span>
                <span className="pb-0.5 text-[13px] text-ink-500">
                  大卡，是今天多出来的
                </span>
              </div>

              <p className="mt-3 text-[14px] font-medium">补回来动什么，挑几项</p>
              <Explain className="mt-0.5">
                一项做两小时你坐不住，三样各半小时能做完 —— 卡路里一样，完成率高得多。
              </Explain>

              <MultiPick
                options={EXERCISES.filter(
                  (d) => !riskOf(d.kind, profile, weightKg),
                ).map((d) => ({
                  kind: d.kind,
                  label: d.label,
                  icon: d.icon as IconName,
                }))}
                selected={debtKinds}
                onToggle={toggleDebtKind}
              />

              {debt && debt.days.length > 0 && (
                <div className="mt-2.5 rounded-xl border border-brand-500 bg-brand-50 p-3">
                  <div className="space-y-2">
                    {debt.days.map((d, i) => (
                      <div key={d.date}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[14px] font-semibold">
                            {DAY_WORD[i] ?? d.date.slice(5)}
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-ink-500">
                            约 {d.kcal} 卡
                          </span>
                        </div>
                        <p className="mt-0.5 text-[13px] leading-snug text-ink-700">
                          {d.items
                            .map((x) => nameOf(x) + " " + x.minutes + " 分钟")
                            .join(" + ")}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-brand-500/20 pt-2.5">
                    <span className="text-[13px] text-ink-500">每天最多动</span>
                    <Stepper
                      value={dayCap}
                      onChange={(v) => {
                        setDayCap(v);
                        setDebtDone(false);
                      }}
                      min={30}
                      max={120}
                    />
                  </div>

                  <p className="mt-2 text-[12px] leading-relaxed">
                    {debt.leftover > 0 ? (
                      <span className="text-[#b23c2c]">
                        三天还差 {debt.leftover} 卡 —— 加一项强度大的，或者每天多动一会儿。
                      </span>
                    ) : debt.oneDay ? (
                      <span className="text-brand-600">
                        明天一天补完，约 {debt.covered} 卡。
                      </span>
                    ) : (
                      <span className="text-brand-600">
                        {debt.days.length} 天补完，共约 {debt.covered} 卡。
                      </span>
                    )}
                  </p>

                  {planned.length > 0 && (
                    <Explain className="mt-1.5 text-ink-500">
                      明天原本定了 {planned.map(nameOf).join("、")}，确定会换掉。
                    </Explain>
                  )}

                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={commitDebt}
                      className="h-10 flex-1 rounded-xl bg-brand-500 text-[14px] font-medium text-white active:scale-[0.98]"
                    >
                      {debtDone ? "重定" : "确定"}
                    </button>
                    <button
                      onClick={clearDebt}
                      aria-label="清空补账计划"
                      className="flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70 text-ink-500 active:scale-[0.98]"
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>

                  {debtDone && (
                    <p className="mt-2 text-[12px] leading-relaxed text-brand-600">
                      定上了。明天打开这一页就能看见。
                    </p>
                  )}
                </div>
              )}

              {/* 说一句也行：只说运动类型，时间由上面算 */}
              <div className="mt-3 border-t border-black/[0.05] pt-2">
                <p className="text-[12px] text-ink-300">不想挑？说一句也行</p>
                <ExerciseSay
                  actionLabel="确定"
                  ariaLabel="用语音说明天想做什么运动"
                  placeholder="游泳和快走"
                  onSubmit={(items) => {
                    const ks = items.map((p) => p.kind).filter((k) => k !== "other");
                    if (!ks.length) return;
                    setDebtKinds((prev) => [...new Set([...prev, ...ks])]);
                    setDebtDone(false);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {planned.length > 0 && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
                  明天这几项，打开就在这一页上。
                </p>
              )}

              <Explain>
                建议 {suggest.minutes} 分钟 —— {suggest.why}
              </Explain>

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
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-ink-500"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/*
                排明天的入口收起来。
                这一页的主线是"今天动了多少"，明天只是铺垫 ——
                可它原本摊着一整套输入框、麦克风和三四个按钮，
                跟上面"加一项"长得一模一样，看着像同一个功能做了两遍。
                已经排好的项目仍然常显，那是状态，不是操作。
              */}
              <button
                type="button"
                onClick={() => setPlanOpen((v) => !v)}
                aria-expanded={planOpen}
                className="mt-2.5 flex w-full items-center justify-between border-t border-black/[0.05] pt-2.5"
              >
                <span className="flex items-center gap-1.5 text-[15px] font-medium text-brand-600">
                  <Icon name={planOpen ? "close" : "plus"} size={14} />
                  {planOpen
                    ? "收起"
                    : planned.length > 0
                      ? "再排一项"
                      : "明天做点什么"}
                </span>
                {!planOpen && (
                  <span className="text-[12px] text-ink-300">说一句也行</span>
                )}
              </button>

              {planOpen && (
                <>
                  <div className="mt-2">
                    <ExerciseSay
                      actionLabel="确定"
                      ariaLabel="用语音说明天想做什么运动"
                      placeholder="快走和游泳各半小时"
                      onSubmit={planFromInput}
                    />
                  </div>

                  <PickExercise
                    options={advices
                      .filter((a) => !planned.some((p) => keyOf(p) === a.def.kind))
                      .map((a) => ({
                        kind: a.def.kind,
                        label: a.def.label,
                        icon: a.def.icon as IconName,
                      }))}
                    weightKg={weightKg}
                    defaultMinutes={() => suggest.minutes}
                    onPlan={(kind, minutes) => togglePlan({ kind, minutes })}
                  />
                </>
              )}

              {planned.length > 1 && (
                <button
                  onClick={() => onPlanItems(tomorrow, [])}
                  className="mt-2 flex items-center gap-1 text-[12px] font-medium text-ink-300"
                >
                  <Icon name="trash" size={12} />
                  清空
                </button>
              )}

            </>
          )}

          <Explain>
            明天的预算按你最近一周实际动的情况算：这周动得多，明天就宽松一点。
          </Explain>
        </div>
      </section>

      {/* ---------- 四、近 7 天 ---------- */}
      <section className="mt-3 px-5">
        <div className="card p-4!">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">近 7 天动的</span>
            <span className="text-[13px] tabular-nums text-ink-300">
              共 {weekTotal} 大卡
            </span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-1.5">
            {week.map((d) => {
              const h = d.kcal === 0 ? 4 : Math.max(8, Math.round((d.kcal / weekMax) * 78));
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] leading-none tabular-nums text-ink-300">
                    {d.kcal > 0 ? d.kcal : ""}
                  </span>
                  <div
                    className="w-full rounded-md"
                    style={{
                      height: h,
                      background: d.kcal === 0 ? "#e7eae8" : "#3f9d74",
                    }}
                  />
                  <span className="text-[11px] leading-none text-ink-300">
                    {d.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <p className="mt-6 px-8 text-center text-[12px] leading-relaxed text-ink-300">
        消耗是估算，误差两成上下。
        <br />
        它让明天的预算宽一点，不会让今天的饭多吃一口。
      </p>
    </div>
  );
}

/**
 * 一条运动记录。
 *
 * 左边名字下面那行小字，只有按公里/个数量的项目才有 ——
 * 它回答的是"这 5.5 公里折成多少分钟"，因为卡路里是按分钟算的，
 * 不写出来他会以为系统在拿公里乘一个莫名其妙的数。
 */
function ExerciseRow({
  log,
  weightKg,
  onAmount,
  onRemove,
}: {
  log: ExerciseLog;
  weightKg: number;
  onAmount: (id: string, amount: number | null, minutes: number) => void;
  onRemove: () => void;
}) {
  const def = exerciseDef(log.kind);
  const metric = metricOf(log.kind);
  const byAmount = metric.unit !== "min";
  const value = byAmount
    ? log.amount ?? amountFromMinutes(log.kind, log.minutes)
    : log.minutes;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-2.5 py-2">
      <Icon
        name={def.icon as IconName}
        size={16}
        style={{ color: "#176f49" }}
        className="shrink-0"
      />
      {/*
        名字和卡路里分两行，因为一行放不下：
        公里要占掉输入框小一半，再塞一个卡路里列，名字就只剩四个字宽，
        "快走"会变成"快…"。这行里真正要读的只有名字，它得先站住。
      */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight">{nameOf(log)}</p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-ink-400 tabular-nums">
          {byAmount
            ? `${log.minutes} 分 · ${burnOfLog(log, weightKg)} 卡`
            : `${burnOfLog(log, weightKg)} 卡`}
        </p>
      </div>

      <Stepper
        compact
        value={value}
        onChange={(v) =>
          onAmount(
            log.id,
            byAmount ? v : null,
            byAmount ? minutesOfAmount(log.kind, v) : v,
          )
        }
        min={metric.min}
        max={metric.max}
        step={metric.step}
        unit={metric.suffix}
        decimal={metric.decimal}
        ariaLabel={`${nameOf(log)}的${metric.suffix}数`}
      />

      <button
        aria-label={`删掉${nameOf(log)}`}
        onClick={onRemove}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink-500 active:scale-90"
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}

/**
 * 运动选择器：只给名字，点开才填量。
 *
 * 填什么由这一项的 metric 决定 —— 快走填公里、跳绳填个数、太极填分钟。
 * 底下那行"约 45 分钟 · 172 卡"是给公里和个数用的：不换算出来，
 * 他会以为系统拿公里数乘了个黑箱。
 */
function PickExercise({
  options,
  weightKg,
  onCommit,
  onPlan,
  defaultMinutes,
  footer,
}: {
  options: { kind: ExerciseKind; label: string; icon: IconName }[];
  weightKg: number;
  /** 记今天：量要一起交上去 */
  onCommit?: (kind: ExerciseKind, minutes: number, amount?: number) => void;
  /** 定明天：只要分钟 */
  onPlan?: (kind: ExerciseKind, minutes: number) => void;
  /** 展开时的初始分钟数。不传就用这项运动的默认值 */
  defaultMinutes?: () => number;
  footer?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<ExerciseKind | null>(null);
  const [amount, setAmount] = useState(0);

  const metric = picked ? metricOf(picked) : null;
  const pickedLabel = picked
    ? options.find((o) => o.kind === picked)?.label ?? exerciseDef(picked).label
    : "";
  const minutes = picked ? minutesOfAmount(picked, amount) : 0;
  const kcal = picked ? burnKcal(picked, weightKg, minutes) : 0;

  function choose(kind: ExerciseKind) {
    if (picked === kind) {
      setPicked(null);
      return;
    }
    setPicked(kind);
    const m = metricOf(kind);
    setAmount(
      m.unit === "min"
        ? defaultMinutes?.() ?? exerciseDef(kind).defaultMin
        : amountFromMinutes(kind, defaultMinutes?.() ?? exerciseDef(kind).defaultMin),
    );
  }

  function commit() {
    if (!picked) return;
    if (onCommit) onCommit(picked, minutes, metric!.unit === "min" ? undefined : amount);
    if (onPlan) onPlan(picked, minutes);
    setPicked(null);
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

      {picked && metric && (
        <div className="mt-2 rounded-xl border border-brand-500 bg-brand-50 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {pickedLabel}
            </span>
            <Stepper
              value={amount}
              onChange={setAmount}
              min={metric.min}
              max={metric.max}
              step={metric.step}
              unit={metric.suffix}
              decimal={metric.decimal}
              ariaLabel={`${pickedLabel}的${metric.suffix}数`}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] tabular-nums text-ink-500">
              {metric.unit === "min"
                ? `${kcal} 卡`
                : `约 ${minutes} 分钟 · ${kcal} 卡`}
            </span>
            <button
              aria-label={`确定${pickedLabel}`}
              onClick={commit}
              className="h-8 shrink-0 rounded-lg bg-brand-500 px-3.5 text-[13px] font-medium text-white active:scale-95"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 多选一格的运动网格：只勾不填，时长交给补账算法去分。
 * 和 PickExercise 分开写，因为它们是两件事，合起来状态会互相污染（勾了没定 / 定了没勾）。
 */
function MultiPick({
  options,
  selected,
  onToggle,
}: {
  options: { kind: ExerciseKind; label: string; icon: IconName }[];
  selected: ExerciseKind[];
  onToggle: (kind: ExerciseKind) => void;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.kind);
        return (
          <button
            key={o.kind}
            onClick={() => onToggle(o.kind)}
            aria-pressed={on}
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
    </div>
  );
}
