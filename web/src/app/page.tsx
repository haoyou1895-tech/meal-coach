"use client";

import { useEffect, useMemo, useState } from "react";
import CameraSheet from "@/components/CameraSheet";
import HomeView from "@/components/HomeView";
import Onboarding from "@/components/Onboarding";
import RecordView from "@/components/RecordView";
import Splash from "@/components/Splash";
import { Sheet } from "@/components/ui";
import { DISEASE_LABEL, buildPlan, sumMeals, todayStr } from "@/lib/nutrition";
import {
  activityOfDate,
  loadState,
  migratePhotos,
  resetState,
  saveState,
  updateMeal,
  upsertMeal,
  withWeight,
  withoutMeal,
  type AppState,
} from "@/lib/store";
import { clearPhotos, deletePhoto } from "@/lib/photos";
import type { Meal, Profile } from "@/lib/types";

type Tab = "home" | "record";

export default function Page() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [redoSetup, setRedoSetup] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

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

  const plan = useMemo(() => {
    if (!profile || !state) return null;
    return buildPlan(profile, activityOfDate(state, today));
  }, [profile, state, today]);

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
          setTab("home");
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
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      {tab === "home" ? (
        <HomeView
          profile={profile}
          plan={plan!}
          meals={state.meals}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <RecordView
          profile={profile}
          plan={plan!}
          meals={state.meals}
          weights={state.weights}
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
        />
      )}

      {/* 底部操作区 */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-lg bg-gradient-to-t from-[#f4f6f4] via-[#f4f6f4] to-transparent px-5 pb-1 pt-6">
          {tab === "home" && (
            <button
              onClick={() => setCameraOpen(true)}
              className="mb-2.5 flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 text-[20px] font-bold text-white shadow-[0_8px_24px_rgba(31,138,91,0.35)] transition active:scale-[0.98] active:bg-brand-600"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
              拍一张，记一餐
            </button>
          )}

          <nav className="flex gap-2">
            <TabButton
              active={tab === "home"}
              onClick={() => setTab("home")}
              label="今天"
              icon={
                <path
                  d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19v-8.5z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              }
            />
            <TabButton
              active={tab === "record"}
              onClick={() => setTab("record")}
              label="记录"
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

      <CameraSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        profile={profile}
        plan={plan!}
        dayKcalBefore={dayKcal}
        todayMeals={todayMeals}
        onSave={(m: Meal) => update(upsertMeal(state, m))}
      />

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="设置"
      >
        <div className="space-y-3 pb-4">
          <div className="card space-y-3 p-4!">
            <InfoRow label="每日预算" value={`${plan!.dailyBudgetKcal} 大卡`} />
            <InfoRow label="基础代谢" value={`${plan!.bmr} 大卡`} />
            <InfoRow
              label="当前体重"
              value={`${state.weights[0]?.weightKg ?? profile.weightKg} 公斤`}
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

          <button
            className="btn-ghost"
            onClick={() => {
              setSettingsOpen(false);
              setRedoSetup(true);
            }}
          >
            重新设置身高体重
          </button>

          <button
            className="btn-ghost text-danger-500!"
            onClick={() => {
              if (confirm("清空所有记录？这个操作不能撤销。")) {
                resetState();
                void clearPhotos();
                setState(loadState());
                setSettingsOpen(false);
                setTab("home");
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
