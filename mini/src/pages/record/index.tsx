import { Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import BottomNav from "../../components/BottomNav";
import Icon from "../../components/Icon";
import WeightTrend from "../../components/WeightTrend";
import { recognize } from "../../lib/api";
import { ruleComment } from "../../lib/comment";
import { drinkKcal, drinksLabel } from "../../lib/drinks";
import { compressPath, pathToDataUrl } from "../../lib/image";
import {
  buildPlan,
  dayBudget,
  mealTypeLabel,
  round,
  snackLabel,
  sumMeals,
  todayStr,
} from "../../lib/nutrition";
import { deletePhoto, getPhoto, photoIdsOf } from "../../lib/photos";
import {
  activityOfDate,
  dateList,
  latestWeightKg,
  loadState,
  saveState,
  updateMeal,
  withWeight,
  type AppState,
} from "../../lib/store";
import type { ActivityLevel, FoodItem, Meal, MealType, Nutrition } from "../../lib/types";
import "./index.scss";

/**
 * 记录页。照 web/src/components/RecordView.tsx 搬，结构与数值一一对应。
 *
 * 两处平台差异：
 * 1. 折线图换成 data URI 背景图（小程序没有 <svg>），点图跳日期改成弹一句
 * 2. 「改」弹层这一版补齐了：菜名能删、份量能调、餐次能换、
 *    照片能删也能补一张重算 —— 网页版有的这里都有
 */

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

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

  /** 改记录弹层 */
  const [editing, setEditing] = useState<Meal | null>(null);
  const [editType, setEditType] = useState<MealType>("lunch");
  const [editItems, setEditItems] = useState<FoodItem[]>([]);
  const [factors, setFactors] = useState<number[]>([]);
  const [editPhotos, setEditPhotos] = useState<{ id?: string; src: string; path: string }[]>([]);
  /** 补照片重算过之后，营养以新值为基准 */
  const [recalcBase, setRecalcBase] = useState<Nutrition | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcErr, setRecalcErr] = useState("");
  const [addingPhoto, setAddingPhoto] = useState(false);

  const router = useRouter();

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

  /** 改到一半的营养：删一道菜就按比例缩，不重算，但不会离谱 */
  const edited = useMemo(() => {
    if (!editing) return null;
    const scaledKcal = editItems.reduce((s, it, i) => s + it.kcal * (factors[i] ?? 1), 0);
    const source = recalcBase ?? editing.nutrition;
    const base = source.kcal > 0 ? source.kcal : 1;
    const ratio = scaledKcal / base;
    const scale = (n: number) => Math.round(n * ratio);
    return {
      kcal: Math.round(scaledKcal),
      protein: scale(source.protein),
      carb: scale(source.carb),
      fat: scale(source.fat),
      sodium: scale(source.sodium),
    };
  }, [editing, editItems, factors, recalcBase]);

  /**
   * 能选哪几顿。
   * 加餐不是正餐：一盘米饭炒菜改成"加餐"是在改事实，不是在改错字。
   * 所以正餐只能跟正餐互换；加餐本身倒是可以改成某一顿正餐。
   */
  const typeOptions = useMemo(() => {
    if (!editing || !state) return [];
    return MEAL_TYPES.filter((t) => {
      if (t === "snack" && editing.mealType !== "snack") return false;
      if (t === editing.mealType) return true;
      return !state.meals.some(
        (m) => m.date === editing.date && m.mealType === t && m.id !== editing.id,
      );
    });
  }, [editing, state]);

  // 从「记一餐」里点「改」过来：进页面直接把编辑弹层打开
  useEffect(() => {
    if (!state || !router.params?.editId) return;
    const target = state.meals.find((m) => m.id === router.params.editId);
    if (target) void openEditor(target);
    // 只认一次，否则关掉弹层又会被打开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state?.profile) return <View className="page" />;

  const profile = state.profile;
  const lost = round(profile.weightKg - latest, 1);
  /** 改记录后要重算点评，规则跟首页同一套，所以要同一份 plan */
  const planForComment = buildPlan(
    { ...profile, weightKg: latest },
    activityOfDate(state, todayStr()),
  );

  /** 打开编辑弹层。照片是异步读的，先摆出结构再填图 */
  async function openEditor(m: Meal) {
    setEditing(m);
    setEditType(m.mealType);
    setEditItems(m.items);
    setFactors(m.items.map(() => 1));
    setRecalcBase(null);
    setRecalcErr("");
    const list: { id?: string; src: string; path: string }[] = [];
    for (const id of photoIdsOf(m)) {
      const src = thumbs[id] ?? (await getPhoto(id)) ?? "";
      if (src) list.push({ id, src, path: src });
    }
    // 老数据把缩略图塞在记录里，没有文件名可读
    if (!list.length && m.image) list.push({ src: m.image, path: m.image });
    setEditPhotos(list);
  }

  const removeItem = (i: number) => {
    // 最后一道不给删，这种情况应该删整条记录
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, idx) => idx !== i));
    setFactors((prev) => prev.filter((_, idx) => idx !== i));
  };

  const bumpFactor = (i: number, delta: number) => {
    setFactors((prev) =>
      prev.map((f, idx) =>
        idx === i
          ? Math.min(3, Math.max(0.5, Math.round((f + delta) * 10) / 10))
          : f,
      ),
    );
  };

  /** 补一张照片：先压、再存、再按这几张重算 */
  const addPhoto = async () => {
    if (addingPhoto) return;
    setAddingPhoto(true);
    setRecalcErr("");
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["camera", "album"],
        sizeType: ["compressed"],
      });
      const temp = res.tempFiles?.[0]?.tempFilePath;
      if (!temp) return;
      const small = await compressPath(temp);
      const next = [...editPhotos, { src: small, path: small }];
      setEditPhotos(next);
      await recalc(next.map((p) => p.path));
    } catch {
      setRecalcErr("没加上，再试一次");
    } finally {
      setAddingPhoto(false);
    }
  };

  /** 按现有的几张重算。菜名和热量会整个换掉，照片不动 */
  async function recalc(paths: string[]) {
    if (!paths.length) {
      setRecalcErr("没有照片，补一张才能重算");
      return;
    }
    setRecalcBusy(true);
    setRecalcErr("");
    const urls: string[] = [];
    for (const p of paths) {
      const u = await pathToDataUrl(p);
      if (u) urls.push(u);
    }
    if (!urls.length) {
      setRecalcBusy(false);
      setRecalcErr("这些照片读不出来");
      return;
    }
    const r = await recognize(urls, "");
    setRecalcBusy(false);
    if (!r.items?.length) {
      setRecalcErr(r.error || "没认出来，换一张试试");
      return;
    }
    setEditItems(r.items);
    setFactors(r.items.map(() => 1));
    setRecalcBase(r.nutrition);
  }

  const removePhoto = (i: number) => {
    const target = editPhotos[i];
    if (target?.id) void deletePhoto(target.id);
    setEditPhotos((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveEdit = () => {
    if (!editing || !edited || !editItems.length) return;
    const dayTotal = sumMeals(state.meals.filter((m) => m.date === editing.date)).kcal;
    const before = dayTotal - editing.nutrition.kcal;
    const ids = editPhotos.map((p) => p.id).filter(Boolean) as string[];
    const legacy = editPhotos.find((p) => !p.id && p.src.startsWith("data:"))?.src;

    const next = updateMeal(state, {
      ...editing,
      photoIds: ids.length ? ids : undefined,
      image: legacy,
      mealType: editType,
      items: editItems.map((it, i) => ({
        ...it,
        kcal: Math.round(it.kcal * (factors[i] ?? 1)),
      })),
      nutrition: edited,
      comment: ruleComment(
        edited,
        profile,
        planForComment,
        before,
        editType,
        editing.eatenAt ?? editing.createdAt,
      ),
      updatedAt: new Date().toISOString(),
    });
    saveState(next);
    setState(next);
    setEditing(null);
  };

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
                        <View
                          className="rec-photo"
                          hoverClass={thumbs[m.id] ? "tap" : "none"}
                          onClick={() => {
                            if (!thumbs[m.id]) return;
                            void (async () => {
                              // 一条记录可能有好几张，一起拿出来让他翻
                              const srcs: string[] = [];
                              for (const id of photoIdsOf(m)) {
                                const p = await getPhoto(id);
                                if (p) srcs.push(p);
                              }
                              const cur = thumbs[m.id];
                              Taro.previewImage({
                                urls: srcs.length ? srcs : [cur],
                                current: cur,
                              });
                            })();
                          }}
                        >
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
                            onClick={() => void openEditor(m)}
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
                              // 照片在本地文件系统里，删记录时一起清掉，别留垃圾
                              for (const id of photoIdsOf(m)) void deletePhoto(id);
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

      {/* 改记录 */}
      {editing && edited && (
        <View className="sheet-mask" onClick={() => setEditing(null)}>
          <View className="sheet edit-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="sheet-head">
              <Text className="sheet-title">改这条记录</Text>
              <View className="sheet-close" hoverClass="tap" onClick={() => setEditing(null)}>
                <Icon name="close" size={16} color="#6b7671" />
              </View>
            </View>

            <View className="edit-top">
              <Text className="edit-date">
                {editing.date === todayStr() ? "今天" : editing.date}
              </Text>
              <View className="edit-kcal">
                <Text className="edit-kcal-num tabular">{edited.kcal}</Text>
                <Text className="edit-kcal-unit">大卡</Text>
              </View>
            </View>

            {/*
              照片在这一层也能改。
              最常见的错法是"拍进来一张不该算的图"，或者"少拍了一盘" ——
              那时候只能整条删掉重拍，前功尽弃。删掉或补一张，账上的菜跟着图走。
            */}
            <View className="edit-photos">
              {editPhotos.map((p, i) => (
                <View key={p.id ?? `legacy-${i}`} className="edit-photo">
                  <View
                    className="edit-photo-img"
                    hoverClass="tap"
                    onClick={() =>
                      Taro.previewImage({
                        urls: editPhotos.map((x) => x.src),
                        current: p.src,
                      })
                    }
                  >
                    <Image className="edit-photo-img-in" src={p.src} mode="aspectFill" />
                  </View>
                  <View
                    className="edit-photo-del"
                    hoverClass="tap"
                    onClick={() => removePhoto(i)}
                  >
                    <Icon name="close" size={11} color="#ffffff" />
                  </View>
                </View>
              ))}

              {editPhotos.length < 4 && (
                <View className="edit-photo-add" hoverClass="tap" onClick={addPhoto}>
                  <Icon name="plus" size={18} color="#b6bdb9" />
                  <Text className="edit-photo-add-text">{addingPhoto ? "压图…" : "加一张"}</Text>
                </View>
              )}
            </View>

            <View className="edit-recalc">
              {recalcBusy ? (
                <Text className="edit-tip">正在按这几张重算…</Text>
              ) : editPhotos.length > 0 ? (
                <>
                  <Text
                    className="edit-link"
                    onClick={() => void recalc(editPhotos.map((p) => p.path))}
                  >
                    按这几张重算
                  </Text>
                  <Text className="edit-tip">换过照片会自动算一次</Text>
                </>
              ) : (
                <Text className="edit-tip">没有照片，补一张才能重算</Text>
              )}
              {!!recalcErr && <Text className="edit-err">{recalcErr}</Text>}
            </View>

            <Text className="edit-label">是哪一顿</Text>
            <View className="edit-types">
              {typeOptions.map((t) => (
                <View
                  key={t}
                  className={`edit-type ${editType === t ? "is-on" : ""}`}
                  hoverClass="tap"
                  onClick={() => setEditType(t)}
                >
                  <Text className="edit-type-text">{mealTypeLabel(t)}</Text>
                </View>
              ))}
            </View>
            <Text className="edit-tip">同一顿只能有一条记录，已经记过的不在这儿</Text>

            <View className="edit-items-head">
              <Text className="edit-label">吃了什么</Text>
              <Text className="edit-count">{editItems.length} 样</Text>
            </View>

            <View className="edit-items">
              {editItems.map((it, i) => (
                <View key={`${it.name}-${i}`} className="edit-item">
                  <View className="edit-item-top">
                    <View className="edit-item-left">
                      <Text className="edit-item-name">{it.name}</Text>
                      <Text className="edit-item-sub">
                        {it.portion} · 约 {Math.round(it.kcal * (factors[i] ?? 1))} 大卡
                      </Text>
                    </View>
                    <View
                      className={`edit-item-del ${editItems.length <= 1 ? "is-off" : ""}`}
                      hoverClass={editItems.length <= 1 ? "none" : "tap"}
                      onClick={() => removeItem(i)}
                    >
                      <Icon name="trash" size={15} color="#6b7671" />
                    </View>
                  </View>
                  <View className="edit-item-foot">
                    <Text className="edit-item-portion">份量</Text>
                    <View className="edit-portion-btns">
                      <View className="edit-portion-btn" hoverClass="tap" onClick={() => bumpFactor(i, -0.5)}>
                        <Text className="edit-portion-sign">−</Text>
                      </View>
                      <Text className="edit-portion-val tabular">{factors[i] ?? 1} 份</Text>
                      <View className="edit-portion-btn" hoverClass="tap" onClick={() => bumpFactor(i, 0.5)}>
                        <Text className="edit-portion-sign">+</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {editItems.length <= 1 && (
              <Text className="edit-tip">只剩一样菜了。想整顿都不要，回上一页点垃圾桶图标。</Text>
            )}

            <View className="edit-acts">
              <View className="btn-primary" hoverClass="tap" onClick={saveEdit}>
                <Text className="btn-primary-text">保存修改</Text>
              </View>
              <View className="btn-ghost" hoverClass="tap" onClick={() => setEditing(null)}>
                <Text className="btn-ghost-text">不改了</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <BottomNav active="record" showCapture={false} onCapture={() => {}} />
    </View>
  );
}
