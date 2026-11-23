"use client";

import { useMemo } from "react";
import Icon from "./Icon";
import { Sheet } from "./ui";
import { drinksLabel } from "@/lib/drinks";
import { SALT_LABEL, daySalt, saltGram, saltLevelOf } from "@/lib/mealTags";
import { mealTypeLabel, sumMeals } from "@/lib/nutrition";
import type { Meal, NutritionPlan } from "@/lib/types";

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * 今天的账 —— 只有"吃了多少"和"收工"。
 *
 * 原来这一个弹层里塞着三段：吃了多少 / 动了多少 / 明天怎么办。
 * 第八轮之后运动搬去了独立的「运动」页，这里就只剩吃。
 * 这不是砍功能，是把三件事分开摆：弹层里三段并排，等于三段都没讲清。
 *
 * 还有一条从来没动过的规矩：**这里永不出现「净摄入 = 吃了 − 动了」**（H5）。
 * 那个数字一出现，账就变成"我还能吃多少"，而不是"我今天吃了多少"。
 */
export default function DaySheet({
  open,
  onClose,
  plan,
  meals,
  closed,
  closedAtLabel,
  onCloseDay,
  onReopenDay,
}: {
  open: boolean;
  onClose: () => void;
  plan: NutritionPlan;
  /** 今天的记录 */
  meals: Meal[];
  closed: boolean;
  closedAtLabel: string | null;
  onCloseDay: () => void;
  onReopenDay: () => void;
}) {
  const totals = useMemo(() => sumMeals(meals), [meals]);
  const salt = useMemo(() => daySalt(meals), [meals]);

  const over = Math.round(totals.kcal - plan.dailyBudgetKcal);
  const left = Math.round(plan.dailyBudgetKcal - totals.kcal);
  const saltG = saltGram(salt.mg);

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

  const drinkText = drinksLabel(meals.flatMap((m) => m.drinks ?? []));

  return (
    <Sheet open={open} onClose={onClose} title={closed ? "今天已收工" : "今天的账"}>
      <div className="space-y-3 pb-4">
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
              盐 <b className="tabular-nums text-ink-700">{saltG}</b>/
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

        {/*
          超支了就把话说透：账超了多少，去哪儿补。
          这里只说"去运动页"，不在吃的弹层里排运动计划 ——
          在吃饭的地方谈跑步，两件事都谈不清。
        */}
        {over > 0 && !closed && (
          <div className="flex items-start gap-2 rounded-2xl bg-[#fdecea] px-3.5 py-3">
            <Icon name="alert" size={17} className="mt-0.5 shrink-0 text-[#b23c2c]" />
            <p className="text-[14px] leading-relaxed text-[#b23c2c]">
              超了 {over} 大卡。怎么补，去「运动」页挑几项，那边会算好每天动多久。
            </p>
          </div>
        )}

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
              继续记录
            </button>
            <button className="btn-ghost" onClick={onClose}>
              关闭
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
              收工
            </button>
            <button className="btn-ghost" onClick={onClose}>
              取消
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * 首页底部那一行入口。
 * 文案只留"今天的账"四个字：原来写"今天吃完了？算一笔"，
 * 那是把一句解释当按钮用。
 */
export function DaySummaryBar({
  closed,
  kcal,
  budget,
  planLabel,
  onClick,
}: {
  closed: boolean;
  kcal: number;
  budget: number;
  /** 给明天定下的计划，收工后才显示 */
  planLabel: string | null;
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
          {closed ? "已收工" : "今天的账"}
        </p>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-300">
          {closed
            ? planLabel
              ? `明天：${planLabel}`
              : "明天再说，今晚不用再想"
            : over
              ? `已经 ${kcal} 大卡，超了 ${kcal - budget}`
              : `还剩 ${Math.max(0, budget - kcal)} 大卡`}
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
