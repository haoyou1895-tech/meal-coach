import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import BottomNav from "../../components/BottomNav";
import MoveView from "../../components/MoveView";
import { setExplainShow } from "../../components/Explain";
import { avgBurnEndingOn, shiftDate } from "../../lib/exercise";
import { buildPlan, sumMeals, todayStr } from "../../lib/nutrition";
import {
  dateList,
  exercisesOfDate,
  latestWeightKg,
  loadState,
  planOfDate,
  saveState,
  setExerciseAmount,
  withExercise,
  withPlanItems,
  withoutExercise,
  type AppState,
} from "../../lib/store";
import type { ExerciseKind, ExercisePlan } from "../../lib/types";
import "./index.scss";

/**
 * 运动页。壳只做三件事：读本地数据、把数算好、把回调接上。
 * 页面本身照网页版 MoveView.tsx 搬（那份是唯一源，改逻辑先改那边）。
 *
 * 网页版的这些计算在 app/page.tsx 里，小程序没有那一层壳，
 * 所以搬过来 —— 公式一个字都没改，改的是位置。
 */

function uid(): string {
  return `e${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export default function MovePage() {
  const [state, setState] = useState<AppState | null>(null);

  useDidShow(() => {
    const s = loadState();
    if (!s.profile || !s.onboarded) {
      Taro.redirectTo({ url: "/pages/setup/index" });
      return;
    }
    setExplainShow(!!s.hints);
    setState(s);
  });

  const update = (next: AppState) => {
    setState(next);
    saveState(next);
  };

  const today = todayStr();
  const profile = state?.profile ?? null;

  /** 预算按"最近一次称的体重"算：人瘦了消耗降，还按老体重给额度就是越吃越超 */
  const currentWeightKg = useMemo(
    () => (state && profile ? latestWeightKg(state.weights, profile.weightKg) : 0),
    [state, profile],
  );

  /** 今天的预算吃的是「截至昨天」的 7 天均值，不是今天的实际运动（H5） */
  const plan = useMemo(() => {
    if (!profile || !state) return null;
    const yesterday = dateList(2)[1];
    const extra = avgBurnEndingOn(state.exercises, yesterday, currentWeightKg);
    return buildPlan({ ...profile, weightKg: currentWeightKg }, extra);
  }, [profile, state, currentWeightKg]);

  /** 明天的预算用「截至今天」的均值 —— 今天动的，明天才算数 */
  const tomorrowBudget = useMemo(() => {
    if (!profile || !state) return 0;
    const extra = avgBurnEndingOn(state.exercises, today, currentWeightKg);
    return buildPlan({ ...profile, weightKg: currentWeightKg }, extra)
      .dailyBudgetKcal;
  }, [profile, state, today, currentWeightKg]);

  if (!state || !profile || !plan) return <View className="page" />;

  const dayExercises = exercisesOfDate(state, today);
  const tomorrow = shiftDate(today, 1);
  const planTomorrow = planOfDate(state, tomorrow);
  const planToday = planOfDate(state, today);
  const dayKcal = sumMeals(state.meals.filter((m) => m.date === today)).kcal;

  return (
    <View className="page mv-page">
      <MoveView
        profile={profile}
        plan={plan}
        weightKg={currentWeightKg}
        exercises={dayExercises}
        allExercises={state.exercises}
        planToday={planToday}
        planTomorrow={planTomorrow}
        tomorrow={tomorrow}
        tomorrowBudget={tomorrowBudget}
        over={Math.round(dayKcal - plan.dailyBudgetKcal)}
        onAddExercises={(items) =>
          update(
            items.reduce(
              (s, it) =>
                withExercise(s, {
                  id: uid(),
                  date: today,
                  kind: it.kind as ExerciseKind,
                  minutes: it.minutes,
                  ...(it.amount ? { amount: it.amount } : {}),
                  ...(it.label ? { label: it.label } : {}),
                }),
              state,
            ),
          )
        }
        onRemoveExercise={(id) => update(withoutExercise(state, id))}
        onAmount={(id, amount, minutes) =>
          update(setExerciseAmount(state, id, amount, minutes))
        }
        onPlanItems={(date, items) => update(withPlanItems(state, date, items))}
        onPlanMany={(days: { date: string; items: ExercisePlan["items"] }[]) =>
          update(
            days.reduce((s, d) => withPlanItems(s, d.date, d.items), state),
          )
        }
      />

      <BottomNav
        active="move"
        showCapture={false}
        onCapture={() => {
          /* 运动页没有"拍一张" */
        }}
      />
    </View>
  );
}
