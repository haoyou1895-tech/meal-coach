import { Text, View } from "@tarojs/components";
import { useMemo, useState } from "react";
import Icon, { type IconName } from "./Icon";
import ExStepper from "./ExStepper";
import Explain from "./Explain";
import ExerciseSay from "./ExerciseSay";
import type { ParsedExercise } from "../lib/exerciseParse";
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
} from "../lib/exercise";
import { round } from "../lib/nutrition";
import type {
  ExerciseKind,
  ExerciseLog,
  ExercisePlan,
  NutritionPlan,
  PlannedExercise,
  Profile,
} from "../lib/types";
import "./MoveView.scss";

/**
 * 运动这一页。**照网页版 MoveView.tsx 逐段搬**，不是重新设计。
 *
 * 结构按网页版的 DOM 顺序，间距按网页版的数值（tw() 换算），
 * 文案一个字都没改 —— 两端说的话必须是同一句，否则舅舅在微信里看到的
 * 「补回来动什么」和网页上不是一回事。
 *
 * 网页版把这一页和"吃""账"分成三个 tab，小程序原来只有"今天/记录"两页，
 * 运动挤在首页的一行入口里。这一页搬过来之后，底部也变成三个 tab（ADR-021）。
 */

/** 计划项的身份证：同一种运动算同一项，"其他"按名字区分 */
function keyOf(x: { kind: ExerciseKind; label?: string }) {
  return x.kind === "other" ? `other:${x.label ?? ""}` : x.kind;
}

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
  /**
   * 录入区默认收起。
   *
   * 一屏里原来同时摆着：已记的运动（带 ± 和垃圾桶）、"说一句"输入框、
   * 一个麦克风、以及八个运动按钮 —— 光能点的东西就有二十来个，
   * 而他打开这一页通常只想看一眼今天动了多少。
   * 今天一条都没有的人仍然直接看到它，否则他会在空页面上找入口。
   */
  const [adding, setAdding] = useState(false);
  const showAdd = adding || exercises.length === 0;

  /* 明天的排期入口同样收起来 —— 它是铺垫，不该占着一整套输入控件 */
  const [planOpen, setPlanOpen] = useState(false);

  /* 明天那一排「更多」：先五个常用的，点开出全套（ADR-029） */
  const [planMore, setPlanMore] = useState(false);

  /**
   * 补账：选了哪几项、每项做多少、定了没有。
   * 量由他自己填（公里 / 个 / 分钟，按项目走），卡路里跟着算 ——
   * 上一版是算法按"每项 10 分钟"排的，超 13 大卡也能排出 277 大卡（ADR-028）。
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
   * 他真正要动的是"填多少"，不是看完整张清单。
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
    <View>
      {/* 顶部：网页版是 safe-top flex items-end justify-between px-5 pb-3 pt-3 */}
      <View className="mv-hd">
        <Text className="mv-h1">运动</Text>
        <Text className="mv-hd-sub">
          今天消耗 <Text className="mv-hd-num">{burn}</Text> 大卡
        </Text>
      </View>

      {/* ---------- 一、今天 ---------- */}
      <View className="sec">
        <View className="card card-tight">
          <View className="mv-rowline">
            <Text className="mv-title">今天动了多少</Text>
            {exercises.length > 0 && (
              <Text className="mv-title-sub">{exercises.length} 项</Text>
            )}
          </View>

          {exercises.length === 0 ? (
            <Text className="mv-empty">还没记</Text>
          ) : (
            <View className="mv-logs">
              {exercises.map((e) => (
                <ExerciseRow
                  key={e.id}
                  log={e}
                  weightKg={weightKg}
                  onAmount={onAmount}
                  onRemove={() => onRemoveExercise(e.id)}
                />
              ))}
            </View>
          )}

          {/* 说一句：口语也能记，时长没说的按默认给。收起时只留一行入口 */}
          <View className="mv-divider">
            <View
              className="mv-toggle"
              hoverClass="tap"
              hoverStayTime={60}
              onClick={() => setAdding((v) => !v)}
            >
              <View className="mv-toggle-left">
                <Icon
                  name={showAdd ? "close" : "plus"}
                  size={14}
                  color="#176f49"
                />
                <Text className="mv-toggle-text">{showAdd ? "收起" : "添加"}</Text>
              </View>
              {!showAdd && <Text className="mv-toggle-hint">说一句也行</Text>}
            </View>

            {showAdd && (
              <View>
                <View className="mv-say">
                  <ExerciseSay
                    actionLabel="确定"
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
                </View>

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
                      <View
                        className="mv-morebtn"
                        hoverClass="tap"
                        hoverStayTime={60}
                        onClick={() => setMore(true)}
                      >
                        <Text className="mv-morebtn-text">更多</Text>
                      </View>
                    ) : null
                  }
                />

                <Explain>
                  按体重 {round(weightKg, 1)} 公斤算，已经扣掉了这段时间本来就该消耗的那部分。
                </Explain>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ---------- 二、今天该做的（昨天定下的） ---------- */}
      {todo.length > 0 && (
        <View className="sec mt3">
          <View className="mv-todo">
            <View className="mv-rowline">
              <Text className="mv-todo-title">今天要做的</Text>
              <Text className="mv-todo-from">昨天定的</Text>
            </View>
            <View className="mv-todo-list">
              {todo.map((t) => {
                const done = doneKinds.has(keyOf(t));
                const def = exerciseDef(t.kind);
                return (
                  <View key={keyOf(t)} className="mv-todo-row">
                    <Icon
                      name={def.icon as IconName}
                      size={17}
                      color="#115639"
                    />
                    <Text className="mv-todo-name">
                      {nameOf(t)}{" "}
                      <Text className="mv-todo-unit">
                        {/* 定的是"跑 5 公里"就写 5 公里，别给他折成分钟 */}
                        {t.amount
                          ? amountText(t.kind, t.amount)
                          : `${t.minutes} 分钟`}
                      </Text>
                    </Text>
                    {done ? (
                      <View className="mv-done">
                        <Icon name="check" size={14} color="#176f49" />
                        <Text className="mv-done-text">已记</Text>
                      </View>
                    ) : (
                      <View
                        className="mv-ok"
                        hoverClass="tap"
                        hoverStayTime={60}
                        onClick={() =>
                          onAddExercises([
                            {
                              kind: t.kind,
                              minutes: t.minutes,
                              ...(t.amount ? { amount: t.amount } : {}),
                            },
                          ])
                        }
                      >
                        <Text className="mv-ok-text">确定</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* ---------- 三、明天 ---------- */}
      <View className="sec mt3">
        <View className="card card-tight">
          <View className="mv-rowline">
            <Text className="mv-title">明天</Text>
            <Text className="mv-title-sub">预算 {tomorrowBudget} 大卡</Text>
          </View>

          {/* 十几二十卡的账不排运动：最小的一次都顶出两三倍，比这笔账本身还大 */}
          {over >= MIN_DEBT_KCAL ? (
            <View>
              <View className="mv-over">
                <Text className="mv-over-num">{over}</Text>
                <Text className="mv-over-text">大卡，是今天多出来的</Text>
              </View>

              <Text className="mv-debt-title">补回来动什么，挑几项</Text>
              <Explain className="mv-debt-explain">
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
                    <View
                      className="mv-morebtn"
                      hoverClass="tap"
                      hoverStayTime={60}
                      onClick={() => setDebtMore(false)}
                    >
                      <Text className="mv-morebtn-text is-quiet">收起</Text>
                    </View>
                  ) : (
                    <View
                      className="mv-morebtn"
                      hoverClass="tap"
                      hoverStayTime={60}
                      onClick={() => setDebtMore(true)}
                    >
                      <Text className="mv-morebtn-text">更多</Text>
                    </View>
                  )
                }
              />

              {debtKinds.length > 0 && (
                <View className="mv-debt">
                  <View className="mv-debt-list">
                    {debtItems.map((it) => {
                      const m = metricOf(it.kind);
                      return (
                        <View key={it.kind} className="mv-debt-row">
                          <Icon
                            name={exerciseDef(it.kind).icon as IconName}
                            size={17}
                            color="#176f49"
                          />
                          <View className="mv-debt-mid">
                            <Text className="mv-debt-name">{nameOf(it)}</Text>
                            <Text className="mv-debt-sub">
                              {it.minutes} 分钟，约 {it.kcal} 卡
                            </Text>
                          </View>
                          <ExStepper
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
                          />
                        </View>
                      );
                    })}
                  </View>

                  <Text className="mv-debt-sum">
                    {debtKcal >= over ? (
                      <Text className="is-good">
                        这些动完约 {debtKcal} 卡，够抵今天多的 {over} 卡。
                      </Text>
                    ) : (
                      <Text className="is-over">
                        这些动完约 {debtKcal} 卡，还差 {over - debtKcal} 卡 ——
                        加一点量，或者再挑一项。
                      </Text>
                    )}
                  </Text>

                  {planned.length > 0 && (
                    <Explain className="mv-debt-note">
                      明天原本定了 {planned.map(nameOf).join("、")}，确定会换掉。
                    </Explain>
                  )}

                  <View className="mv-debt-actions">
                    <View
                      className="mv-commit"
                      hoverClass="tap"
                      hoverStayTime={60}
                      onClick={commitDebt}
                    >
                      <Text className="mv-commit-text">
                        {debtDone ? "重定" : "确定"}
                      </Text>
                    </View>
                    <View
                      className="mv-clear"
                      hoverClass="tap"
                      hoverStayTime={60}
                      onClick={clearDebt}
                    >
                      <Icon name="trash" size={17} color="#6b7671" />
                    </View>
                  </View>

                  {debtDone && (
                    <Text className="mv-debt-done">
                      定上了。明天打开这一页就能看见。
                    </Text>
                  )}
                </View>
              )}

              {/* 说一句也行：只说运动类型，时间由上面算 */}
              <View className="mv-say-debt">
                <Text className="mv-say-debt-hint">说一句也行</Text>
                <ExerciseSay
                  actionLabel="确定"
                  placeholder="游泳和快走"
                  onSubmit={(items) => {
                    const ks = items.map((p) => p.kind).filter((k) => k !== "other");
                    if (!ks.length) return;
                    setDebtKinds((prev) => [...new Set([...prev, ...ks])]);
                    setDebtDone(false);
                  }}
                />
              </View>
            </View>
          ) : (
            <View>
              {over > 0 && (
                <Text className="mv-small-debt">
                  今天多 {over} 卡，这点差额在估算误差里，不用专门动一次。
                </Text>
              )}

              <Explain>建议 {suggest.minutes} 分钟 —— {suggest.why}</Explain>

              {planned.length > 0 && (
                <View className="mv-planned">
                  {planned.map((item) => {
                    const a = adviceOf(item.kind, item.minutes, weightKg, profile);
                    return (
                      <View key={keyOf(item)} className="mv-plan-card">
                        <Icon
                          name={a.def.icon as IconName}
                          size={18}
                          color="#176f49"
                          style={{ marginTop: 4 }}
                        />
                        <View className="mv-plan-mid">
                          <Text className="mv-plan-name">
                            {nameOf(item)}{" "}
                            <Text className="mv-plan-amount">
                              {item.amount
                                ? amountText(item.kind, item.amount)
                                : `${a.minutes} 分钟`}
                            </Text>
                            <Text className="mv-plan-kcal"> 约 {a.kcal} 卡</Text>
                          </Text>
                        </View>
                        <View
                          className="mv-plan-del"
                          hoverClass="tap"
                          hoverStayTime={60}
                          onClick={() => togglePlan(item)}
                        >
                          <Icon name="trash" size={13} color="#6b7671" />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* 排明天的入口收起来：这一页的主线是"今天动了多少"，明天只是铺垫 */}
              <View
                className="mv-toggle mv-toggle-plan"
                hoverClass="tap"
                hoverStayTime={60}
                onClick={() => setPlanOpen((v) => !v)}
              >
                <View className="mv-toggle-left">
                  <Icon
                    name={planOpen ? "close" : "plus"}
                    size={14}
                    color="#176f49"
                  />
                  <Text className="mv-toggle-text">
                    {planOpen ? "收起" : "添加"}
                  </Text>
                </View>
                {!planOpen && <Text className="mv-toggle-hint">说一句也行</Text>}
              </View>

              {planOpen && (
                <View>
                  <View className="mv-say">
                    <ExerciseSay
                      actionLabel="确定"
                      placeholder="快走和游泳各半小时"
                      onSubmit={planFromInput}
                    />
                  </View>

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
                        <View
                          className="mv-morebtn"
                          hoverClass="tap"
                          hoverStayTime={60}
                          onClick={() => setPlanMore(true)}
                        >
                          <Text className="mv-morebtn-text">更多</Text>
                        </View>
                      ) : null
                    }
                  />
                </View>
              )}

              {planned.length > 1 && (
                <View
                  className="mv-plan-clear"
                  hoverClass="tap"
                  hoverStayTime={60}
                  onClick={() => onPlanItems(tomorrow, [])}
                >
                  <Icon name="trash" size={12} color="#6b7671" />
                  <Text className="mv-plan-clear-text">清空</Text>
                </View>
              )}
            </View>
          )}

          <Explain>
            明天的预算按你最近一周实际动的情况算：这周动得多，明天就宽松一点。
          </Explain>
        </View>
      </View>

      {/* ---------- 四、近 7 天 ---------- */}
      <View className="sec mt3">
        <View className="card card-tight">
          <View className="mv-rowline">
            <Text className="mv-title">近 7 天动的</Text>
            <Text className="mv-title-sub">共 {weekTotal} 大卡</Text>
          </View>
          <View className="mv-week">
            {week.map((d) => {
              const h =
                d.kcal === 0 ? 4 : Math.max(8, Math.round((d.kcal / weekMax) * 78));
              return (
                <View key={d.date} className="mv-week-col">
                  <Text className="mv-week-num">{d.kcal > 0 ? d.kcal : ""}</Text>
                  <View
                    className="mv-week-bar"
                    style={{
                      height: `${h}px`,
                      background: d.kcal === 0 ? "#e7eae8" : "#3f9d74",
                    }}
                  />
                  <Text className="mv-week-day">{d.date.slice(8)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View className="mv-foot">
        <Text className="mv-foot-text">
          消耗是估算，误差两成上下。
          {"\n"}它让明天的预算宽一点，不会让今天的饭多吃一口。
        </Text>
      </View>
    </View>
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
    <View className="mv-log">
      <Icon name={def.icon as IconName} size={16} color="#176f49" />
      {/* 名字和卡路里分两行：一行放不下，公里要占掉输入框小一半 */}
      <View className="mv-log-mid">
        <Text className="mv-log-name">{nameOf(log)}</Text>
        <Text className="mv-log-sub">
          {byAmount
            ? `${log.minutes} 分 · ${burnOfLog(log, weightKg)} 卡`
            : `${burnOfLog(log, weightKg)} 卡`}
        </Text>
      </View>

      <ExStepper
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
      />

      <View
        className="mv-log-del"
        hoverClass="tap"
        hoverStayTime={60}
        onClick={onRemove}
      >
        <Icon name="trash" size={13} color="#6b7671" />
      </View>
    </View>
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
  onCommit?: (kind: ExerciseKind, minutes: number, amount?: number) => void;
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
    <View>
      <View className="mv-chips">
        {options.map((o) => {
          const on = picked === o.kind;
          return (
            <View
              key={o.kind}
              className={`mv-chip ${on ? "is-on" : ""}`}
              hoverClass="tap"
              hoverStayTime={60}
              onClick={() => choose(o.kind)}
            >
              <Icon name={o.icon} size={15} color={on ? "#ffffff" : "#5b6660"} />
              <Text className={`mv-chip-text ${on ? "is-on" : ""}`}>{o.label}</Text>
            </View>
          );
        })}
        {footer}
      </View>

      {picked && metric && (
        <View className="mv-pick">
          <View className="mv-pick-row">
            <Text className="mv-pick-name">{pickedLabel}</Text>
            <ExStepper
              value={amount}
              onChange={setAmount}
              min={metric.min}
              max={metric.max}
              step={metric.step}
              unit={metric.suffix}
              decimal={metric.decimal}
            />
          </View>
          <View className="mv-pick-foot">
            <Text className="mv-pick-kcal">
              {metric.unit === "min"
                ? `${kcal} 卡`
                : `约 ${minutes} 分钟 · ${kcal} 卡`}
            </Text>
            <View
              className="mv-ok"
              hoverClass="tap"
              hoverStayTime={60}
              onClick={commit}
            >
              <Text className="mv-ok-text">确定</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * 多选一格的运动网格：只勾不填，量在下面按项填。
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
    <View className="mv-chips">
      {options.map((o) => {
        const on = selected.includes(o.kind);
        return (
          <View
            key={o.kind}
            className={`mv-chip ${on ? "is-on" : ""}`}
            hoverClass="tap"
            hoverStayTime={60}
            onClick={() => onToggle(o.kind)}
          >
            <Icon name={o.icon} size={15} color={on ? "#ffffff" : "#5b6660"} />
            <Text className={`mv-chip-text ${on ? "is-on" : ""}`}>{o.label}</Text>
          </View>
        );
      })}
      {footer}
    </View>
  );
}
