import { Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import BottomNav from "../../components/BottomNav";
import Icon from "../../components/Icon";
import WeightTrend from "../../components/WeightTrend";
import { drinkKcal, drinksLabel } from "../../lib/drinks";
import { dayBudget, mealTypeLabel, round, snackLabel, todayStr } from "../../lib/nutrition";
import { getPhoto, photoIdsOf } from "../../lib/photos";
import {
  dateList,
  latestWeightKg,
  loadState,
  saveState,
  withWeight,
  type AppState,
} from "../../lib/store";
import type { ActivityLevel, Meal, MealType } from "../../lib/types";
import "./index.scss";

/**
 * 记录页。照 web/src/components/RecordView.tsx 搬，结构与数值一一对应。
 *
 * 两处平台差异：
 * 1. 折线图换成 data URI 背景图（小程序没有 <svg>），点图跳日期这个交互去掉了
 * 2. 编辑弹层还没搬过来，右侧「改」按钮先留着占位，点了给一句提示
 */

const MEAL_SHADE: Record<string, string> = {
  breakfast: "#b6d4c2",
  lunch: "#6ea98a",
  dinner: "#1f8a5b",
  snack: "#c9cfcb",
  drink: "#c4694a",
};

function mealTime(m: Meal): string {
  const raw = m.eatenAt ?? m.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function RecordPage() {
  const [state, setState] = useState<AppState | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const [draft, setDraft] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useDidShow(() => {
    const s = loadState();
    if (!s.profile || !s.onboarded) {
      Taro.redirectTo({ url: "/pages/setup/index" });
      return;
    }
    setState(s);
  });

  // 照片是在本地文件系统里的，异步读出来再放到列表上
  useEffect(() => {
    if (!state) return;
    let alive = true;
    (async () => {
      const map: Record<string, string> = {};
      for (const m of state.meals) {
        const ids = photoIdsOf(m);
        if (ids.length) {
          const src = await getPhoto(ids[0]);
          if (src) map[m.id] = src;
        } else if (m.image) {
          map[m.id] = m.image;
        }
      }
      if (alive) setThumbs(map);
    })();
    return () => {
      alive = false;
    };
  }, [state]);

  const latest = state?.profile
    ? latestWeightKg(state.weights, state.profile.weightKg)
    : 0;

  const last7 = useMemo(() => dateList(7).reverse(), []);

  const dailyKcal = useMemo(() => {
    if (!state) return [];
    return last7.map((d) => {
      const list = state.meals.filter((m) => m.date === d);
      const parts = (["breakfast", "lunch", "dinner", "snack"] as MealType[])
        .map((t) => ({
          key: t as string,
          kcal: list
            .filter((m) => m.mealType === t)
            .reduce((s, m) => s + m.nutrition.kcal + drinkKcal(m.drinks), 0),
        }))
        .filter((p) => p.kcal > 0);
      // 柱子高度和色块总和必须是同一个数，否则色块会从柱子里冒出来
      const kcal = parts.reduce((s, p) => s + p.kcal, 0);
      return { date: d, kcal, parts };
    });
  }, [last7, state]);

  const budgets = useMemo(() => {
    if (!state?.profile) return [];
    const level = new Map<string, ActivityLevel>();
    for (const a of state.activities) level.set(a.date, a.level);
    const now = { ...state.profile, weightKg: latest };
    return last7.map((d) => dayBudget(now, level.get(d) ?? "normal"));
  }, [last7, state, latest]);

  const maxKcal = Math.max(
    ...budgets.map((b) => b * 1.2),
    ...dailyKcal.map((d) => d.kcal),
    1,
  );

  const grouped = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, Meal[]>();
    for (const d of dateList(14)) {
      const list = state.meals
        .filter((m) => m.date === d)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      if (list.length) map.set(d, list);
    }
    return Array.from(map.entries());
  }, [state]);

  if (!state?.profile) return <View className="page" />;

  const profile = state.profile;
  const lost = round(profile.weightKg - latest, 1);

  const saveWeight = () => {
    const kg = Math.round(draft * 10) / 10;
    if (!kg || kg < 40 || kg > 150) {
      Taro.showToast({ title: "这个数不对", icon: "none" });
      return;
    }
    const next = withWeight(state, { date: todayStr(), weightKg: kg });
    saveState(next);
    setState(next);
    setWeightOpen(false);
  };

  const step = (d: number) => {
    const next = Math.round(Math.min(150, Math.max(40, draft + d)) * 10) / 10;
    setDraft(next);
  };

  return (
    <View className="page">
      <View className="rec-head">
        <Text className="rec-title">我的记录</Text>
      </View>

      {/* 体重：减重这件事唯一的标准答案 */}
      <View className="sec">
        <View className="card">
          <View className="wt-top">
            <View>
              <Text className="wt-label">当前体重</Text>
              <View className="wt-nums">
                <Text className="wt-num tabular">{latest}</Text>
                <Text className="wt-unit">公斤</Text>
              </View>
            </View>
            <View
              className="wt-btn"
              hoverClass="tap"
              onClick={() => {
                setDraft(latest);
                setWeightOpen(true);
              }}
            >
              <Text className="wt-btn-text">记体重</Text>
            </View>
          </View>

          <View className="wt-stats">
            <View className="wt-stat">
              <Text className="wt-stat-label">目标</Text>
              <Text className="wt-stat-value tabular">{profile.targetWeightKg} kg</Text>
            </View>
            <View className="wt-stat">
              <Text className="wt-stat-label">已减</Text>
              <Text
                className={`wt-stat-value tabular ${
                  lost > 0 ? "is-down" : lost < 0 ? "is-up" : ""
                }`}
              >
                {lost > 0 ? `${lost} kg` : lost < 0 ? `+${Math.abs(lost)} kg` : "0 kg"}
              </Text>
            </View>
            <View className="wt-stat">
              <Text className="wt-stat-label">还剩</Text>
              <Text className="wt-stat-value tabular">
                {Math.max(0, round(latest - profile.targetWeightKg, 1))} kg
              </Text>
            </View>
          </View>
        </View>
      </View>

      <WeightTrend weights={state.weights} targetWeightKg={profile.targetWeightKg} />

      {/* 近 7 天 */}
      <View className="sec mt6">
        <Text className="h2">近 7 天</Text>
        <View className="card">
          <View className="bars">
            {/* 预算线一段一段画：每天活动量不同，额度就不同 */}
            <View className="budget-layer">
              {budgets.map((b, i) => (
                <View
                  key={i}
                  className="budget-seg"
                  style={{
                    height: `${Math.max(2, Math.round((b / maxKcal) * 104))}px`,
                    marginLeft: i === 0 ? 0 : -3,
                    marginRight: i === budgets.length - 1 ? 0 : -3,
                  }}
                />
              ))}
            </View>
            {budgets.slice(0, -1).map((b, i) => {
              const y1 = Math.max(2, Math.round((b / maxKcal) * 104));
              const y2 = Math.max(2, Math.round((budgets[i + 1] / maxKcal) * 104));
              if (y1 === y2) return null;
              return (
                <View
                  key={`v${i}`}
                  className="budget-v"
                  style={{
                    left: `${((i + 1) / budgets.length) * 100}%`,
                    bottom: `${Math.min(y1, y2)}px`,
                    height: `${Math.abs(y1 - y2)}px`,
                  }}
                />
              );
            })}

            {dailyKcal.map((d) => {
              const barH =
                d.kcal === 0 ? 4 : Math.max(8, Math.round((d.kcal / maxKcal) * 104));
              return (
                <View
                  key={d.date}
                  className="bar-col"
                  hoverClass={d.kcal > 0 ? "tap" : "none"}
                  onClick={() => {
                    if (d.kcal > 0) {
                      Taro.showToast({
                        title: `${d.date.slice(5).replace("-", " 月 ")} 日 ${Math.round(d.kcal)} 大卡`,
                        icon: "none",
                      });
                    }
                  }}
                >
                  <Text className="bar-kcal tabular">{d.kcal > 0 ? Math.round(d.kcal) : ""}</Text>
                  <View
                    className="bar"
                    style={{
                      height: `${barH}px`,
                      background: d.kcal === 0 ? "#e7eae8" : "transparent",
                    }}
                  >
                    {d.parts.map((p) => (
                      <View
                        key={p.key}
                        className="bar-part"
                        style={{
                          height: `${(p.kcal / Math.max(1, d.kcal)) * 100}%`,
                          background: MEAL_SHADE[p.key] ?? "#8fae9c",
                        }}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          <View className="chart-days">
            {dailyKcal.map((d) => (
              <Text key={d.date} className="chart-day">
                {d.date.slice(8)}
              </Text>
            ))}
          </View>

          <View className="chart-legend">
            {[
              ["早", MEAL_SHADE.breakfast],
              ["午", MEAL_SHADE.lunch],
              ["晚", MEAL_SHADE.dinner],
              ["加", MEAL_SHADE.snack],
            ].map(([label, color]) => (
              <View key={label} className="legend-item">
                <View className="legend-dot" style={{ background: color }} />
                <Text className="legend-text">{label}</Text>
              </View>
            ))}
            <View className="legend-budget">
              <View className="legend-dash" />
              <Text className="legend-text">预算</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 吃过的 */}
      <View className="sec mt6">
        <Text className="h2">吃过的</Text>
        {grouped.length === 0 ? (
          <View className="card empty-card">
            <Text className="empty-text">还没有记录</Text>
          </View>
        ) : (
          <View className="days">
            {grouped.map(([date, list]) => {
              const total = list.reduce(
                (s, m) => s + m.nutrition.kcal + drinkKcal(m.drinks),
                0,
              );
              return (
                <View key={date} className="day">
                  <View className="day-head">
                    <Text className="day-date">
                      {date === todayStr()
                        ? "今天"
                        : date.slice(5).replace("-", "月") + "日"}
                    </Text>
                    <Text className="day-kcal tabular">{total} 大卡</Text>
                  </View>

                  <View className="day-list">
                    {list.map((m) => (
                      <View key={m.id} className="rec-row">
                        <View className="rec-photo">
                          {thumbs[m.id] ? (
                            <Image className="rec-img" src={thumbs[m.id]} mode="aspectFill" />
                          ) : (
                            <Text className="rec-photo-none">没拍</Text>
                          )}
                        </View>

                        <View className="rec-mid">
                          <Text className="rec-meta">
                            {snackLabel(m)}
                            <Text className="rec-time tabular"> {mealTime(m)}</Text>
                            {m.updatedAt ? <Text className="rec-edited"> 已改过</Text> : null}
                          </Text>
                          <Text className="rec-items ellipsis">{m.items.map((i) => i.name).join("、")}</Text>
                          <Text className="rec-kcal tabular">
                            {m.nutrition.kcal + drinkKcal(m.drinks)} 大卡
                            {m.drinks?.length ? ` · ${drinksLabel(m.drinks)}` : ""}
                          </Text>
                        </View>

                        <View className="rec-acts">
                          <View
                            className="rec-act is-edit"
                            hoverClass="tap"
                            onClick={() =>
                              Taro.showToast({ title: "改记录下一步接", icon: "none" })
                            }
                          >
                            <Icon name="edit" size={17} color="#176f49" />
                          </View>
                          <View
                            className="rec-act is-del"
                            hoverClass="tap"
                            onClick={async () => {
                              const r = await Taro.showModal({
                                title: "删掉这条记录？",
                                confirmText: "删掉",
                                cancelText: "算了",
                              });
                              if (!r.confirm) return;
                              const next = {
                                ...state,
                                meals: state.meals.filter((x) => x.id !== m.id),
                              };
                              saveState(next);
                              setState(next);
                            }}
                          >
                            <Icon name="trash" size={17} color="#6b7671" />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text className="disclaimer">
        本产品提供饮食参考，不构成医疗建议。
        {"\n"}如有疾病请遵医嘱。
      </Text>

      <View className="bottom-space" />

      {/* 记体重 */}
      {weightOpen && (
        <View className="sheet-mask" onClick={() => setWeightOpen(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">记体重</Text>
            <Text className="sheet-hint">早上空腹称最准，一天记一次就够</Text>
            <View className="stepper">
              <View className="step-btn" hoverClass="tap" onClick={() => step(-0.1)}>
                <Text className="step-sign">−</Text>
              </View>
              <View className="step-mid">
                <Input
                  className="step-input tabular"
                  type="digit"
                  value={String(draft)}
                  onInput={(e) => setDraft(Number(e.detail.value.replace(/[^\d.]/g, "")) || 0)}
                />
                <Text className="step-unit">公斤</Text>
              </View>
              <View className="step-btn" hoverClass="tap" onClick={() => step(0.1)}>
                <Text className="step-sign">+</Text>
              </View>
            </View>
            <View className="btn-primary sheet-ok" hoverClass="tap" onClick={saveWeight}>
              <Text className="sheet-ok-text">记下了</Text>
            </View>
          </View>
        </View>
      )}

      <BottomNav active="record" showCapture={false} onCapture={() => {}} />
    </View>
  );
}
