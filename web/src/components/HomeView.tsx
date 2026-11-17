"use client";

import { useEffect, useMemo, useState } from "react";
import type { Meal, NutritionPlan, Profile } from "@/lib/types";
import {
  mealTypeLabel,
  round,
  sumMeals,
  todayStr,
} from "@/lib/nutrition";
import { dayStatusText, ruleComment } from "@/lib/comment";
import { macroWarnings, mealReminder, nextMealAdvice } from "@/lib/advice";
import { CalorieRing, MacroBar } from "./ui";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 按疾病给一条当日提醒，比"注意控制"有用 */
function diseaseTip(profile: Profile): string | null {
  const d = profile.diseases;
  if (d.includes("hypertension")) return "盐别超过 5 克，腌菜、酱油、汤都要算进去";
  if (d.includes("diabetes")) return "主食分三顿吃，别集中在一顿，先吃菜再吃饭";
  if (d.includes("fattyLiver")) return "少油炸、少甜饮料，晚饭别吃到撑";
  if (d.includes("hyperlipidemia")) return "肥肉和内脏少吃，炒菜改成蒸煮";
  if (d.includes("gout")) return "内脏、浓汤别碰，肉适量，多喝水";
  if (d.includes("stomach")) return "别空腹，少吃辣和凉，细嚼慢咽";
  return null;
}

export default function HomeView({
  profile,
  plan,
  meals,
  onOpenSettings,
}: {
  profile: Profile;
  plan: NutritionPlan;
  meals: Meal[];
  onOpenSettings: () => void;
}) {
  const today = todayStr();
  const todayMeals = meals.filter((m) => m.date === today);
  const totals = sumMeals(todayMeals);
  const status = dayStatusText(totals.kcal, plan.dailyBudgetKcal);

  // 时间相关的提示只在客户端算，否则服务端渲染和浏览器会对不上
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const left = plan.dailyBudgetKcal - totals.kcal;
  const sodiumPct = Math.min(100, (totals.sodium / plan.sodiumLimitMg) * 100);
  const sodiumOver = totals.sodium > plan.sodiumLimitMg;
  const advice = now
    ? nextMealAdvice(left, plan.dailyBudgetKcal, profile, now)
    : null;
  const warnings = now ? macroWarnings(totals, plan, profile, now) : [];
  const reminder = now
    ? mealReminder(todayMeals, profile.mealRegular, now)
    : null;
  const tip = diseaseTip(profile);
  const hasHypertension = profile.diseases.includes("hypertension");
  const weekdayLabel = WEEKDAYS[new Date().getDay()];
  const sorted = [...todayMeals].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  /**
   * 点评按当前规则重算，不读存下来的旧字符串。
   * 否则规则一改，老记录还在说旧话术，看起来像没改。
   * 累计顺序按吃得先后算，因为"这顿之前已经吃了多少"会影响判断。
   */
  const liveComments = useMemo(() => {
    const map = new Map<string, string>();
    const asc = [...todayMeals].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    );
    let before = 0;
    for (const m of asc) {
      map.set(m.id, ruleComment(m.nutrition, profile, plan, before, m.mealType));
      before += m.nutrition.kcal;
    }
    return map;
  }, [todayMeals, profile, plan]);

  return (
    <div className="pb-52">
      <header className="safe-top flex items-center justify-between px-5 pb-3 pt-3">
        <div>
          <p className="text-[15px] font-medium text-ink-500">
            {greeting()}，{today.slice(5).replace("-", "月")}日{" "}
            {weekdayLabel}
          </p>
          <p className="mt-0.5 text-[19px] font-bold tracking-tight text-ink-700">
            {todayMeals.length === 0
              ? "今天还没开始记"
              : `今天已经记了 ${todayMeals.length} 顿`}
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink-500 shadow-sm"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 13.5a7.6 7.6 0 000-3l1.7-1.3-1.8-3.1-2 .8a7.5 7.5 0 00-2.6-1.5L14.3 3h-3.6l-.4 2.4a7.5 7.5 0 00-2.6 1.5l-2-.8-1.8 3.1 1.7 1.3a7.6 7.6 0 000 3l-1.7 1.3 1.8 3.1 2-.8a7.5 7.5 0 002.6 1.5l.4 2.4h3.6l.4-2.4a7.5 7.5 0 002.6-1.5l2 .8 1.8-3.1-1.7-1.3z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {reminder && (
        <div className="mx-5 mb-1 mt-3 rounded-2xl bg-[#fff4e5] px-4 py-3">
          <p className="text-[14px] font-medium leading-relaxed text-[#a9631a]">
            {reminder.text}
          </p>
        </div>
      )}

      <InstallHint />

      <div className="flex justify-center pt-2">
        <CalorieRing
          used={totals.kcal}
          budget={plan.dailyBudgetKcal}
          tone={status.tone}
        />
      </div>

      {advice && (
        <section className="mt-4 px-5">
          <div
            className="rounded-2xl px-4 py-4"
            style={{
              background:
                advice.tone === "over"
                  ? "#fdecea"
                  : advice.tone === "warn"
                    ? "#fff4e5"
                    : "#eaf5ef",
            }}
          >
            <p className="text-[13px] font-semibold text-ink-500">
              {advice.headline}
            </p>
            <p className="mt-1 text-[19px] font-bold leading-snug text-ink-700">
              {advice.detail}
            </p>
            {advice.caution && (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                {advice.caution}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 flex gap-4 px-6">
        <MacroBar
          label="蛋白"
          value={totals.protein}
          target={plan.proteinTargetG}
          unit="g"
          color="#4aa87a"
        />
        <MacroBar
          label="碳水"
          value={totals.carb}
          target={plan.carbTargetG}
          unit="g"
          color="#e8871e"
        />
        <MacroBar
          label="脂肪"
          value={totals.fat}
          target={plan.fatTargetG}
          unit="g"
          color="#c4694a"
        />
      </div>

      {warnings.length > 0 && (
        <section className="mt-4 space-y-2 px-5">
          {warnings.map((w) => (
            <div
              key={w.key}
              className="rounded-xl px-3.5 py-3"
              style={{ background: w.severe ? "#fdecea" : "#ffffff" }}
            >
              <p
                className="text-[14px] font-medium leading-relaxed"
                style={{ color: w.severe ? "#b23c2c" : "#33413b" }}
              >
                {w.text}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-6 px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">今天吃了</h2>
          {todayMeals.length > 0 && (
            <span className="text-[14px] text-ink-300">
              {todayMeals.length} 顿 · 共 {round(totals.kcal)} 大卡
            </span>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-300/50 py-7 text-center">
            <p className="text-[16px] font-medium text-ink-500">
              今天还没记
            </p>
            <p className="mt-1 text-[14px] text-ink-300">
              从下一顿开始，拍张照就行
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((m) => (
              <article key={m.id} className="card animate-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[12px] font-semibold text-brand-600">
                      {mealTypeLabel(m.mealType)}
                    </span>
                    <p className="mt-1.5 truncate text-[17px] font-medium">
                      {m.items.map((i) => i.name).join("、")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[24px] font-bold leading-none tabular-nums">
                      {m.nutrition.kcal}
                    </span>
                    <span className="ml-0.5 text-[12px] text-ink-300">大卡</span>
                  </div>
                </div>
                <p className="mt-2.5 border-t border-black/[0.05] pt-2.5 text-[15px] leading-relaxed text-ink-700">
                  {liveComments.get(m.id) ?? m.comment}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {todayMeals.length > 0 && (
        <>
          {/*
            钠以前只在"有高血压"时显示，结果别的人收到了"盐超了 750 mg"的提示，
            页面上却找不到盐的数字。现在不管什么病都显示。
          */}
          <section className="mt-4 px-5">
            <div className="rounded-2xl bg-white px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium text-ink-500">
                  钠（盐）· 每天别超过 {plan.sodiumLimitMg} mg
                </span>
                <span
                  className="shrink-0 text-[14px] font-semibold tabular-nums"
                  style={{ color: sodiumOver ? "#d94f3d" : undefined }}
                >
                  {Math.round(totals.sodium)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.07]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${sodiumPct}%`,
                    background: sodiumOver ? "#d94f3d" : "#e8a531",
                  }}
                />
              </div>
              {/* 高血压的提醒就是讲盐的，正好跟这条配套；其他病放下面单独一张卡 */}
              {tip && hasHypertension && (
                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-500">
                  {tip}
                </p>
              )}
            </div>
          </section>

          {tip && !hasHypertension && (
            <section className="mt-2 px-5">
              <div className="rounded-2xl bg-white px-4 py-3.5">
                <p className="text-[13px] font-medium text-ink-500">今天注意</p>
                <p className="mt-1 text-[16px] font-medium leading-snug text-warn-600">
                  {tip}
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 首次打开提示如何装到桌面（装好后自动消失） */
function InstallHint() {
  const [mode, setMode] = useState<null | "wechat" | "browser">(null);

  useEffect(() => {
    try {
      const ua = navigator.userAgent.toLowerCase();
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (standalone) return;
      if (localStorage.getItem("mealcoach.installHint") === "off") return;
      setMode(ua.includes("micromessenger") ? "wechat" : "browser");
    } catch {
      /* 忽略：隐私模式下 localStorage 可能不可用 */
    }
  }, []);

  if (!mode) return null;

  const close = () => {
    try {
      localStorage.setItem("mealcoach.installHint", "off");
    } catch {
      /* 忽略 */
    }
    setMode(null);
  };

  return (
    <div className="mx-5 mb-1 mt-3 flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-3">
      <p className="flex-1 text-[13px] leading-relaxed text-brand-700">
        {mode === "wechat"
          ? "微信里看不到桌面图标。点右上角 ··· → 在浏览器打开，再添加到桌面。"
          : "点浏览器菜单里的「添加到桌面」，以后点图标就能直接用。"}
      </p>
      <button
        onClick={close}
        className="shrink-0 rounded-lg px-2 py-0.5 text-[13px] font-medium text-brand-600/70 active:bg-brand-100"
      >
        知道了
      </button>
    </div>
  );
}
