import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import BottomNav from "../../components/BottomNav";
import Icon, { type IconName } from "../../components/Icon";
import Splash from "../../components/Splash";
import { habitTimes, macroWarnings, mealReminder, nextMealAdvice } from "../../lib/advice";
import { avgBurnEndingOn } from "../../lib/exercise";
import { dayStatusText, ruleVerdict, type Verdict } from "../../lib/comment";
import {
  alcoholVerdict,
  dayDrinks,
  drinkAlcoholG,
  drinkKcal,
  drinksLabel,
} from "../../lib/drinks";
import { SALT_COLOR, SALT_LABEL, TAG_CFG, daySalt, saltGram, saltLevelOf } from "../../lib/mealTags";
import {
  buildPlan,
  goalOptions,
  mealTypeLabel,
  streakDays,
  sumMeals,
  todayStr,
} from "../../lib/nutrition";
import { foodRanking, rankSummary, type RankedFood } from "../../lib/ranking";
import {
  dateList,
  latestWeightKg,
  loadState,
  saveState,
  type AppState,
} from "../../lib/store";
import type { MealType, Profile } from "../../lib/types";
import "./index.scss";

/**
 * 首页。这一版是**照网页版 HomeView.tsx 逐段搬**的，不是重新设计。
 *
 * 上一版是照着"大意"重写的：白卡代替暖色卡、文字代替图标、原生 tabBar 代替自绘，
 * 于是同一份产品长成了两个样子。这次的做法是：
 * 结构按网页版的 DOM 顺序，间距按网页版的数值（tw() 换算），图标用同一份路径数据。
 */

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 开屏每次冷启动只放一次。
 * 放模块级而不是 state：页面被 redirect 或重新进入时不会再挡一遍，
 * 但整个小程序被杀掉重开时会重新来 —— 这才是"每次打开"的意思。
 */
let splashShown = false;

const SLOT_ICON: Record<MealType, IconName> = {
  breakfast: "sunrise",
  lunch: "sun",
  dinner: "moon",
  snack: "apple",
};

type PartKind = "carb" | "meat" | "veg";
const KIND_LABEL: Record<PartKind, string> = { carb: "主食", meat: "荤菜", veg: "蔬菜" };
const KIND_COLOR: Record<PartKind, string> = {
  carb: "#b0842c",
  meat: "#a3563f",
  veg: "#3f7d5a",
};
const KIND_ICON: Record<PartKind, IconName> = { carb: "carb", meat: "meat", veg: "veg" };
const TONE_COLOR = { good: "#1f8a5b", warn: "#a9631a", over: "#b23c2c" };

/**
 * 网页版有 20 处写 `text-ink-400`，但 globals.css 的 @theme 里只定义了
 * 300 / 500 / 700 / 900 —— 这个色阶其实不存在，那几处字是继承下来的墨色。
 * 复刻时不照抄这个疏漏：400 的位置统一用已定义的 ink-500（#6b7671），
 * 这跟用户眼睛看到的那层灰是同一个层次，也跟截图对得上。
 */
const INK_400 = "#6b7671";

/** 圆环：小程序没有 <svg>，把同样的两个圆画进 data URI 当背景图 */
function ringBg(ratio: number, color: string, size = 104) {
  const stroke = Math.max(8, Math.round(size * 0.078));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = Math.max(0, Math.min(1, ratio)) * c;
  const half = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="#e7eae8" stroke-width="${stroke}"/>` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-dasharray="${on.toFixed(2)} ${c.toFixed(2)}" ` +
    `transform="rotate(-90 ${half} ${half})"/></svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}

/** 按疾病给一条当日提醒（与网页版一致：十个字以内，只说今天注意哪一件） */
function diseaseTip(profile: Profile): { icon: IconName; text: string } | null {
  const d = profile.diseases;
  if (d.includes("hypertension")) return { icon: "salt", text: "腌菜汤别碰" };
  if (d.includes("diabetes")) return { icon: "carb", text: "主食分三顿，先菜后饭" };
  if (d.includes("fattyLiver")) return { icon: "fat", text: "少油炸少甜饮，晚饭别撑" };
  if (d.includes("hyperlipidemia")) return { icon: "fat", text: "肥肉内脏少吃，多蒸煮" };
  if (d.includes("gout")) return { icon: "protein", text: "内脏浓汤别碰，多喝水" };
  if (d.includes("stomach")) return { icon: "alert", text: "别空腹，少吃辣和凉" };
  return null;
}

/** "1 份"不算份量，桌上每道菜都是 1 份 */
function portionText(f: RankedFood): string {
  const p = (f.portion ?? "").trim();
  if (!p) return "";
  if (/^(一|1)\s*份$/.test(p)) return "";
  return p;
}

export default function HomePage() {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(new Date());
  const [showHow, setShowHow] = useState(false);
  const [view, setView] = useState<"meal" | "food">("meal");
  const [logOpen, setLogOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [splash, setSplash] = useState(!splashShown);

  useDidShow(() => {
    const s = loadState();
    if (!s.profile || !s.onboarded) {
      Taro.redirectTo({ url: "/pages/setup/index" });
      return;
    }
    setState(s);
    setNow(new Date());
  });

  // 每分钟刷一次时间：提醒是按时段算的，页面停着不动也得跟着变
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = todayStr(now);

  const vm = useMemo(() => {
    if (!state?.profile) return null;
    const profile = state.profile;
    // 预算按最近一次称的体重算：人瘦了消耗降，还按老体重给额度就是越吃越超
    const currentWeightKg = latestWeightKg(state.weights, profile.weightKg);
    /*
     * 跟网页版同一条口径：今天的预算吃的是「截至昨天」的 7 天运动均值。
     * 今晚动的，今晚的额度不该立刻涨 —— 一涨就变成"运动换饭吃"（H5）。
     * 运动记录在「动」那一页，数据本来就是同一份 state。
     */
    const extraBurn = avgBurnEndingOn(
      state.exercises,
      dateList(2)[1],
      currentWeightKg,
    );
    const plan = buildPlan({ ...profile, weightKg: currentWeightKg }, extraBurn);
    const todayMeals = state.meals.filter((m) => m.date === today);
    const totals = sumMeals(todayMeals);
    const status = dayStatusText(totals.kcal, plan.dailyBudgetKcal);
    const left = plan.dailyBudgetKcal - totals.kcal;

    const atGoal = currentWeightKg <= profile.targetWeightKg;
    const all = goalOptions({ ...profile, weightKg: currentWeightKg }, extraBurn);
    // 差距很小时"快"和"稳"会算出同一个周数，两个一样的按钮只会让人犹豫
    const speeds = all.filter((o, i) => all.findIndex((x) => x.weeks === o.weeks) === i);
    const activeSpeed =
      speeds.find((o) => (o.goalWeeks ?? null) === (profile.goalWeeks ?? null))?.key ??
      (profile.goalWeeks && profile.goalWeeks < plan.fastestWeeks ? "fast" : "steady");
    const activeIdx = Math.max(0, speeds.findIndex((o) => o.key === activeSpeed));

    const habit = habitTimes(state.meals);
    const recordedSlots = todayMeals.map((m) => m.mealType);
    const advice = nextMealAdvice(left, plan.dailyBudgetKcal, profile, now, habit, recordedSlots);
    const warnings = macroWarnings(totals, plan, profile, now);
    const reminder = mealReminder(todayMeals, profile.mealRegular, now, habit);

    const tipRaw = diseaseTip(profile);
    // 建议卡刚说过同一件事就不再重复
    const tip =
      tipRaw && advice?.caution && advice.cautionIcon === tipRaw.icon ? null : tipRaw;

    const drinks = dayDrinks(todayMeals);
    const alcoholKcal = drinkKcal(drinks);
    const alcoholG = drinkAlcoholG(drinks);

    const salt = daySalt(todayMeals);
    const saltLevel = salt.taggedCount > 0 ? saltLevelOf(salt.mg, salt.taggedCount) : null;

    // 盐已经单独占一行时，"少盐"就不必再说第二遍
    const showTip = tip && !(tip.icon === "salt" && saltLevel && saltLevel !== "light") ? tip : null;

    const sorted = [...todayMeals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const streak = streakDays(state.meals, today);
    const ranking = foodRanking(todayMeals);
    const rankTop = rankSummary(ranking.list);

    const nameCount = new Map<string, number>();
    for (const f of ranking.list) nameCount.set(f.name, (nameCount.get(f.name) ?? 0) + 1);

    // 点评按当前规则重算，不读存下来的旧字符串
    const liveVerdicts = new Map<string, Verdict>();
    const asc = [...todayMeals].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    let before = 0;
    for (const m of asc) {
      const kcal = m.nutrition.kcal + drinkKcal(m.drinks);
      const v = ruleVerdict(
        { ...m.nutrition, kcal },
        profile,
        plan,
        before,
        m.mealType,
        m.eatenAt ?? m.createdAt,
      );
      liveVerdicts.set(m.id, v);
      before += kcal;
    }
    // 同一天同一个结论只说一次
    const seen = new Set<string>();
    const verdictOnce = new Set<string>();
    for (const m of sorted) {
      const v = liveVerdicts.get(m.id);
      if (!v || seen.has(v.short)) continue;
      seen.add(v.short);
      verdictOnce.add(m.id);
    }

    return {
      profile,
      plan,
      currentWeightKg,
      todayMeals,
      totals,
      status,
      left,
      atGoal,
      speeds,
      activeIdx,
      advice,
      warnings,
      reminder,
      showTip,
      alcoholG,
      alcoholKcal,
      saltMg: salt.mg,
      saltLevel,
      sorted,
      streak,
      ranking,
      rankTop,
      nameCount,
      liveVerdicts,
      verdictOnce,
    };
  }, [state, today, now]);

  const openSettings = () => Taro.navigateTo({ url: "/pages/settings/index" });

  const setGoalWeeks = (weeks?: number) => {
    if (!state?.profile) return;
    const next = { ...state, profile: { ...state.profile, goalWeeks: weeks } };
    saveState(next);
    setState(next);
  };

  if (splash) {
    return (
      <Splash
        onDone={() => {
          splashShown = true;
          setSplash(false);
        }}
      />
    );
  }

  if (!vm) return <View className="page" />;

  const {
    profile,
    plan,
    currentWeightKg,
    todayMeals,
    totals,
    status,
    atGoal,
    speeds,
    activeIdx,
    advice,
    warnings,
    reminder,
    showTip,
    alcoholG,
    saltMg,
    saltLevel,
    sorted,
    streak,
    ranking,
    rankTop,
    nameCount,
    liveVerdicts,
    verdictOnce,
  } = vm;

  const ringColor =
    status.tone === "over" ? "#d94f3d" : status.tone === "warn" ? "#e8871e" : "#1f8a5b";
  const mealShown = logOpen ? sorted : sorted.slice(0, 1);
  const RANK_PREVIEW = 8;
  const rankShown = rankOpen ? ranking.list : ranking.list.slice(0, RANK_PREVIEW);
  const rankMax = ranking.list[0]?.kcal ?? 1;

  return (
    <View className="page">
      {/* 顶部：日期 + 连记 + 设置 */}
      <View className="hd">
        <View className="hd-left">
          <Text className="hd-date">
            {WEEKDAYS[now.getDay()]} · {today.slice(5).replace("-", "/")}
          </Text>
          {streak >= 2 ? (
            <View className="hd-streak">
              <Icon name="fire" size={15} color="#176f49" />
              <Text className="hd-streak-text">连记 {streak} 天</Text>
            </View>
          ) : todayMeals.length === 0 ? (
            <Text className="hd-none">今天还没记</Text>
          ) : null}
        </View>
        <View className="hd-set" hoverClass="tap" hoverStayTime={60} onClick={openSettings}>
          <Icon name="settings" size={21} color="#6b7671" />
        </View>
      </View>

      {/* 吃饭时间提醒 */}
      {reminder && (
        <View className="reminder">
          <Icon name="clock" size={17} color="#a9631a" />
          <Text className="reminder-text">{reminder.text}</Text>
        </View>
      )}

      {/* 晚饭这样吃：三格图标是首页的主角 */}
      {advice && (
        <View className="sec mt2">
          <View className={`advice tone-${advice.tone}`}>
            <View className="advice-head">
              <Icon
                name={
                  advice.headline.startsWith("早饭")
                    ? "sunrise"
                    : advice.headline.startsWith("午饭")
                      ? "sun"
                      : "moon"
                }
                size={16}
                color="#6b7671"
              />
              <Text className="advice-headline">{advice.headline}</Text>
            </View>

            <View className="advice-parts">
              {advice.parts.map((p) => (
                <View key={p.kind} className="advice-part">
                  <Icon
                    name={KIND_ICON[p.kind as PartKind]}
                    size={21}
                    color={KIND_COLOR[p.kind as PartKind]}
                  />
                  <Text className="advice-part-label">{KIND_LABEL[p.kind as PartKind]}</Text>
                  <Text className="advice-part-value">{p.label}</Text>
                </View>
              ))}
            </View>

            {!!advice.caution && (
              <View className="advice-caution">
                <Icon
                  name={(advice.cautionIcon ?? "alert") as IconName}
                  size={14}
                  color={INK_400}
                />
                <Text className="advice-caution-text">{advice.caution}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 环 + 提醒清单 + 三条营养素，同一张白卡 */}
      <View className="sec mt3">
        <View className="dash">
          <View className="dash-top">
            <View className="ring" style={{ backgroundImage: ringBg(totals.kcal / Math.max(1, plan.dailyBudgetKcal), ringColor) }}>
              <View className="ring-inner">
                <Text className="ring-label">{status.tone === "over" ? "超出" : "还能吃"}</Text>
                <Text className="ring-num" style={{ color: ringColor }}>
                  {status.tone === "over"
                    ? Math.round(totals.kcal - plan.dailyBudgetKcal)
                    : Math.round(Math.max(0, plan.dailyBudgetKcal - totals.kcal))}
                </Text>
                <Text className="ring-budget">预算 {Math.round(plan.dailyBudgetKcal)}</Text>
              </View>
            </View>

            <View className="notes">
              {warnings.map((w) => (
                <NoteRow
                  key={w.key}
                  dot={w.severe ? "#b23c2c" : "#a9631a"}
                  head={w.short}
                  headColor={w.severe ? "#b23c2c" : "#33413b"}
                  tail={w.tip}
                />
              ))}
              {saltLevel && (
                <NoteRow
                  dot={SALT_COLOR[saltLevel]}
                  head="盐"
                  headColor="#33413b"
                  tail={SALT_LABEL[saltLevel]}
                  tailColor={SALT_COLOR[saltLevel]}
                  tailBold
                />
              )}
              {alcoholG > 25 && (
                <NoteRow dot="#b23c2c" head={`酒 ${alcoholG} 克`} headColor="#b23c2c" tail="今天到此" />
              )}
              {showTip && <NoteRow dot="#1f8a5b" head={showTip.text} headColor="#42514a" />}
              {warnings.length === 0 && !saltLevel && alcoholG <= 25 && !showTip && (
                <Text className="note-quiet">今天吃得稳，照这个来</Text>
              )}
            </View>
          </View>

          <View className="macros">
            <MacroBar icon="protein" color="#a3563f" label="蛋白质" value={totals.protein} target={plan.proteinTargetG} />
            <MacroBar icon="carb" color="#b0842c" label="碳水" value={totals.carb} target={plan.carbTargetG} />
            <MacroBar icon="fat" color="#7d8b5e" label="脂肪" value={totals.fat} target={plan.fatTargetG} />
            {/* 盐跟三条营养素并排：只给一句"盐有点多"没有刻度，
                他不知道自己离 5 克还差多少、是今天超了还是这顿超了 */}
            <MacroBar
              icon="salt"
              color="#6b7c8c"
              label="盐"
              value={saltGram(saltMg)}
              target={saltGram(plan.sodiumLimitMg)}
              unit="g"
              digits={1}
            />
          </View>
        </View>
      </View>

      {/* 预算怎么来的 + 觉得慢怎么调 */}
      <View className="sec mt2">
        <View className="plan-row" hoverClass="tap" onClick={() => setShowHow((v) => !v)}>
          <Text className="plan-text">
            {atGoal ? (
              <>已经到 {profile.targetWeightKg} 公斤，接着稳住就行</>
            ) : profile.goalWeeks && plan.tooFast ? (
              <>
                <Text className="b danger">{profile.goalWeeks}</Text> 周办不到，最快{" "}
                <Text className="b">{plan.fastestWeeks}</Text> 周
              </>
            ) : (
              <>
                约 <Text className="b">{plan.weeksToGoal}</Text> 周到{" "}
                <Text className="b">{profile.targetWeightKg}</Text> 公斤
              </>
            )}
          </Text>

          {atGoal ? (
            <Icon name="check" size={15} color="#4aa87a" />
          ) : (
            <View className={`plan-pill ${showHow ? "is-open" : ""}`}>
              <Text className="plan-pill-text">定计划</Text>
              {speeds.map((o, i) => (
                <View key={o.key} className={`plan-dot ${i === activeIdx ? "is-on" : ""}`} />
              ))}
            </View>
          )}
        </View>

        {showHow && (
          <View className="plan-panel">
            {!atGoal && (
              <View className="speeds-wrap">
                <View className="speeds">
                  {speeds.map((o) => {
                    const on = o.key === speeds[activeIdx]?.key;
                    return (
                      <View
                        key={o.key}
                        className={`speed ${on ? "is-on" : ""}`}
                        hoverClass="tap"
                        onClick={() => setGoalWeeks(o.goalWeeks)}
                      >
                        <Text className="speed-label">{o.label}</Text>
                        <Text className="speed-weeks">{o.weeks} 周</Text>
                        <Text className="speed-budget">每天 {o.budget}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text className="plan-note">
                  最快就是 {plan.fastestWeeks || 1} 周。再往前压，掉的就不再是脂肪 —— 是肌肉和水，而且一恢复正常吃饭就会回来。
                </Text>
              </View>
            )}
            <Text className="plan-p">
              躺着不动，一天要花 <Text className="b">{plan.bmr}</Text> 大卡；
              起床走路说话，再加 <Text className="b">{plan.neatKcal - plan.bmr}</Text>；
              三样加起来约 <Text className="b">{plan.tdee}</Text> 大卡。
            </Text>
            <Text className="plan-p">
              {atGoal ? (
                <>
                  已经到目标了，环里那个数是维持体重用的 —— 吃到{" "}
                  <Text className="b">{plan.dailyBudgetKcal}</Text> 大卡上下，体重就不动。
                </>
              ) : (
                <>
                  想瘦就得留缺口：每天少吃 <Text className="b">{plan.deficit}</Text> 大卡，剩下的{" "}
                  <Text className="b">{plan.dailyBudgetKcal}</Text> 就是环里那个数。
                </>
              )}
            </Text>
            {!atGoal && (
              <Text className="plan-p">
                {currentWeightKg} 到 {profile.targetWeightKg} 公斤差{" "}
                <Text className="b">
                  {Math.max(0, Math.round((currentWeightKg - profile.targetWeightKg) * 10) / 10)}
                </Text>{" "}
                公斤，按一周掉 <Text className="b">{plan.perWeekKg}</Text> 公斤算，所以是{" "}
                {plan.weeksToGoal} 周。
              </Text>
            )}
          </View>
        )}
      </View>

      {/* 今天吃了 */}
      <View className="sec mt5">
        <View className="sec-head">
          <Text className="sec-title">今天吃了</Text>
          {todayMeals.length > 0 && (
            <Text className="sec-sub tabular">{Math.round(totals.kcal)} 大卡</Text>
          )}
        </View>

        {sorted.length > 0 && (
          <View className="seg">
            {(
              [
                ["meal", "按顿看"],
                ["food", "按热量排"],
              ] as const
            ).map(([k, label]) => (
              <View
                key={k}
                className={`seg-btn ${view === k ? "is-on" : ""}`}
                hoverClass="tap"
                onClick={() => setView(k)}
              >
                <Text className="seg-text">{label}</Text>
              </View>
            ))}
          </View>
        )}

        {sorted.length === 0 ? (
          <View className="empty">
            <Icon name="camera" size={26} color="#b6bdb9" />
            <Text className="empty-text">拍一张就行</Text>
          </View>
        ) : view === "food" ? (
          <View className="rank">
            {!!rankTop && <Text className="rank-top">{rankTop}</Text>}
            {rankShown.map((f, i) => (
              <View key={f.key} className="rank-row">
                <Text className="rank-no" style={{ color: i === 0 ? "#1f8a5b" : "#cfd8d3" }}>
                  {i + 1}
                </Text>
                <View className="rank-mid">
                  <View className="rank-name-row">
                    <Text className="rank-name ellipsis">{f.name}</Text>
                    {!!portionText(f) && (
                      <Text className="rank-portion">
                        {(nameCount.get(f.name) ?? 0) > 1
                          ? `${mealTypeLabel(f.meal)}·${portionText(f)}`
                          : portionText(f)}
                      </Text>
                    )}
                  </View>
                  <View className="rank-track">
                    <View
                      className="rank-fill"
                      style={{
                        width: `${Math.max(3, (f.kcal / rankMax) * 100)}%`,
                        background: i === 0 ? "#1f8a5b" : "#a9c7b6",
                      }}
                    />
                  </View>
                </View>
                <Text className="rank-kcal tabular">{f.kcal}</Text>
              </View>
            ))}
            {ranking.list.length > RANK_PREVIEW && (
              <View className="rank-more" hoverClass="tap" onClick={() => setRankOpen((v) => !v)}>
                <Text className="rank-more-text">
                  {rankOpen ? "收起" : `还有 ${ranking.list.length - RANK_PREVIEW} 样`}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View className="meals">
            {mealShown.map((m) => {
              const dk = drinkKcal(m.drinks);
              const v = liveVerdicts.get(m.id);
              const color = v ? TONE_COLOR[v.tone] : "#33413b";
              const at = new Date(m.eatenAt ?? m.createdAt);
              const time = Number.isNaN(at.getTime())
                ? ""
                : `${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
              return (
                <View key={m.id} className="card meal-card">
                  <View className="meal-top">
                    <View className="meal-left">
                      <View className="meal-meta">
                        <Icon name={SLOT_ICON[m.mealType]} size={15} color={INK_400} />
                        <Text className="meal-meta-text">{mealTypeLabel(m.mealType)}</Text>
                        {!!time && <Text className="meal-time tabular">{time}</Text>}
                      </View>
                      <Text className="meal-items ellipsis">
                        {m.items.map((i) => i.name).join("、")}
                      </Text>
                    </View>
                    <Text className="meal-kcal tabular">{Math.round(m.nutrition.kcal + dk)}</Text>
                  </View>

                  {(dk > 0 || (m.tags && m.tags.length > 0)) && (
                    <View className="meal-tags">
                      {dk > 0 && <Text className="meal-tag">{drinksLabel(m.drinks)}</Text>}
                      {(m.tags ?? []).map((t) => (
                        <Text key={t} className="meal-tag">
                          {TAG_CFG[t].short}
                        </Text>
                      ))}
                    </View>
                  )}

                  {v && verdictOnce.has(m.id) && (
                    <View className="meal-verdict">
                      <Icon name={v.icon as IconName} size={17} color="#1b2320" />
                      <Text className="meal-verdict-short" style={{ color }}>
                        {v.short}
                      </Text>
                      <Text className="meal-verdict-tip ellipsis">{v.tip}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {sorted.length > 1 && (
              <View className="log-more" hoverClass="tap" onClick={() => setLogOpen((v) => !v)}>
                <Text className="log-more-text">
                  {logOpen ? "收起" : `今天还有 ${sorted.length - 1} 顿`}
                </Text>
                <View className={`log-arrow ${logOpen ? "is-open" : ""}`}>
                  <Icon name="chevron" size={14} color={INK_400} />
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      <View className="bottom-space" />

      <BottomNav
        active="eat"
        showCapture
        onCapture={() => Taro.navigateTo({ url: "/pages/capture/index" })}
      />
    </View>
  );
}

/** 一行提醒：结论加粗，怎么做跟在后面变细 */
function NoteRow({
  dot,
  head,
  headColor,
  tail,
  tailColor,
  tailBold,
}: {
  dot: string;
  head: string;
  headColor: string;
  tail?: string;
  tailColor?: string;
  tailBold?: boolean;
}) {
  return (
    <View className="note">
      <View className="note-dot-wrap">
        <View className="note-dot" style={{ background: dot }} />
      </View>
      <Text className="note-head" style={{ color: headColor }}>
        {head}
        {!!tail && (
          <Text
            className={`note-tail ${tailBold ? "is-bold" : ""}`}
            style={{ color: tailColor }}
          >
            {tailBold ? "" : "· "}
            {tail}
          </Text>
        )}
      </Text>
    </View>
  );
}

function MacroBar({
  icon,
  color,
  label,
  value,
  target,
  unit = "g",
  digits = 0,
}: {
  icon: IconName;
  color: string;
  label: string;
  value: number;
  target: number;
  unit?: string;
  /** 盐要留一位：一天 5 克，四舍五入会把 4.6 和 5.4 都写成 5 */
  digits?: number;
}) {
  const ratio = target > 0 ? value / target : 0;
  const pct = Math.min(100, ratio * 100);
  const over = ratio > 1.05;
  const near = !over && ratio >= 0.85;
  const barColor = over ? "#d94f3d" : near ? "#e0a83a" : "#8fae9c";
  const shown = digits > 0 ? value.toFixed(digits).replace(/\.0$/, "") : String(Math.round(value));
  const shownTarget = digits > 0 ? String(target) : String(Math.round(target));

  return (
    <View className="macro">
      <View className="macro-head">
        <Icon name={icon} size={15} color={over ? "#b23c2c" : color} />
        <Text className="macro-label">{label}</Text>
      </View>
      <View className="macro-nums">
        <Text className="macro-val tabular" style={{ color: over ? "#b23c2c" : "#3b4642" }}>
          {shown}
        </Text>
        <Text className="macro-target tabular">
          /{shownTarget}{unit}
        </Text>
      </View>
      <View className="macro-track">
        <View className="macro-fill" style={{ width: `${pct}%`, background: barColor }} />
      </View>
    </View>
  );
}
