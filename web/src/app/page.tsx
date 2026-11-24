"use client";

import { useEffect, useMemo, useState } from "react";
import CameraSheet from "@/components/CameraSheet";
import DaySheet, { DaySummaryBar } from "@/components/DaySummary";
import { ExplainProvider } from "@/components/Explain";
import HomeView from "@/components/HomeView";
import MoveView from "@/components/MoveView";
import Onboarding from "@/components/Onboarding";
import RecordView from "@/components/RecordView";
import Splash from "@/components/Splash";
import { Sheet } from "@/components/ui";
import { avgBurnEndingOn, nameOf, shiftDate } from "@/lib/exercise";
import { DISEASE_LABEL, buildPlan, sumMeals, todayStr } from "@/lib/nutrition";
import {
  closedOf,
  dateList,
  exercisesOfDate,
  isClosed,
  latestWeightKg,
  loadState,
  migratePhotos,
  normalizePlan,
  openDay,
  planOfDate,
  resetState,
  saveState,
  setExerciseAmount,
  updateMeal,
  upsertMeal,
  withDayClose,
  withExercise,
  withPlanItems,
  withWeight,
  withoutExercise,
  withoutMeal,
  type AppState,
} from "@/lib/store";
import { clearPhotos, deletePhoto } from "@/lib/photos";
import type { ExercisePlan, Meal, Profile } from "@/lib/types";

type Tab = "eat" | "move" | "ledger";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

/** 首页那一行小字：一项写「快走 30 分钟」，几项用顿号连起来 */
function planLabelOf(p: ExercisePlan | null): string | null {
  if (!p || !p.items.length) return null;
  return p.items.map((i) => `${nameOf(i)} ${i.minutes} 分钟`).join("、");
}

export default function Page() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("eat");
  /** 「记一餐」里点「改」时，把要改的那条传过去 */
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [redoSetup, setRedoSetup] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  /** 搬家面板：导出 / 导入 */
  const [dataPanel, setDataPanel] = useState<null | "export" | "import">(null);
  const [dump, setDump] = useState("");
  const [notice, setNotice] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    // 老版本把照片塞在 localStorage 里，搬到 IndexedDB 后再清掉
    migratePhotos(loaded).then((next) => {
      if (next !== loaded) {
        setState(next);
        saveState(next);
      }
    });
  }, []);

  const update = (next: AppState) => {
    setState(next);
    saveState(next);
  };

  const today = todayStr();
  const profile = state?.profile ?? null;

  /**
   * 预算按"最近一次称的体重"算，不是注册那天填的数。
   * 他掉到 74 公斤之后，基础代谢比 78 公斤时低，
   * 还按老体重给 1719，等于每天多吃了一百多大卡 —— 然后他会觉得"怎么减不动了"。
   */
  const currentWeightKg = useMemo(
    () => (state && profile ? latestWeightKg(state.weights, profile.weightKg) : profile?.weightKg ?? 0),
    [state, profile],
  );

  /**
   * 今天的预算吃的是「截至昨天」的 7 天运动均值，不是今天的实际运动。
   *
   * 这一条是刻意的：今晚跑了 40 分钟，今晚的额度不该立刻涨。
   * 一涨，运动就变成了换饭吃的筹码，而这个回路一旦建立，
   * 他会开始为了多吃去运动 —— 那刚好和减重的目标反着走。
   */
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

  const dayExercises = useMemo(
    () => (state ? exercisesOfDate(state, today) : []),
    [state, today],
  );

  const closed = state ? isClosed(state, today) : false;
  const closedInfo = state ? closedOf(state, today) : null;
  const tomorrow = shiftDate(today, 1);
  const planTomorrow = state ? planOfDate(state, tomorrow) : null;
  /** 昨天定给今天的那个计划 */
  const planToday = state ? planOfDate(state, today) : null;

  const todayMeals = useMemo(
    () => (state ? state.meals.filter((m) => m.date === today) : []),
    [state, today],
  );

  const dayKcal = useMemo(() => sumMeals(todayMeals).kcal, [todayMeals]);

  // 首屏：等待读取本地数据
  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-500" />
      </div>
    );
  }

  // 开屏：一次 1.4 秒，带一句当天固定的话
  if (!splashDone) {
    return <Splash onDone={() => setSplashDone(true)} />;
  }

  // 首次使用：引导
  if (!profile || !state.onboarded || redoSetup) {
    return (
      <Onboarding
        onDone={(p: Profile) => {
          update({ ...state, profile: p, onboarded: true });
          setRedoSetup(false);
          setTab("eat");
        }}
        onBack={
          redoSetup
            ? () => {
                setRedoSetup(false);
              }
            : undefined
        }
      />
    );
  }

  return (
    <ExplainProvider show={!!state.hints}>
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      {tab === "eat" ? (
        <HomeView
          profile={profile}
          plan={plan!}
          meals={state.meals}
          closed={closed}
          kcalToday={dayKcal}
          planTomorrowLabel={planLabelOf(planTomorrow)}
          onOpenSummary={() => setSummaryOpen(true)}
          currentWeightKg={currentWeightKg}
          onGoalWeeks={(weeks) =>
            update({
              ...state,
              profile: { ...profile, goalWeeks: weeks },
            })
          }
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCamera={() => setCameraOpen(true)}
        />
      ) : tab === "move" ? (
        <MoveView
          profile={profile}
          plan={plan!}
          weightKg={currentWeightKg}
          exercises={dayExercises}
          allExercises={state.exercises}
          planToday={planToday}
          planTomorrow={planTomorrow}
          tomorrow={tomorrow}
          tomorrowBudget={tomorrowBudget}
          over={Math.round(dayKcal - plan!.dailyBudgetKcal)}
          onAddExercises={(items) =>
            update(
              items.reduce(
                (s, it) =>
                  withExercise(s, {
                    id: uid(),
                    date: today,
                    kind: it.kind,
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
          onPlanMany={(days) => {
            // 一定在本地连着算完再落盘：逐次 update 会拿同一份旧 state，
            // 三天只剩一天。这类 bug 不报错，只是悄悄骗人。
            let next = state;
            for (const d of days) next = withPlanItems(next, d.date, d.items);
            update(next);
          }}
        />
      ) : (
        <RecordView
          profile={profile}
          plan={plan!}
          meals={state.meals}
          weights={state.weights}
          exercises={state.exercises}
          onWeight={(kg) =>
            update(withWeight(state, { date: today, weightKg: kg }))
          }
          onDeleteMeal={(id) => {
            // 照片在 IndexedDB 里，删记录时一起清掉，别留垃圾
            const target = state.meals.find((m) => m.id === id);
            if (target?.photoId) void deletePhoto(target.photoId);
            update(withoutMeal(state, id));
          }}
          onUpdateMeal={(m) => update(updateMeal(state, m))}
          autoEditId={pendingEditId}
          onAutoEditDone={() => setPendingEditId(null)}
        />
      )}

      {/* 底部操作区 */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-lg bg-gradient-to-t from-[#f4f6f4] via-[#f4f6f4] to-transparent px-5 pb-1 pt-6">
          {tab === "eat" && (
            <button
              onClick={() => setCameraOpen(true)}
              className={
                closed
                  ? // 已经收工，按钮不再是"快来记"的绿块，改成一条低调的补记入口。
                    // 不是不让他记，是不催他 —— 这个区别决定收工有没有意义。
                    "mb-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#d9ded9] bg-white/70 text-[15px] font-medium text-ink-500 transition active:scale-[0.98]"
                  : "mb-2.5 flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 text-[20px] font-bold text-white shadow-[0_8px_24px_rgba(31,138,91,0.35)] transition active:scale-[0.98] active:bg-brand-600"
              }
            >
              <svg
                width={closed ? 18 : 24}
                height={closed ? 18 : 24}
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M3 8.5A2.5 2.5 0 015.5 6h1.2a2 2 0 001.7-1l.4-.7a1 1 0 01.9-.5h5.6a1 1 0 01.9.5l.4.7a2 2 0 001.7 1h1.2A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-9z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle
                  cx="12"
                  cy="12.8"
                  r="3.4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              记一餐
            </button>
          )}

          <nav className="flex gap-2">
            <TabButton
              active={tab === "eat"}
              onClick={() => setTab("eat")}
              label="吃"
              icon={
                <path
                  d="M3.5 11h17a8.5 8.5 0 01-8.5 8.5A8.5 8.5 0 013.5 11zM8.5 7.5c0-1 1-1.6 1-2.5M12.5 7.5c0-1 1-1.6 1-2.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              }
            />
            <TabButton
              active={tab === "move"}
              onClick={() => setTab("move")}
              label="动"
              icon={
                <path
                  d="M13.6 5.4a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4zM7 21l3-6 3 2v4M10 15l-2-5 4-2 3 3h4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              }
            />
            <TabButton
              active={tab === "ledger"}
              onClick={() => setTab("ledger")}
              label="账"
              icon={
                <path
                  d="M6 3.5v3M18 3.5v3M4 9h16M5 5.5h14a1 1 0 011 1V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19V6.5a1 1 0 011-1z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              }
            />
          </nav>
        </div>
        <div className="safe-bottom bg-[#f4f6f4]" />
      </div>

      <DaySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        plan={plan!}
        meals={todayMeals}
        closed={closed}
        closedAtLabel={
          closedInfo
            ? new Date(closedInfo.closedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null
        }
        onCloseDay={() => update(withDayClose(state, today, dayKcal))}
        onReopenDay={() => update(openDay(state, today))}
      />

      <CameraSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        profile={profile}
        plan={plan!}
        dayKcalBefore={dayKcal}
        todayMeals={todayMeals}
        onSave={(m: Meal) =>
          // 已经收工又补记一顿，收工状态自动解除 ——
          // 否则记录里多了一顿、界面上还写着"今天已收工"，自己打自己的脸
          update(openDay(upsertMeal(state, m), m.date))
        }
        onEditMeal={(id) => {
          setCameraOpen(false);
          setPendingEditId(id);
          setTab("ledger");
        }}
      />

      <Sheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setDataPanel(null);
          setNotice("");
        }}
        title="设置"
      >
        <div className="space-y-3 pb-4">
          <div className="card space-y-3 p-4!">
            <InfoRow label="每日预算" value={`${plan!.dailyBudgetKcal} 大卡`} />
            <InfoRow label="基础代谢" value={`${plan!.bmr} 大卡`} />
            <InfoRow
              label="当前体重"
              value={`${latestWeightKg(state.weights, profile.weightKg)} 公斤`}
            />
            <InfoRow label="目标体重" value={`${profile.targetWeightKg} 公斤`} />
            <InfoRow
              label="健康状况"
              value={
                profile.diseases.length
                  ? profile.diseases.map((d) => DISEASE_LABEL[d]).join("、")
                  : "未填写"
              }
            />
          </div>

          {/*
            默认关。这个开关存在的意义不是"给爱看解释的人留个口子"，
            是让默认界面能干净到可以单手用完 —— 说明都收在这里，
            他想看的时候自己来开。
          */}
          <button
            className="card flex w-full items-center justify-between p-4! text-left"
            onClick={() => update({ ...state, hints: !state.hints })}
          >
            <span className="text-[15px]">显示说明文字</span>
            <span
              className={`flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition ${
                state.hints ? "bg-brand-500" : "bg-black/[0.12]"
              }`}
            >
              <span
                className={`h-6 w-6 rounded-full bg-white shadow-sm transition ${
                  state.hints ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          <button
            className="btn-ghost"
            onClick={() => {
              setSettingsOpen(false);
              setRedoSetup(true);
            }}
          >
            重新设置身高体重
          </button>

          {/*
            换手机、清缓存、换浏览器 —— 本地数据会全没，而且用户不知道为什么。
            照片在 IndexedDB 里搬不走，文字和数字能搬，这点必须说清楚，
            不能让人以为"备份过了照片就还在"。
          */}
          <div className="card space-y-3 p-4!">
            <div className="flex items-baseline justify-between">
              <span className="text-[16px] font-medium">搬家</span>
              <span className="text-[13px] text-ink-300">换手机用这个</span>
            </div>
            <div className="flex gap-2">
              <button
                className="h-11 flex-1 rounded-xl bg-black/[0.05] text-[15px] font-medium text-brand-600 active:scale-[0.98]"
                onClick={() => {
                  setDump(JSON.stringify(state));
                  setDataPanel("export");
                }}
              >
                备份
              </button>
              <button
                className="h-11 flex-1 rounded-xl bg-black/[0.05] text-[15px] font-medium text-brand-600 active:scale-[0.98]"
                onClick={() => {
                  setDump("");
                  setDataPanel("import");
                }}
              >
                导入
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-300">
              只带记录和体重，照片带不走。换手机后照片会没有，数字都在。
            </p>
          </div>

          {dataPanel && (
            <div className="card space-y-3 p-4!">
              <p className="text-[15px] font-medium">
                {dataPanel === "export"
                  ? "全选复制，存到微信收藏或备忘录里"
                  : "把之前存下的那串码粘进下面"}
              </p>
              <textarea
                value={dump}
                onChange={(e) => setDump(e.target.value)}
                readOnly={dataPanel === "export"}
                rows={5}
                className="w-full resize-none rounded-xl bg-black/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-ink-700 focus:outline-none"
              />
              <div className="flex gap-2">
                {dataPanel === "export" ? (
                  <button
                    className="h-11 flex-1 rounded-xl bg-brand-500 text-[15px] font-medium text-white active:scale-[0.98]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(dump);
                        setNotice("复制好了");
                      } catch {
                        setNotice("复制不了，长按上面的文字全选");
                      }
                    }}
                  >
                    复制
                  </button>
                ) : (
                  <button
                    className="h-11 flex-1 rounded-xl bg-brand-500 text-[15px] font-medium text-white active:scale-[0.98]"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(dump) as AppState;
                        if (!parsed || !Array.isArray(parsed.meals)) {
                          throw new Error("bad");
                        }
                        resetState();
                        void clearPhotos();
                        // 用 loadState 那套归一化，别在这里手抄字段 ——
                        // 每加一个新字段就要改一次，漏了就是静默丢数据
                        update({
                          ...parsed,
                          profile: parsed.profile ?? null,
                          meals: parsed.meals,
                          weights: Array.isArray(parsed.weights)
                            ? parsed.weights
                            : [],
                          activities: Array.isArray(parsed.activities)
                            ? parsed.activities
                            : [],
                          exercises: Array.isArray(parsed.exercises)
                            ? parsed.exercises
                            : [],
                          closedDays: Array.isArray(parsed.closedDays)
                            ? parsed.closedDays
                            : [],
                          exercisePlans: Array.isArray(parsed.exercisePlans)
                            ? parsed.exercisePlans
                                .map(normalizePlan)
                                .filter((p): p is ExercisePlan => !!p)
                            : [],
                          onboarded: !!parsed.onboarded,
                        });
                        setDataPanel(null);
                        setNotice("恢复好了");
                      } catch {
                        setNotice("这串码不对，检查一下有没有复制全");
                      }
                    }}
                  >
                    恢复
                  </button>
                )}
                <button
                  className="h-11 flex-1 rounded-xl bg-black/[0.05] text-[15px] font-medium text-ink-500 active:scale-[0.98]"
                  onClick={() => setDataPanel(null)}
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {notice && (
            <p className="text-center text-[14px] font-medium text-brand-600">
              {notice}
            </p>
          )}

          <button
            className="btn-ghost text-danger-500!"
            onClick={() => {
              if (confirm("清空所有记录？这个操作不能撤销。")) {
                resetState();
                void clearPhotos();
                setState(loadState());
                setSettingsOpen(false);
                setTab("eat");
              }
            }}
          >
            清空所有记录
          </button>

          <p className="pt-2 text-center text-[12px] leading-relaxed text-ink-300">
            餐谋 v0.1 · 数据只存在这台手机上
            <br />
            本产品不构成医疗建议，如有疾病请遵医嘱
          </p>
        </div>
      </Sheet>
    </div>
    </ExplainProvider>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold transition ${
        active ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        {icon}
      </svg>
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-[15px] text-ink-500">{label}</span>
      <span className="text-right text-[16px] font-medium">{value}</span>
    </div>
  );
}
