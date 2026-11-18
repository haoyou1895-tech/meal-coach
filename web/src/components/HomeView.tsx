"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ActivityLevel,
  Meal,
  MealType,
  NutritionPlan,
  Profile,
} from "@/lib/types";
import {
  mealTypeLabel,
  round,
  streakDays,
  sumMeals,
  todayStr,
} from "@/lib/nutrition";
import { dayStatusText, ruleVerdict, type Verdict } from "@/lib/comment";
import { macroWarnings, habitTimes, mealReminder, nextMealAdvice } from "@/lib/advice";
import {
  alcoholVerdict,
  dayDrinks,
  drinkAlcoholG,
  drinkKcal,
  drinksLabel,
} from "@/lib/drinks";
import {
  SALT_COLOR,
  SALT_LABEL,
  TAG_CFG,
  daySalt,
  saltLevelOf,
} from "@/lib/mealTags";
import Icon, { type IconName } from "./Icon";
import { CalorieRing, MacroBar } from "./ui";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 活动量不做精确记录，只让用户点一下三选一。
 * 记不清"走了多少步"，但一定知道"今天出没出汗"。
 */
const ACTIVITY_OPTIONS: { level: ActivityLevel; label: string; icon: IconName }[] =
  [
    { level: "low", label: "没动", icon: "sit" },
    { level: "normal", label: "走动", icon: "walk" },
    { level: "high", label: "锻炼", icon: "dumbbell" },
  ];

const SLOT_ICON: Record<MealType, IconName> = {
  breakfast: "sunrise",
  lunch: "sun",
  dinner: "moon",
  snack: "apple",
};

/**
 * 按疾病给一条当日提醒。
 * 这条以前是二十来个字的一句话，现在压到十个字以内 ——
 * 病人不需要被告知"为什么"，医生早就说过了；他需要被提醒"今天注意哪一件"。
 */
function diseaseTip(profile: Profile): { icon: IconName; text: string } | null {
  const d = profile.diseases;
  if (d.includes("hypertension"))
    return { icon: "salt", text: "少盐，腌菜酱油汤都算" };
  if (d.includes("diabetes"))
    return { icon: "carb", text: "主食分三顿，先菜后饭" };
  if (d.includes("fattyLiver"))
    return { icon: "fat", text: "少油炸少甜饮，晚饭别撑" };
  if (d.includes("hyperlipidemia"))
    return { icon: "fat", text: "肥肉内脏少吃，多蒸煮" };
  if (d.includes("gout")) return { icon: "protein", text: "内脏浓汤别碰，多喝水" };
  if (d.includes("stomach")) return { icon: "alert", text: "别空腹，少吃辣和凉" };
  return null;
}

const TONE_COLOR = { good: "#1f8a5b", warn: "#a9631a", over: "#b23c2c" };

export default function HomeView({
  profile,
  plan,
  meals,
  activity,
  onActivity,
  onOpenSettings,
}: {
  profile: Profile;
  plan: NutritionPlan;
  meals: Meal[];
  activity: ActivityLevel;
  onActivity: (level: ActivityLevel) => void;
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
  // 从历史记录里学这个人平时几点吃，用在提醒和"下一顿该吃哪顿"上
  const habit = useMemo(() => habitTimes(meals), [meals]);
  const advice = now
    ? nextMealAdvice(left, plan.dailyBudgetKcal, profile, now, habit)
    : null;
  const warnings = now ? macroWarnings(totals, plan, profile, now) : [];
  const reminder = now
    ? mealReminder(todayMeals, profile.mealRegular, now, habit)
    : null;
  const tipRaw = diseaseTip(profile);
  /**
   * 建议卡刚说过同一件事就不再重复。
   * 一天里"少放盐"说两遍，除了让页面更长，没有别的效果。
   */
  const tip =
    tipRaw && advice?.caution && advice.cautionIcon === tipRaw.icon
      ? null
      : tipRaw;
  const weekdayLabel = WEEKDAYS[new Date().getDay()];
  const sorted = [...todayMeals].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  const streak = streakDays(meals, today);

  const drinks = dayDrinks(todayMeals);
  const alcoholKcal = drinkKcal(drinks);
  const alcoholG = drinkAlcoholG(drinks);
  const alcoholNote = alcoholVerdict(alcoholG);

  const salt = daySalt(todayMeals);
  const saltLevel =
    salt.taggedCount > 0 ? saltLevelOf(salt.mg, salt.taggedCount) : null;

  /**
   * 点评按当前规则重算，不读存下来的旧字符串。
   * 否则规则一改，老记录还在说旧话术，看起来像没改。
   * 累计顺序按吃得先后算，因为"这顿之前已经吃了多少"会影响判断。
   * 酒也要计进去 —— 半斤白酒就是七百多大卡，漏了它整条判断都是错的。
   */
  const liveVerdicts = useMemo(() => {
    const map = new Map<string, Verdict>();
    const asc = [...todayMeals].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    );
    let before = 0;
    for (const m of asc) {
      map.set(
        m.id,
        ruleVerdict(
          m.nutrition,
          profile,
          plan,
          before,
          m.mealType,
          m.eatenAt ?? m.createdAt,
        ),
      );
      before += m.nutrition.kcal + drinkKcal(m.drinks);
    }
    return map;
  }, [todayMeals, profile, plan]);

  return (
    <div className="pb-52">
      <header className="safe-top flex items-start justify-between px-5 pb-2 pt-3">
        <div>
          <p className="text-[15px] font-medium text-ink-400">
            {weekdayLabel} · {today.slice(5).replace("-", "/")}
          </p>
          {streak >= 2 ? (
            <p className="mt-1 flex items-center gap-1 text-[14px] font-medium text-brand-600">
              <Icon name="fire" size={15} />
              连记 {streak} 天
            </p>
          ) : (
            <p className="mt-1 text-[14px] text-ink-300">
              {todayMeals.length === 0 ? "今天还没记" : `已记 ${todayMeals.length} 顿`}
            </p>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink-400 shadow-sm"
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
        <div className="mx-5 mb-1 mt-1 flex items-start gap-2 rounded-2xl bg-[#fff4e5] px-3.5 py-2.5">
          <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-[#a9631a]" />
          <p className="text-[15px] font-medium leading-relaxed text-[#a9631a]">
            {reminder.text}
          </p>
        </div>
      )}

      {/*
        第一眼就该看到"下一顿吃什么"。
        而且不能是一句话 —— 一句话要读，三个图标不用读。
        他坐在饭桌上，抬头看一眼就知道这顿该吃什么，这事的价值全在"不用读"。
      */}
      {advice && (
        <section className="mt-2 px-5">
          <div
            className="rounded-2xl px-3.5 py-3.5"
            style={{
              background:
                advice.tone === "over"
                  ? "#fdecea"
                  : advice.tone === "warn"
                    ? "#fff4e5"
                    : "#eaf5ef",
            }}
          >
            <div className="flex items-center gap-1.5">
              <Icon
                name={
                  advice.headline.startsWith("早饭")
                    ? "sunrise"
                    : advice.headline.startsWith("午饭")
                      ? "sun"
                      : "moon"
                }
                size={16}
                className="shrink-0 text-ink-500"
              />
              <p className="text-[15px] font-semibold text-ink-500">
                {advice.headline}
              </p>
            </div>

            <div className="mt-2.5 flex gap-2">
              {advice.parts.map((p) => (
                <div
                  key={p.kind}
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white/70 py-2.5"
                >
                  <Icon
                    name={
                      p.kind === "carb" ? "carb" : p.kind === "meat" ? "protein" : "veg"
                    }
                    size={23}
                    className="text-ink-600"
                  />
                  <span className="text-[15px] font-semibold leading-tight text-ink-700">
                    {p.label}
                  </span>
                </div>
              ))}
            </div>

            {advice.caution && (
              <div className="mt-2 flex items-center gap-1.5">
                <Icon
                  name={advice.cautionIcon ?? "alert"}
                  size={14}
                  className="shrink-0 text-ink-400"
                />
                <p className="text-[13px] leading-tight text-ink-400">
                  {advice.caution}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex justify-center pt-2">
        <CalorieRing
          used={totals.kcal}
          budget={plan.dailyBudgetKcal}
          tone={status.tone}
        />
      </div>

      {/* 三个营养成分用图标代替中文：蛋、碗、油滴，比"蛋白/碳水/脂肪"快 */}
      <div className="mt-1 flex gap-4 px-5">
        <MacroBar
          icon="protein"
          short="蛋"
          label="蛋白"
          value={totals.protein}
          target={plan.proteinTargetG}
          unit="g"
        />
        <MacroBar
          icon="carb"
          short="饭"
          label="碳水"
          value={totals.carb}
          target={plan.carbTargetG}
          unit="g"
        />
        <MacroBar
          icon="fat"
          short="油"
          label="脂肪"
          value={totals.fat}
          target={plan.fatTargetG}
          unit="g"
        />
      </div>

      {warnings.length > 0 && (
        <section className="mt-3 space-y-2 px-5">
          {warnings.map((w) => (
            <div
              key={w.key}
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
              style={{ background: w.severe ? "#fdecea" : "#ffffff" }}
            >
              <Icon
                name={w.icon}
                size={18}
                className={w.severe ? "shrink-0 text-[#b23c2c]" : "shrink-0 text-ink-400"}
              />
              <span
                className="text-[16px] font-semibold"
                style={{ color: w.severe ? "#b23c2c" : "#33413b" }}
              >
                {w.short}
              </span>
              <span className="text-[13px] text-ink-300">{w.tip}</span>
            </div>
          ))}
        </section>
      )}

      {drinks.length > 0 && (
        <section className="mt-3 px-5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3">
            <Icon name="alcohol" size={20} className="shrink-0 text-[#b23c2c]" />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium text-ink-700">
                {drinksLabel(drinks)}
              </p>
              <p className="text-[13px] text-ink-400">
                纯酒精 {alcoholG} 克
                {alcoholNote ? ` · ${alcoholNote}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[17px] font-semibold tabular-nums text-[#b23c2c]">
              {alcoholKcal}
            </span>
          </div>
        </section>
      )}

      <section className="mt-5 px-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold">今天吃了</h2>
          {todayMeals.length > 0 && (
            <span className="text-[14px] tabular-nums text-ink-300">
              {round(totals.kcal)} 大卡
            </span>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300/50 py-6">
            <Icon name="camera" size={26} className="text-ink-300" />
            <p className="mt-2 text-[15px] text-ink-300">拍一张就行</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sorted.map((m) => {
              const dk = drinkKcal(m.drinks);
              const v = liveVerdicts.get(m.id);
              const color = v ? TONE_COLOR[v.tone] : "#33413b";
              const at = new Date(m.eatenAt ?? m.createdAt);
              const time = Number.isNaN(at.getTime())
                ? ""
                : `${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
              return (
                <article key={m.id} className="card animate-pop">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-ink-400">
                        <Icon name={SLOT_ICON[m.mealType]} size={15} />
                        <span className="text-[13px] font-medium">
                          {mealTypeLabel(m.mealType)}
                        </span>
                        {time && (
                          <span className="text-[13px] tabular-nums">{time}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[18px] font-medium">
                        {m.items.map((i) => i.name).join("、")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[24px] font-bold leading-none tabular-nums">
                        {m.nutrition.kcal + dk}
                      </span>
                    </div>
                  </div>

                  {(dk > 0 || (m.tags && m.tags.length > 0)) && (
                    <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-400">
                      {dk > 0 && (
                        <span className="flex items-center gap-1 text-[#b23c2c]">
                          <Icon name="alcohol" size={13} />
                          {dk}
                        </span>
                      )}
                      {(m.tags ?? []).map((t) => (
                        <span key={t} className="flex items-center gap-0.5">
                          <Icon name={TAG_CFG[t].icon} size={13} />
                          {TAG_CFG[t].short}
                        </span>
                      ))}
                    </div>
                  )}

                  {v && (
                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-black/[0.05] pt-2.5">
                      <Icon
                        name={v.icon as IconName}
                        size={17}
                        className="shrink-0"
                      />
                      <span
                        className="text-[16px] font-semibold leading-none"
                        style={{ color }}
                      >
                        {v.short}
                      </span>
                      <span className="truncate text-[13px] text-ink-300">
                        {v.tip}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/*
        盐不报毫克，报档位。
        数字精度是假的：照片看不出放了几克盐，报"1240 mg"只会骗人。
        "偏咸"这个词不会错，而且他听得懂。
        两段解释性文字压成了一句 —— 不解释原理，只告诉他今天重不重。
      */}
      {todayMeals.length > 0 && (
        <section className="mt-3 px-5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3">
            <Icon
              name="salt"
              size={20}
              className="shrink-0"
              // 档位颜色直接染到图标上，比旁边的字更先被看见
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink-700">盐</p>
              <p className="text-[13px] leading-tight text-ink-400">
                {saltLevel
                  ? "按有汤、腌菜、外食估的"
                  : "勾一下来源就能算"}
              </p>
            </div>
            <span
              className="shrink-0 text-[17px] font-semibold"
              style={{ color: saltLevel ? SALT_COLOR[saltLevel] : "#a8b3ae" }}
            >
              {saltLevel ? SALT_LABEL[saltLevel] : "不知道"}
            </span>
          </div>
        </section>
      )}

      {tip && (
        <section className="mt-2 px-5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3">
            <Icon name={tip.icon} size={19} className="shrink-0 text-warn-600" />
            <p className="text-[15px] font-medium leading-snug text-warn-600">
              {tip.text}
            </p>
          </div>
        </section>
      )}

      <section className="mt-2 px-5">
        <div className="rounded-2xl bg-white px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-ink-400">
              <Icon name="walk" size={15} />
              今天动了多少
            </span>
            <span className="text-[13px] tabular-nums text-ink-300">
              额度 {plan.dailyBudgetKcal}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            {ACTIVITY_OPTIONS.map((o) => (
              <button
                key={o.level}
                type="button"
                onClick={() => onActivity(o.level)}
                className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-medium transition active:scale-[0.97] ${
                  activity === o.level
                    ? "bg-brand-500 text-white"
                    : "bg-black/[0.04] text-ink-700"
                }`}
              >
                <Icon name={o.icon} size={18} />
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <InstallHint />
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
    <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5">
      <p className="flex-1 text-[13px] leading-relaxed text-brand-700">
        {mode === "wechat"
          ? "点右上角 ··· → 浏览器打开，再添加到桌面"
          : "浏览器菜单里「添加到桌面」"}
      </p>
      <button
        onClick={close}
        className="shrink-0 rounded-lg px-2 py-0.5 text-[13px] font-medium text-brand-600/70 active:bg-brand-100"
      >
        知道
      </button>
    </div>
  );
}
