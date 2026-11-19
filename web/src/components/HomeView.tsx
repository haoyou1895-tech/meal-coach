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
import {
  foodRanking,
  rankSummary,
  type RankedFood,
} from "@/lib/ranking";
import Icon, { type IconName } from "./Icon";
import { CalorieRing } from "./ui";

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
 * 建议卡三格必须写出"是什么"。
 * 上一版只写"一碗""一份""一样"，配上碗、蛋、菜的图标 ——
 * 每一格都缺主语，看的人根本不知道一碗的是饭还是汤。
 * 图标只负责让人扫到，名字必须写全。
 */
type PartKind = "carb" | "meat" | "veg";
const KIND_LABEL: Record<PartKind, string> = {
  carb: "主食",
  meat: "荤菜",
  veg: "蔬菜",
};
const KIND_COLOR: Record<PartKind, string> = {
  carb: "#b0842c",
  meat: "#a3563f",
  veg: "#3f7d5a",
};
const KIND_ICON: Record<PartKind, IconName> = {
  carb: "carb",
  meat: "meat",
  veg: "veg",
};

/**
 * 清单前面的小圆点。
 *
 * 原来这里是图标（盐罐、油滴、蛋…），17px 下全糊成灰疙瘩，
 * 而且每一行都在问"这是什么意思"。一个圆点不解释任何东西，
 * 它只回答一件事：这件事有多急 —— 红 > 琥珀 > 绿。
 * 话已经写在右边了，前面不需要再来一个说不清的名词。
 */
function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

/**
 * 一行提醒：结论加粗，怎么做跟在后面变细。
 *
 * 上一版用"·"把两段拼成一句，结果"蛋白差一半 · 加个蛋或豆腐"在
 * 116 宽的圆旁边正好断在"豆"后面，第二行只剩一个"腐"。
 * 现在结论 15px、补充 13px，同一行放得下，也分得出哪句是判断、哪句是动作。
 */
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
    <div className="flex items-start gap-2">
      <span className="mt-[7px]">
        <Dot color={dot} />
      </span>
      <p className="text-[15px] font-semibold leading-snug" style={{ color: headColor }}>
        {head}
        {tail && (
          <span
            className={
              tailBold ? "ml-1 font-semibold" : "ml-1 font-normal text-ink-400"
            }
            style={{ fontSize: 13, color: tailColor }}
          >
            {tailBold ? "" : "· "}
            {tail}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * 按疾病给一条当日提醒。
 * 这条以前是二十来个字的一句话，现在压到十个字以内 ——
 * 病人不需要被告知"为什么"，医生早就说过了；他需要被提醒"今天注意哪一件"。
 */
function diseaseTip(profile: Profile): { icon: IconName; text: string } | null {
  const d = profile.diseases;
  if (d.includes("hypertension")) return { icon: "salt", text: "腌菜汤别碰" };
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

/**
 * 份量要显示，但"1 份"不算份量 —— 桌上每道菜都是 1 份。
 * 有信息的是"2 两""1 碗""2 个"这种能被记住的单位。
 * 榜单一行本来就短，三个字的位置该留给有用的字。
 */
function portionText(f: RankedFood): string {
  const p = (f.portion ?? "").trim();
  if (!p) return "";
  if (/^(一|1)\s*份$/.test(p)) return "";
  return p;
}


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

  // "预算怎么算的"默认折叠：九成日子他不需要看那三个数字，
  // 但想质疑的时候必须点得到 —— 藏在设置页里就等于没有
  const [showHow, setShowHow] = useState(false);

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
   * 盐已经单独占一行时，"少盐"就不必再说第二遍。
   * 只有盐显示"清淡"时留着它 —— 那时候它说的是"保持住"，不是"注意"。
   */
  const showTip =
    tip && !(tip.icon === "salt" && saltLevel && saltLevel !== "light")
      ? tip
      : null;

  /**
   * 榜单：今天每一样东西按热量排。
   * 和"按顿"不是两种视图偏好，是两个问题 ——
   * 按顿回答"我这顿吃了什么"，按样回答"谁把我顶上去的"。
   */
  const ranking = useMemo(() => foodRanking(todayMeals), [todayMeals]);
  const rankTop = rankSummary(ranking.list);
  /** 同一天两顿都有米饭时，两行长得一模一样，所以重名的才补个餐次 */
  const nameCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of ranking.list) m.set(f.name, (m.get(f.name) ?? 0) + 1);
    return m;
  }, [ranking.list]);
  const [view, setView] = useState<"meal" | "food">("meal");
  /**
   * 按顿看默认只留最近一顿。
   * 一天三顿全摊开是六百多像素，而这三张卡里他此刻只想看一张 ——
   * 刚记的、可能记错的那张。前面两顿他自己知道吃过什么。
   * 需要翻的时候一个按钮，不需要时它不占地方。
   */
  const [logOpen, setLogOpen] = useState(false);
  const mealShown = logOpen ? sorted : sorted.slice(0, 1);
  const [rankOpen, setRankOpen] = useState(false);
  const RANK_PREVIEW = 8;
  const rankShown = rankOpen
    ? ranking.list
    : ranking.list.slice(0, RANK_PREVIEW);
  const rankMax = ranking.list[0]?.kcal ?? 1;

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
      // 酒算进这一顿。漏了它，一顿七百大卡的饭会被评成"这顿合适"，
      // 而这七百里有三百是酒 —— 那不是合适，那是今天最该说的一件事。
      const kcal = m.nutrition.kcal + drinkKcal(m.drinks);
      const v = ruleVerdict(
        { ...m.nutrition, kcal },
        profile,
        plan,
        before,
        m.mealType,
        m.eatenAt ?? m.createdAt,
      );
      // 酒超量不在这条里再说一遍：上面那张清单已经写着"酒精 40 克"，
      // 这里再来一句"酒喝超了"，同一件事说两遍，页面就长了。
      map.set(m.id, v);
      before += kcal;
    }
    return map;
  }, [todayMeals, profile, plan]);

  /**
   * 同一天里同一个结论只说一次。
   *
   * 他一天三顿都在外面吃，展开就会看到三张卡连着写"有点咸 · 下回少放半勺盐"。
   * 那不是三次提醒，是一句话被复读了三遍 —— 而且第一次已经说到位了。
   * 保留最近一顿的说法（默认展开的就是它），更早的重复去掉，
   * 卡片不会因此变空，只是不再用同一句话说第二遍。
   */
  const verdictOnce = useMemo(() => {
    const seen = new Set<string>();
    const keep = new Set<string>();
    for (const m of sorted) {
      const v = liveVerdicts.get(m.id);
      if (!v || seen.has(v.short)) continue;
      seen.add(v.short);
      keep.add(m.id);
    }
    return keep;
  }, [sorted, liveVerdicts]);

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
          ) : todayMeals.length === 0 ? (
            <p className="mt-1 text-[14px] text-ink-300">今天还没记</p>
          ) : null}
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
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white/75 py-2.5"
                >
                  <Icon
                    name={KIND_ICON[p.kind]}
                    size={21}
                    style={{ color: KIND_COLOR[p.kind] }}
                  />
                  <span className="text-[12px] leading-none text-ink-400">
                    {KIND_LABEL[p.kind]}
                  </span>
                  <span className="text-[16px] font-semibold leading-tight text-ink-700">
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

      {/*
        圆和提醒并排。
        圆独占整行的时候，一屏里最贵的那块位置给了一个"每天只变一次"的数字，
        而真正要他动手的事（少喝汤、加个蛋）被挤在下面一行 13px 小字里。
        现在圆缩到 116，右边那几句话放大到 15px、允许换行 ——
        剩下的额度是背景信息，该干什么才是主线。
      */}
      <section className="mt-3 px-5">
        <div className="flex items-center gap-3 rounded-3xl bg-white px-3.5 py-4">
          <CalorieRing
            used={totals.kcal}
            budget={plan.dailyBudgetKcal}
            tone={status.tone}
            size={104}
          />
          <div className="min-w-0 flex-1 space-y-2">
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
            {/* 只在超量时提。喝了多少、喝的什么，已经在"今天吃了"那顿里写着 */}
            {alcoholG > 25 && (
              <NoteRow
                dot="#b23c2c"
                head={`酒 ${alcoholG} 克`}
                headColor="#b23c2c"
                tail="今天到此"
              />
            )}
            {showTip && (
              <NoteRow dot="#1f8a5b" head={showTip.text} headColor="#42514a" />
            )}
            {/* 一条都没有的时候不能说空白：那时候"没什么事"本身就是好消息 */}
            {warnings.length === 0 &&
              !saltLevel &&
              alcoholG <= 25 &&
              !showTip && (
                <p className="text-[15px] leading-snug text-ink-500">
                  今天吃得稳，照这个来
                </p>
              )}
          </div>
        </div>
      </section>

      {/*
        预算这个数字原来是凭空出现的：环里写着一个 1719，
        既没说它怎么来，也没说照这个吃多久能到目标体重。
        所以这里拆成两件事：左边只给结果（几周到几公斤），
        右边一个"怎么算的"，点开才是推导。默认收起。
      */}
      <section className="mt-2 px-5">
        <button
          type="button"
          onClick={() => setShowHow((v) => !v)}
          className="flex w-full items-center justify-between gap-2 py-1 text-left"
        >
          <span className="text-[13px] text-ink-400">
            照这个吃，约{" "}
            <b className="font-semibold tabular-nums text-ink-700">
              {plan.weeksToGoal}
            </b>{" "}
            周到{" "}
            <b className="font-semibold tabular-nums text-ink-700">
              {profile.targetWeightKg}
            </b>{" "}
            公斤
          </span>
          <span className="shrink-0 text-[13px] text-ink-300">
            {showHow ? "收起" : "怎么算的"}
          </span>
        </button>
        {showHow && (
          <div className="mt-2 space-y-2 rounded-2xl bg-black/[0.035] px-3.5 py-3 text-[13px] leading-relaxed text-ink-500">
            <p>
              躺着不动，一天要花{" "}
              <b className="tabular-nums text-ink-700">{plan.bmr}</b> 大卡；
              按「
              {ACTIVITY_OPTIONS.find((o) => o.level === activity)?.label ?? "走动"}
              」算，加上走路说话，约{" "}
              <b className="tabular-nums text-ink-700">{plan.tdee}</b> 大卡。
            </p>
            <p>
              想瘦就得留缺口：每天少吃 400 大卡，剩下的{" "}
              <b className="tabular-nums text-ink-700">{plan.dailyBudgetKcal}</b>{" "}
              就是环里那个数。
            </p>
            <p>
              一周大约掉 0.4 公斤。{profile.weightKg} 到 {profile.targetWeightKg}{" "}
              公斤差{" "}
              <b className="tabular-nums text-ink-700">
                {Math.max(0, Math.round((profile.weightKg - profile.targetWeightKg) * 10) / 10)}
              </b>{" "}
              公斤，所以是 {plan.weeksToGoal} 周。
            </p>
            <p className="text-ink-300">400 大卡，差不多是一碗米饭加一勺油。</p>
          </div>
        )}
      </section>

      {/*
        三个营养素条原来常驻在环形图下面，删了。
        理由不是"不好看"，是它在这个用户身上没有行动含义：
        他关心的是"今天还能吃多少""酒和油超没超"，
        "蛋白质 60/80 克"这个数字他看一眼不会因此改变晚饭。
        而且它重复 —— 脂肪超、碳水超、蛋白不够这三件事，
        下面那张"今天要注意的事"清单已经会说，还带一句该怎么做。
        常驻条只报数字，清单说的是行动。留下会说的那个。
      */}

      <section className="mt-5 px-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold">今天吃了</h2>
          {todayMeals.length > 0 && (
            <span className="text-[14px] tabular-nums text-ink-300">
              {round(totals.kcal)} 大卡
            </span>
          )}
        </div>

        {/*
          两个问题，两个视图。
          "按顿"是记账的读法，"按样"是找凶手的读法。
          默认留在按顿 —— 人一天里想知道"我吃了什么"的次数，
          比想知道"哪一口最贵"的多。
        */}
        {sorted.length > 0 && (
          <div className="mb-2.5 flex gap-1 rounded-xl bg-black/[0.05] p-1">
            {(
              [
                ["meal", "按顿看"],
                ["food", "按热量排"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`h-8 flex-1 rounded-lg text-[14px] font-medium transition ${
                  view === k
                    ? "bg-white text-ink-700 shadow-sm"
                    : "text-ink-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300/50 py-6">
            <Icon name="camera" size={26} className="text-ink-300" />
            <p className="mt-2 text-[15px] text-ink-300">拍一张就行</p>
          </div>
        ) : view === "food" ? (
          /*
            榜单。一行一样东西，条长按最大的那样算 ——
            不按总数算，否则十样东西每根条都只有一小截，看着都一样。
          */
          <div className="rounded-2xl bg-white px-3.5 pb-1">
            {rankTop && (
              <p className="pt-3 text-[14px] leading-snug text-ink-400">
                {rankTop}
              </p>
            )}
            <ul className="mt-1">
              {rankShown.map((f, i) => (
                <li
                  key={f.key}
                  className="flex items-center gap-3 border-b border-black/[0.04] py-2.5 last:border-0"
                >
                  <span
                    className="w-5 shrink-0 text-center text-[13px] font-bold tabular-nums"
                    style={{ color: i === 0 ? "#1f8a5b" : "#cfd8d3" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[16px] font-medium text-ink-700">
                        {f.name}
                      </span>
                      {portionText(f) && (
                        <span className="shrink-0 text-[12px] text-ink-300">
                          {(nameCount.get(f.name) ?? 0) > 1
                            ? `${mealTypeLabel(f.meal)}·${portionText(f)}`
                            : portionText(f)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-black/[0.05]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(3, (f.kcal / rankMax) * 100)}%`,
                          background: i === 0 ? "#1f8a5b" : "#a9c7b6",
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-11 shrink-0 text-right text-[16px] font-semibold tabular-nums text-ink-700">
                    {f.kcal}
                  </span>
                </li>
              ))}
            </ul>
            {ranking.list.length > RANK_PREVIEW && (
              <button
                type="button"
                onClick={() => setRankOpen((v) => !v)}
                className="mb-2 mt-1 w-full rounded-lg py-1.5 text-[13px] font-medium text-brand-600 active:bg-brand-50"
              >
                {rankOpen
                  ? "收起"
                  : `还有 ${ranking.list.length - RANK_PREVIEW} 样`}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {mealShown.map((m) => {
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
                      {dk > 0 && <span>{drinksLabel(m.drinks)}</span>}
                      {/*
                        标签不带图标了。
                        13px 下那张"在外"的小票图标糊成一个方块，旁边的
                        "油炸"也被读成"约 0 油炸" —— 图标在这个尺寸不但没帮上忙，
                        还把一个本来读得懂的词变成了乱码。图标只在 17px 以上用。
                      */}
                      {(m.tags ?? []).map((t) => (
                        <span key={t}>{TAG_CFG[t].short}</span>
                      ))}
                    </div>
                  )}

                  {v && verdictOnce.has(m.id) && (
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
            {sorted.length > 1 && (
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-1 rounded-xl bg-white py-2.5 text-[14px] font-medium text-ink-400 active:bg-black/[0.02]"
              >
                {logOpen ? "收起" : `今天还有 ${sorted.length - 1} 顿`}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    transform: logOpen ? "rotate(180deg)" : "none",
                    transition: "transform .2s",
                  }}
                >
                  <path
                    d="M6 9.5l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </section>

      {/*
        运动量降权，但不删。
        它只改"预算"这一个数字，却原来占着一张白卡 + 三个 44px 大按钮，
        视觉上跟"今天吃了"平起平坐 —— 那是一天里最重的事吗？不是。
        现在压成一行 13px 小字，位置还在原地：想改的人扫一眼就找到，
        不想改的人直接滑过去，不占视线。
      */}
      <section className="mt-3 px-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-ink-300">今天动了多少</span>
          <div className="flex gap-1">
            {ACTIVITY_OPTIONS.map((o) => (
              <button
                key={o.level}
                type="button"
                onClick={() => onActivity(o.level)}
                className={`h-8 rounded-lg px-3 text-[13px] font-medium transition ${
                  activity === o.level
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-300 active:bg-black/[0.03]"
                }`}
              >
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
