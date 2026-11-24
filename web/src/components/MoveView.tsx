"use client";

import { useMemo, useState } from "react";
import Icon, { type IconName } from "./Icon";
import Stepper from "./Stepper";
import Explain from "./Explain";
import ExerciseSay from "./ExerciseSay";
import type { ParsedExercise } from "@/lib/exerciseParse";
import {
  EXERCISES,
  MIN_DEBT_KCAL,
  adviceOf,
  amountFromMinutes,
  amountText,
  burnKcal,
  burnOfAmount,
  burnOfLog,
  exerciseDef,
  makeupDefaultAmount,
  metricOf,
  minutesOfAmount,
  nameOf,
  riskOf,
  shiftDate,
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

  /**
   * 明天那一排「更多」。
   *
   * 原来是系统按身体情况挑三项摆出来 —— 用户拿两张截图来对比：
   * 「计划明天的运动，你也要像今天的运动一样，提供相同的选项，
   * 让他一下子想不到的时候，可以在这些选项里面选」。
   * 三项不是候选，是结论；他想不到的是自己还能做什么。
   * 所以两边给同一套：先五个常用的，点「更多」出全套。
   */
  const [planMore, setPlanMore] = useState(false);

  /**
   * 补账：选了哪几项、每项做多少、定了没有。
   *
   * 量由他自己填（公里 / 个 / 分钟，按项目走），卡路里跟着算。
   * 上一版是系统按"每项 10 分钟"自动排出来的，超 13 大卡也能排到 277 大卡 ——
   * 用户问"为啥默认全是 10 分钟"，问的是同一件事：那不是他的计划，是算法的。
   */
  const [debtKinds, setDebtKinds] = useState<ExerciseKind[]>([]);
  const [debtAmounts, setDebtAmounts] = useState<
    Partial<Record<ExerciseKind, number>>
  >({});
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
    const on = debtKinds.includes(kind);
    // 平摊的份数按勾完之后算：只剩一项时，这一项就得独自扛下整笔账
    const share = over / Math.max(1, on ? debtKinds.length - 1 : debtKinds.length + 1);
    setDebtKinds((prev) =>
      on ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
    // 减掉的项把数一起扔掉，免得下次再勾上时还留着上次那个值
    setDebtAmounts((prev) => {
      if (on) {
        const next = { ...prev };
        delete next[kind];
        return next;
      }
      return { ...prev, [kind]: makeupDefaultAmount(kind, weightKg, share) };
    });
  }

  const debtItems = useMemo(
    () =>
      debtKinds.map((kind) => {
        const amount =
          debtAmounts[kind] ??
          makeupDefaultAmount(kind, weightKg, over / Math.max(1, debtKinds.length));
        return {
          kind,
          amount,
          minutes: minutesOfAmount(kind, amount),
          kcal: burnOfAmount(kind, weightKg, amount),
        };
      }),
    [debtKinds, debtAmounts, weightKg, over],
  );
  const debtKcal = debtItems.reduce((s, x) => s + x.kcal, 0);

  /**
   * 定上明天。
   *
   * 一次交上去，不能循环里逐天调 onPlanItems —— 每次回调拿的都是同一份
   * 旧 state，后一次会把前一次覆盖掉（K43）。
   * 按分钟量的项目不写 amount：它和 minutes 是同一个数，存两遍迟早对不上。
   */
  function commitDebt() {
    if (!debtItems.length) return;
    onPlanItems(
      tomorrow,
      debtItems.map((x) => ({
        kind: x.kind,
        minutes: x.minutes,
        ...(metricOf(x.kind).unit === "min" ? {} : { amount: x.amount }),
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
    setDebtAmounts({});
  }

  const quick = EXERCISES.slice(0, 5);
  const rest = EXERCISES.slice(5);

  /**
   * 补账那张网格展开到哪一步。
   *
   * 十六项一次铺开是四行半，把下面的输入框和合计全推下去了 ——
   * 他真正要动的是"填多少"，不是看完整张清单。所以先给五个常用的，
   * 点「更多」再出全套。
   *
   * 但收起时**已经勾上的项必须留着**：勾了跳绳再点收起，那一格要是跟着消失，
   * 他会以为系统把他选的取消了。
   */
  const [debtMore, setDebtMore] = useState(false);
  const quickKinds = new Set(quick.map((d) => d.kind));
  const debtRest = rest.filter((d) => !riskOf(d.kind, profile, weightKg));
  const debtOptions = (
    debtMore
      ? EXERCISES
      : [
          ...quick,
          ...rest.filter((d) => debtKinds.includes(d.kind) && !quickKinds.has(d.kind)),
        ]
  ).filter((d) => !riskOf(d.kind, profile, weightKg));

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
                {showAdd ? "收起" : "添加"}
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
              <span className="text-[12px] text-brand-600/70">昨天定的</span>
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
                        {/* 定的是"跑 5 公里"就写 5 公里，别给他折成分钟 */}
                        {t.amount
                          ? amountText(t.kind, t.amount)
                          : `${t.minutes} 分钟`}
                      </span>
                    </span>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-brand-600">
                        <Icon name="check" size={14} />
                        已记
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          onAddExercises([
                            {
                              kind: t.kind,
                              minutes: t.minutes,
                              ...(t.amount ? { amount: t.amount } : {}),
                            },
                          ])
                        }
                        className="h-8 shrink-0 rounded-lg bg-brand-500 px-3 text-[13px] font-medium text-white active:scale-95"
                      >
                        确定
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

          {/* 十几二十卡的账不排运动：最小的一次都顶出两三倍，比这笔账本身还大 */}
          {over >= MIN_DEBT_KCAL ? (
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
                options={debtOptions.map((d) => ({
                  kind: d.kind,
                  label: d.label,
                  icon: d.icon as IconName,
                }))}
                selected={debtKinds}
                onToggle={toggleDebtKind}
                footer={
                  debtRest.length === 0 ? null : debtMore ? (
                    <button
                      onClick={() => setDebtMore(false)}
                      className="h-9 rounded-lg px-2 text-[13px] font-medium text-ink-500"
                    >
                      收起
                    </button>
                  ) : (
                    <button
                      onClick={() => setDebtMore(true)}
                      className="h-9 rounded-lg px-2 text-[13px] font-medium text-brand-600"
                    >
                      更多
                    </button>
                  )
                }
              />

              {debtKinds.length > 0 && (
                <div className="mt-2.5 rounded-xl border border-brand-500 bg-brand-50 p-3">
                  <div className="space-y-2">
                    {debtItems.map((it) => {
                      const m = metricOf(it.kind);
                      return (
                        <div key={it.kind} className="flex items-center gap-2">
                          <Icon
                            name={exerciseDef(it.kind).icon as IconName}
                            size={17}
                            style={{ color: "#176f49" }}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium leading-tight">
                              {nameOf(it)}
                            </p>
                            <p className="text-[11px] tabular-nums text-ink-400">
                              {it.minutes} 分钟，约 {it.kcal} 卡
                            </p>
                          </div>
                          <Stepper
                            compact
                            value={it.amount}
                            onChange={(v) => {
                              setDebtDone(false);
                              setDebtAmounts((prev) => ({ ...prev, [it.kind]: v }));
                            }}
                            min={m.min}
                            max={m.max}
                            step={m.step}
                            unit={m.suffix}
                            decimal={m.decimal}
                            ariaLabel={`${nameOf(it)}的${m.suffix}数`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-2.5 border-t border-brand-500/20 pt-2.5 text-[12px] leading-relaxed">
                    {debtKcal >= over ? (
                      <span className="text-brand-600">
                        这些动完约 {debtKcal} 卡，够抵今天多的 {over} 卡。
                      </span>
                    ) : (
                      <span className="text-[#b23c2c]">
                        这些动完约 {debtKcal} 卡，还差 {over - debtKcal} 卡 ——
                        加一点量，或者再挑一项。
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
                <p className="text-[12px] text-ink-300">说一句也行</p>
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
              {/* 这里原来有一句"明天这几项，打开就在这一页上" ——
                  卡片标题已经写了"明天"，这句只是把标题又说了一遍（H21）。
                  排好的项目本来就看得见，不用解释。 */}

              {over > 0 && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                  今天多 {over} 卡，这点差额在估算误差里，不用专门动一次。
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
                            <span className="text-ink-500">
                              {item.amount
                                ? amountText(item.kind, item.amount)
                                : `${a.minutes} 分钟`}
                            </span>
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
                  {planOpen ? "收起" : "添加"}
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
                    options={(planMore ? EXERCISES : quick)
                      .filter((d) => !planned.some((p) => keyOf(p) === d.kind))
                      .map((d) => ({
                        kind: d.kind,
                        label: d.label,
                        icon: d.icon as IconName,
                      }))}
                    weightKg={weightKg}
                    onPlan={(kind, minutes, amount) =>
                      togglePlan({
                        kind,
                        minutes,
                        ...(amount ? { amount } : {}),
                      })
                    }
                    footer={
                      !planMore && rest.length > 0 ? (
                        <button
                          onClick={() => setPlanMore(true)}
                          className="h-9 rounded-lg px-2 text-[13px] font-medium text-brand-600"
                        >
                          更多
                        </button>
                      ) : null
                    }
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
  footer,
}: {
  options: { kind: ExerciseKind; label: string; icon: IconName }[];
  weightKg: number;
  /** 记今天：量要一起交上去 */
  onCommit?: (kind: ExerciseKind, minutes: number, amount?: number) => void;
  /** 定明天：量和分钟一起给，计划里才存得下"跑 5 公里" */
  onPlan?: (kind: ExerciseKind, minutes: number, amount?: number) => void;
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
    // 两边（记今天 / 定明天）用同一个默认值：这一项自己的常规量
    const def = exerciseDef(kind).defaultMin;
    setAmount(m.unit === "min" ? def : amountFromMinutes(kind, def));
  }

  function commit() {
    if (!picked) return;
    const a = metric!.unit === "min" ? undefined : amount;
    if (onCommit) onCommit(picked, minutes, a);
    if (onPlan) onPlan(picked, minutes, a);
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
  footer,
}: {
  options: { kind: ExerciseKind; label: string; icon: IconName }[];
  selected: ExerciseKind[];
  onToggle: (kind: ExerciseKind) => void;
  /** 「更多 / 收起」这类跟在格子末尾的按钮 */
  footer?: React.ReactNode;
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
      {footer}
    </div>
  );
}
