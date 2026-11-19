import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { habitTimes, macroWarnings, nextMealAdvice } from "../../lib/advice";
import { dayDrinks, drinkAlcoholG } from "../../lib/drinks";
import { SALT_COLOR, SALT_LABEL, daySalt, saltLevelOf } from "../../lib/mealTags";
import {
  buildPlan,
  mealTypeLabel,
  sumMeals,
  todayStr,
} from "../../lib/nutrition";
import {
  activityOfDate,
  latestWeightKg,
  loadState,
  type AppState,
} from "../../lib/store";
import "./index.scss";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** 圆环用内联 SVG 当背景图。小程序不支持 <svg> 标签，但支持 data URI 背景 */
function ringBg(ratio: number, color: string) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const on = Math.max(0, Math.min(1, ratio)) * c;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#e7eae8" stroke-width="9"/>` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="9" ` +
    `stroke-linecap="round" stroke-dasharray="${on.toFixed(2)} 999" transform="rotate(-90 50 50)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function HomePage() {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(new Date());

  useDidShow(() => {
    const s = loadState();
    if (!s.profile || !s.onboarded) {
      Taro.redirectTo({ url: "/pages/setup/index" });
      return;
    }
    setState(s);
    setNow(new Date());
  });

  const today = todayStr(now);

  const view = useMemo(() => {
    if (!state?.profile) return null;
    const profile = state.profile;
    // 预算跟着最近一次称的体重走：人瘦了消耗降，还按老体重给额度就会越吃越超
    const weightKg = latestWeightKg(state.weights, profile.weightKg);
    const activity = activityOfDate(state, today);
    const plan = buildPlan({ ...profile, weightKg }, activity);
    const meals = state.meals.filter((m) => m.date === today);
    const totals = sumMeals(meals);
    const left = plan.dailyBudgetKcal - totals.kcal;

    const warnings = macroWarnings(totals, plan, profile, now);
    const salt = daySalt(meals);
    const saltLevel = meals.length ? saltLevelOf(salt.mg, salt.taggedCount) : null;
    const alcoholG = drinkAlcoholG(dayDrinks(meals));

    const advice = nextMealAdvice(
      left,
      plan.dailyBudgetKcal,
      profile,
      now,
      habitTimes(state.meals),
      meals.map((m) => m.mealType),
    );

    const tone = left < 0 ? "over" : left < plan.dailyBudgetKcal * 0.2 ? "warn" : "good";
    const color = tone === "over" ? "#d94f3d" : tone === "warn" ? "#e8871e" : "#1f8a5b";

    return {
      profile,
      weightKg,
      plan,
      meals,
      totals,
      left,
      tone,
      color,
      warnings,
      saltLevel,
      alcoholG,
      advice,
      atGoal: weightKg <= profile.targetWeightKg + 0.2,
    };
  }, [state, today, now]);

  if (!view) {
    return <View className="page" />;
  }

  const { plan, totals, left, tone, color, warnings, saltLevel, alcoholG, advice } = view;

  return (
    <View className="page">
      <View className="head">
        <Text className="head-date">
          {now.getMonth() + 1} 月 {now.getDate()} 日 周{WEEK[now.getDay()]}
        </Text>
        <Text className="head-title">
          {tone === "over"
            ? `今天超了 ${Math.round(-left)} 大卡`
            : `今天还能吃 ${Math.round(Math.max(0, left))} 大卡`}
        </Text>
      </View>

      {/* 下一顿这样吃 —— 首页第一眼要看的是「该干什么」，不是「吃了多少」 */}
      {advice && (
        <View className={`card advice tone-${advice.tone}`}>
          <Text className="advice-headline">{advice.headline}</Text>
          <View className="parts">
            {advice.parts.map((p, i) => (
              <View key={i} className={`part part-${p.kind} ${p.dim ? "is-dim" : ""}`}>
                <Text className="part-label">{p.label}</Text>
              </View>
            ))}
          </View>
          <Text className="advice-detail">{advice.detail}</Text>
          {!!advice.caution && <Text className="advice-caution">{advice.caution}</Text>}
        </View>
      )}

      {/* 环 + 提醒 + 三条营养条，同一张白卡 */}
      <View className="card dash">
        <View className="dash-top">
          <View
            className="ring"
            style={{ backgroundImage: ringBg(totals.kcal / Math.max(1, plan.dailyBudgetKcal), color) }}
          >
            <Text className="ring-label">{tone === "over" ? "超出" : "还能吃"}</Text>
            <Text className="ring-num" style={{ color }}>
              {Math.abs(Math.round(tone === "over" ? totals.kcal - plan.dailyBudgetKcal : left))}
            </Text>
            <Text className="ring-sub">预算 {plan.dailyBudgetKcal}</Text>
          </View>

          <View className="notes">
            {warnings.map((w) => (
              <View key={w.key} className="note">
                <View
                  className="dot"
                  style={{ background: w.severe ? "#b23c2c" : "#a9631a" }}
                />
                <Text className="note-text" style={{ color: w.severe ? "#b23c2c" : "#33413b" }}>
                  {w.short}
                </Text>
                <Text className="note-tip">{w.tip}</Text>
              </View>
            ))}

            {saltLevel && (
              <View className="note">
                <View className="dot" style={{ background: SALT_COLOR[saltLevel] }} />
                <Text className="note-text">盐</Text>
                <Text className="note-tip" style={{ color: SALT_COLOR[saltLevel] }}>
                  {SALT_LABEL[saltLevel]}
                </Text>
              </View>
            )}

            {alcoholG > 25 && (
              <View className="note">
                <View className="dot" style={{ background: "#b23c2c" }} />
                <Text className="note-text" style={{ color: "#b23c2c" }}>
                  酒 {alcoholG} 克
                </Text>
                <Text className="note-tip">今天到此</Text>
              </View>
            )}

            {warnings.length === 0 && !saltLevel && alcoholG <= 25 && (
              <Text className="note-quiet">今天吃得稳，照这个来</Text>
            )}
          </View>
        </View>

        <View className="macros">
          <Macro label="蛋白质" value={totals.protein} target={plan.proteinTargetG} color="#a3563f" />
          <Macro label="碳水" value={totals.carb} target={plan.carbTargetG} color="#b0842c" />
          <Macro label="脂肪" value={totals.fat} target={plan.fatTargetG} color="#7d8b5e" />
        </View>
      </View>

      {/* 今天吃了什么 */}
      <View className="section">
        <Text className="section-title">今天吃了</Text>
        {view.meals.length === 0 ? (
          <View className="card empty">
            <Text className="empty-text">还没记。拍了照不用自己算，它会告诉你超没超。</Text>
          </View>
        ) : (
          view.meals.map((m) => (
            <View key={m.id} className="card meal">
              <View className="meal-left">
                <Text className="meal-type">
                  {mealTypeLabel(m.mealType)}
                </Text>
                <Text className="meal-items" numberOfLines={2}>
                  {m.items.map((i) => i.name).join("、")}
                </Text>
              </View>
              <Text className="meal-kcal">{Math.round(m.nutrition.kcal)}</Text>
            </View>
          ))
        )}
      </View>

      <View className="fab-space" />
      <View className="fab">
        <View
          className="fab-btn"
          onClick={() => Taro.navigateTo({ url: "/pages/capture/index" })}
        >
          <Text className="fab-text">拍一张，记一餐</Text>
        </View>
      </View>
    </View>
  );
}

function Macro({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const ratio = target > 0 ? value / target : 0;
  const over = ratio > 1.05;
  const near = !over && ratio >= 0.85;
  const barColor = over ? "#d94f3d" : near ? "#e0a83a" : "#8fae9c";
  return (
    <View className="macro">
      <Text className="macro-label" style={{ color }}>
        {label}
      </Text>
      <View className="macro-nums">
        <Text className="macro-value" style={{ color: over ? "#b23c2c" : "#3b4642" }}>
          {Math.round(value)}
        </Text>
        <Text className="macro-target">
          /{target}g
        </Text>
      </View>
      <View className="macro-track">
        <View
          className="macro-fill"
          style={{ width: `${Math.min(100, ratio * 100)}%`, background: barColor }}
        />
      </View>
    </View>
  );
}
