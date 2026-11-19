import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { mealTypeLabel, sumMeals } from "../../lib/nutrition";
import {
  latestWeightKg,
  loadState,
  saveState,
  withWeight,
  type AppState,
} from "../../lib/store";
import "./index.scss";

/**
 * 记录页：体重 + 吃过什么。
 *
 * 网页版这里还有一张体重折线图和柱状图（用的是手写 SVG），
 * 小程序不支持 <svg> 标签，图表得换成 canvas 或者 data URI 背景图，
 * 骨架阶段先把数据列出来，图后面单独做。
 */
export default function RecordPage() {
  const [state, setState] = useState<AppState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useDidShow(() => {
    setState(loadState());
  });

  const groups = useMemo(() => {
    if (!state) return [];
    const byDate = new Map<string, AppState["meals"]>();
    for (const m of state.meals) {
      const list = byDate.get(m.date) ?? [];
      list.push(m);
      byDate.set(m.date, list);
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([date, meals]) => ({
        date,
        // 按实际吃的时刻排，不按 mealType 的字母顺序 —— breakfast/dinner 那种排法会把晚饭排到午饭前面
        meals: meals.sort((a, b) =>
          (a.eatenAt ?? a.createdAt).localeCompare(b.eatenAt ?? b.createdAt),
        ),
        kcal: sumMeals(meals).kcal,
      }));
  }, [state]);

  if (!state?.profile) return <View className="page" />;

  const current = latestWeightKg(state.weights, state.profile.weightKg);
  const sortedWeights = [...state.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sortedWeights[0];
  const before = sortedWeights[1];
  const delta = last && before ? Math.round((last.weightKg - before.weightKg) * 10) / 10 : 0;

  const saveWeight = () => {
    const kg = Number(draft.replace(/[^\d.]/g, ""));
    if (!kg || kg < 30 || kg > 200) {
      Taro.showToast({ title: "重量不对", icon: "none" });
      return;
    }
    const next = withWeight(state, {
      date: new Date().toISOString().slice(0, 10),
      weightKg: kg,
    });
    saveState(next);
    setState(next);
    setEditing(false);
    setDraft("");
    Taro.showToast({ title: "记下了", icon: "none" });
  };

  return (
    <View className="page">
      {/* 体重：减重这件事唯一的标准答案，比热量准 */}
      <View className="card weight">
        <View className="weight-row">
          <View>
            <Text className="weight-label">当前体重</Text>
            <View className="weight-nums">
              <Text className="weight-num">{current}</Text>
              <Text className="weight-unit">公斤</Text>
            </View>
          </View>
          <View>
            <Text className="weight-label">目标</Text>
            <Text className="weight-target">{state.profile.targetWeightKg}</Text>
          </View>
        </View>

        {!!before && (
          <Text className="weight-delta">
            {/* 掉秤是好事，用绿色；涨了用红色。跟股票反过来，这里涨不是好事 */}
            比上次{delta < 0 ? "轻" : delta > 0 ? "重" : "持平"}
            {delta !== 0 ? ` ${Math.abs(delta)} 公斤` : ""}
          </Text>
        )}

        {editing ? (
          <View className="weight-edit">
            <Input
              className="weight-input"
              type="digit"
              focus
              placeholder="今天的体重"
              value={draft}
              onInput={(e) => setDraft(e.detail.value)}
            />
            <View className="weight-ok" onClick={saveWeight}>
              <Text className="weight-ok-text">记下</Text>
            </View>
          </View>
        ) : (
          <View
            className="weight-btn"
            onClick={() => {
              setDraft(String(current));
              setEditing(true);
            }}
          >
            <Text className="weight-btn-text">称过了，记一下</Text>
          </View>
        )}
      </View>

      <Text className="section-title">最近记的</Text>

      {groups.length === 0 ? (
        <View className="card empty">
          <Text className="empty-text">
            还没有记录。回「今天」拍一张，它自己算热量。
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.date} className="card day">
            <View className="day-head">
              <Text className="day-date">{g.date.slice(5).replace("-", " 月 ")} 日</Text>
              <Text className="day-kcal">{Math.round(g.kcal)} 大卡</Text>
            </View>
            {g.meals.map((m) => (
              <View key={m.id} className="meal-row">
                <Text className="meal-type">{mealTypeLabel(m.mealType)}</Text>
                <Text className="meal-items" numberOfLines={1}>
                  {m.items.map((i) => i.name).join("、") || "—"}
                </Text>
                <Text className="meal-kcal">{Math.round(m.nutrition.kcal)}</Text>
              </View>
            ))}
          </View>
        ))
      )}

      <View className="tail" />
    </View>
  );
}
