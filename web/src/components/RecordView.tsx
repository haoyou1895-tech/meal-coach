"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityLevel,
  ActivityLog,
  FoodItem,
  Meal,
  MealType,
  NutritionPlan,
  Profile,
  WeightLog,
} from "@/lib/types";
import {
  dayBudget,
  mealTypeLabel,
  round,
  snackLabel,
  sumMeals,
  todayStr,
} from "@/lib/nutrition";
import { dateList, latestWeightKg } from "@/lib/store";
import { drinkKcal, drinksLabel } from "@/lib/drinks";
import { deletePhoto, getPhoto, photoIdsOf, putPhoto } from "@/lib/photos";
import { PORTION_STEPS, nearestStep } from "@/lib/portion";
import { compress } from "@/lib/image";
import { sodiumWithTags } from "@/lib/mealTags";
import type { Nutrition } from "@/lib/types";
import { ruleComment } from "@/lib/comment";
import MealPhoto from "./MealPhoto";
import WeightTrend from "./WeightTrend";
import Icon from "./Icon";
import { Sheet, Stepper } from "./ui";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * 一周柱状图的配色：越晚吃颜色越深（顺序即强度），酒单独一档。
 * 不用四种彩色，是不想让"颜色"变成需要背的图例。
 */
const MEAL_SHADE: Record<string, string> = {
  breakfast: "#b6d4c2",
  lunch: "#6ea98a",
  dinner: "#1f8a5b",
  snack: "#c9cfcb",
  drink: "#c4694a",
};

/** 这顿是几点吃的。旧记录没有 eatenAt，退回记录时刻 */
function mealTime(m: Meal): string {
  const raw = m.eatenAt ?? m.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 正在看的大图。带下标是因为一条记录可能有好几张照片 */
interface Gallery {
  srcs: string[];
  index: number;
}

export default function RecordView({
  profile,
  plan,
  meals,
  weights,
  onWeight,
  onDeleteMeal,
  onUpdateMeal,
  autoEditId,
  onAutoEditDone,
  activities,
}: {
  profile: Profile;
  plan: NutritionPlan;
  meals: Meal[];
  weights: WeightLog[];
  /** 每天的活动量。柱状图的预算线要靠它 —— 走一天和坐一天不是同一个额度 */
  activities: ActivityLog[];
  onWeight: (kg: number) => void;
  onDeleteMeal: (id: string) => void;
  onUpdateMeal: (m: Meal) => void;
  /** 从「记一餐」里点「改」跳过来时要打开的那条 */
  autoEditId?: string | null;
  onAutoEditDone?: () => void;
}) {
  const [weightOpen, setWeightOpen] = useState(false);
  const latest = latestWeightKg(weights, profile.weightKg);
  const [draft, setDraft] = useState(latest);

  // 编辑某一条记录
  const [editing, setEditing] = useState<Meal | null>(null);
  const [editType, setEditType] = useState<MealType>("lunch");
  const [editItems, setEditItems] = useState<FoodItem[]>([]);
  /** 正在改名字的那一项；记录页里菜品也可能被认错，跟拍照页同一套做法 */
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameTip, setRenameTip] = useState("");
  const [factors, setFactors] = useState<number[]>([]);
  /**
   * 编辑时的照片，和"原记录里有哪些照片"分开存：
   * 用户可能在编辑里删了又加，只有在按下"保存"时才动库 ——
   * 中途点"不改了"，照片不能跟着少。
   * id 为 null 表示这张是早期版本直接塞在记录里的 base64 图。
   */
  const [editPhotos, setEditPhotos] = useState<
    { id: string | null; src: string }[]
  >([]);
  /**
   * 重新识别拿到的营养值。
   * 一旦重新算过，"按比例缩"的基准就得换成新值 ——
   * 否则删一道菜会被按老照片的比例缩放，数字对不上新算出来的菜。
   */
  const [recalcBase, setRecalcBase] = useState<Nutrition | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcErr, setRecalcErr] = useState("");
  const [addingPhoto, setAddingPhoto] = useState(false);
  /** 照片是从 IndexedDB 异步读的。没读完就保存，会把还没读出来的那些当"被删了" */
  const [photosReady, setPhotosReady] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  /** 点柱状图跳到那天的记录后，让那天闪一下，否则滚过去也不知道看哪儿 */
  const [flashDate, setFlashDate] = useState<string | null>(null);

  const jumpToDay = (date: string) => {
    const el = document.getElementById(`day-${date}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashDate(date);
    window.setTimeout(() => setFlashDate(null), 1800);
  };

  const openEditor = (m: Meal) => {
    setEditing(m);
    setEditType(m.mealType);
    setEditItems(m.items.map((it) => ({ ...it })));
    setFactors(m.items.map(() => 1));
    setEditPhotos([]);
    setRecalcBase(null);
    setRecalcErr("");
    setPhotosReady(false);
    void (async () => {
      const list: { id: string | null; src: string }[] = [];
      if (m.image) list.push({ id: null, src: m.image });
      for (const id of photoIdsOf(m)) {
        const d = await getPhoto(id);
        if (d) list.push({ id, src: d });
      }
      setEditPhotos(list);
      setPhotosReady(true);
    })();
  };

  /** 补拍一张：先压到 720，再进 IndexedDB 拿 id，这样保存前就已经占好位置 */
  const addPhotos = async (files?: FileList | null) => {
    if (!files?.length) return;
    setAddingPhoto(true);
    try {
      const room = Math.max(0, 4 - editPhotos.length);
      const picked = Array.from(files).slice(0, room);
      const added: { id: string | null; src: string }[] = [];
      for (const f of picked) {
        const data = await compress(f);
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
        await putPhoto(id, data);
        added.push({ id, src: data });
      }
      const next = [...editPhotos, ...added];
      setEditPhotos(next);
      // 加了照片就重算：不然新拍到的那盘菜在账上不存在
      if (added.length) void recalc(next);
    } finally {
      setAddingPhoto(false);
    }
  };

  /**
   * 删掉一张。
   *
   * 删完必须重算 —— 用户删的往往正是"这张不算我的"，
   * 账上的菜就该跟着这张图一起消失。不重算的话，
   * 他删了照片、数字没动，下次看只会觉得这软件在瞎记。
   */
  const removePhoto = (i: number) => {
    const next = editPhotos.filter((_, idx) => idx !== i);
    setEditPhotos(next);
    setRecalcErr("");
    if (next.length) {
      void recalc(next);
    } else {
      // 一张都不剩就没有依据了，把上一次的识别结果也一起清掉
      setRecalcBase(null);
    }
  };

  /** 保存时把照片的变化落库：新增的已经在库里，删掉的在这里销毁 */
  const commitPhotos = () => {
    if (!editing) return { ids: [] as string[], legacy: undefined };
    // 还没读完就别动：宁可什么都不改，也不能因为读得慢把照片全删了
    if (!photosReady) {
      return { ids: photoIdsOf(editing), legacy: editing.image };
    }
    const ids = editPhotos
      .map((p) => p.id)
      .filter((v): v is string => typeof v === "string");
    const legacy = editPhotos.find((p) => p.id === null)?.src;
    for (const old of photoIdsOf(editing)) {
      if (!ids.includes(old)) void deletePhoto(old);
    }
    return { ids, legacy };
  };

  /**
   * 拿现在这几张照片重算一遍。
   *
   * 改了照片却不重算，等于让盘子里的菜和账上的数字各说各话 ——
   * 用户删掉了那张"其实是我儿子的"照片，热量就该跟着少。
   */
  const recalc = async (list: { id: string | null; src: string }[] = editPhotos) => {
    if (!list.length || recalcBusy) return;
    setRecalcBusy(true);
    setRecalcErr("");
    try {
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: list.map((p) => p.src),
          image: list[0].src,
          note: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "没算出来，待会儿再试");
      if (!data.items?.length) throw new Error("这几张都没看清，换一张试试");
      setEditItems(data.items as FoodItem[]);
      setFactors((data.items as FoodItem[]).map(() => 1));
      // 重新算过的钠还是按"照片估的 + 标签补的"来，跟记一餐时同一套规矩
      setRecalcBase({
        ...(data.nutrition as Nutrition),
        sodium: sodiumWithTags(
          (data.nutrition as Nutrition)?.sodium ?? 0,
          editing?.tags,
        ),
      });
    } catch (e) {
      setRecalcErr(e instanceof Error ? e.message : "没算出来");
    } finally {
      setRecalcBusy(false);
    }
  };

  // 从「记一餐」弹层里点「改」过来：切到这一页时直接把编辑弹层打开
  useEffect(() => {
    if (!autoEditId) return;
    const target = meals.find((m) => m.id === autoEditId);
    if (target) openEditor(target);
    onAutoEditDone?.();
    // openEditor 每次渲染都是新函数，放进依赖会无限触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId]);

  const edited = useMemo(() => {
    if (!editing) return null;
    const scaledKcal = editItems.reduce(
      (s, it, i) => s + it.kcal * (factors[i] ?? 1),
      0,
    );
    // 删掉一道菜之后热量变少，三大营养素按同样比例缩，够用。
    // 重新识别过就以新值为基准，否则还是按原记录的比例。
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
   *
   * 加餐不是正餐：一盘米饭炒菜改成"加餐"是在改事实，不是在改错字。
   * 所以正餐只能跟正餐互换；加餐本身倒是可以改成某一顿正餐。
   */
  const typeOptions = useMemo(() => {
    if (!editing) return [];
    return MEAL_TYPES.filter((t) => {
      if (t === "snack" && editing.mealType !== "snack") return false;
      if (t === editing.mealType) return true;
      return !meals.some(
        (m) => m.date === editing.date && m.mealType === t && m.id !== editing.id,
      );
    });
  }, [editing, meals]);

  const removeItem = (i: number) => {
    // 最后一道不给删，这种情况应该删整条记录
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, idx) => idx !== i));
    setFactors((prev) => prev.filter((_, idx) => idx !== i));
  };

  const startRename = (i: number) => {
    setRenameIdx(i);
    setRenameDraft(editItems[i]?.name ?? "");
    setRenameTip("");
  };

  /**
   * 改菜名并重估热量。
   *
   * 记录已经存下来了才发现认错菜（比如昨天那顿的"蒸蛋"其实是番茄炒蛋），
   * 以前只能删掉重拍 —— 但照片早就没了，等于让他丢掉一整条记录。
   * 现在直接改名，热量跟着重算，其余营养素按新热量等比重算。
   */
  const commitRename = async (i: number) => {
    const cur = editItems[i];
    const next = renameDraft.trim().slice(0, 20);
    setRenameIdx(null);
    if (!cur || !next || next === cur.name) return;

    setRenameBusy(true);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next, portion: cur.portion }),
      });
      if (!res.ok) throw new Error("estimate failed");
      const data = (await res.json()) as { nutrition?: { kcal?: number } };
      const kcal = Math.round(Number(data?.nutrition?.kcal) || 0);
      if (kcal <= 0) throw new Error("no kcal");
      setEditItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, name: next, kcal } : it)),
      );
      setRenameTip(`「${cur.name}」改成「${next}」，热量按 ${kcal} 大卡重算`);
    } catch {
      setEditItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, name: next } : it)),
      );
      setRenameTip(
        `名字改成「${next}」了，但这会儿没算出新热量，可以调份量`,
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const saveEdit = () => {
    if (!editing || !edited || !editItems.length) return;
    const dayTotal = sumMeals(meals.filter((m) => m.date === editing.date)).kcal;
    const before = dayTotal - editing.nutrition.kcal;
    const photos = commitPhotos();
    onUpdateMeal({
      ...editing,
      photoIds: photos.ids.length ? photos.ids : undefined,
      image: photos.legacy,
      mealType: editType,
      items: editItems.map((it, i) => ({
        ...it,
        kcal: Math.round(it.kcal * (factors[i] ?? 1)),
      })),
      nutrition: edited,
      comment: ruleComment(
        edited,
        profile,
        plan,
        before,
        editType,
        editing.eatenAt ?? editing.createdAt,
      ),
      updatedAt: new Date().toISOString(),
    });
    setEditing(null);
  };

  const last7 = useMemo(() => dateList(7).reverse(), []);
  /**
   * 一天一根柱子看不出"哪顿吃爆了"。改成按餐次叠起来，
   * 一眼能看到是午饭高还是晚饭高。
   *
   * 酒不单独一档 —— 它就是那一顿的一部分，跟半碗米饭一样。
   * 以前给它一个独立颜色，等于在"早/午/晚"之外又立了第四类。
   */
  const dailyKcal = useMemo(
    () =>
      last7.map((d) => {
        const list = meals.filter((m) => m.date === d);
        const parts = (
          ["breakfast", "lunch", "dinner", "snack"] as MealType[]
        )
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
      }),
    [last7, meals],
  );
  /**
   * 每一天各自的预算。
   *
   * 以前图上只有一根水平虚线（全周同一个额度），但预算本来就不是固定值：
   * 走一天工地和坐一天办公室差两百多大卡。首页那三个「没动 / 走动 / 锻炼」
   * 就是当天的活动系数，柱子上方的额度必须跟着它走，否则锻炼那天
   * 明明没吃多，也会显得快贴到线。
   */
  const budgets = useMemo(() => {
    const level = new Map<string, ActivityLevel>();
    for (const a of activities) level.set(a.date, a.level);
    // 按最近一次称的体重算，跟首页一致 —— 掉了两公斤之后，
    // 那两条线还挂在 78 公斤的高度上，图会骗人
    const now = { ...profile, weightKg: latest };
    return last7.map((d) => dayBudget(now, level.get(d) ?? "normal"));
  }, [last7, activities, profile, latest]);

  const maxKcal = Math.max(
    ...budgets.map((b) => b * 1.2),
    ...dailyKcal.map((d) => d.kcal),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>();
    const days = dateList(14);
    for (const d of days) {
      const list = meals
        .filter((m) => m.date === d)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      if (list.length) map.set(d, list);
    }
    return Array.from(map.entries());
  }, [meals]);

  const lost = round(profile.weightKg - latest, 1);

  return (
    <div className="pb-52">
      <header className="safe-top px-5 pb-3 pt-5">
        <h1 className="text-[27px] font-bold tracking-tight">我的记录</h1>
      </header>

      {/* 体重 */}
      <section className="px-5">
        <div className="card">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[15px] font-medium text-ink-500">当前体重</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[46px] font-bold leading-none tabular-nums">
                  {latest}
                </span>
                <span className="text-[16px] font-medium text-ink-500">公斤</span>
              </p>
            </div>
            <button
              onClick={() => {
                setDraft(latest);
                setWeightOpen(true);
              }}
              className="h-12 rounded-xl bg-brand-50 px-5 text-[16px] font-semibold text-brand-600 active:scale-95"
            >
              记体重
            </button>
          </div>

          <div className="mt-4 flex gap-3 border-t border-black/[0.05] pt-4">
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">目标</p>
              <p className="text-[18px] font-semibold tabular-nums">
                {profile.targetWeightKg} kg
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">已减</p>
              <p
                className={`text-[18px] font-semibold tabular-nums ${
                  lost > 0
                    ? "text-brand-500"
                    : lost < 0
                      ? "text-warn-600"
                      : "text-ink-700"
                }`}
              >
                {lost > 0
                  ? `${lost} kg`
                  : lost < 0
                    ? `+${Math.abs(lost)} kg`
                    : "0 kg"}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-ink-300">还剩</p>
              <p className="text-[18px] font-semibold tabular-nums">
                {Math.max(0, round(latest - profile.targetWeightKg, 1))} kg
              </p>
            </div>
          </div>
        </div>
      </section>

      <WeightTrend
        weights={weights}
        targetWeightKg={profile.targetWeightKg}
        onPickDate={jumpToDay}
      />

      {/* 近 7 天热量 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">近 7 天</h2>
        <div className="card">
          <div className="relative flex h-40 items-end gap-1.5">
            {/*
              预算线是**一段一段**的，不是一根通到底的虚线。
              每天的活动量不同，额度就不同：锻炼那天高，没动那天低。
              画成一根水平线，等于假装七天是同一张额度表。
            */}
            {/*
              段与段之间用负边距咬合（列间距是 6px，两边各外扩 3px），
              这样七段连成一条阶梯，而不是七个飘着的小横杠；
              同时列宽仍和柱子一一对齐，不会越往右越偏。
              段之间还要补一根竖线：只有横段的话，高低不同的地方会断开，
              看着像七根飘着的虚线，而不是一条"额度"。
            */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-[104px] items-end gap-1.5">
              {budgets.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 border-t border-dashed border-warn-500/60"
                  style={{
                    height: Math.max(2, Math.round((b / maxKcal) * 104)),
                    marginLeft: i === 0 ? 0 : -3,
                    marginRight: i === budgets.length - 1 ? 0 : -3,
                  }}
                />
              ))}
            </div>
            {budgets.slice(0, -1).map((b, i) => {
              const y1 = Math.max(2, Math.round((b / maxKcal) * 104));
              const y2 = Math.max(2, Math.round((budgets[i + 1] / maxKcal) * 104));
              if (y1 === y2) return null;
              return (
                <div
                  key={`v${i}`}
                  className="pointer-events-none absolute z-10 border-l border-dashed border-warn-500/60"
                  style={{
                    left: `${((i + 1) / budgets.length) * 100}%`,
                    bottom: Math.min(y1, y2),
                    height: Math.abs(y1 - y2),
                  }}
                />
              );
            })}
            {dailyKcal.map((d) => {
              const barH =
                d.kcal === 0
                  ? 4
                  : Math.max(8, Math.round((d.kcal / maxKcal) * 104));
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => jumpToDay(d.date)}
                  disabled={d.kcal === 0}
                  aria-label={`看 ${d.date.slice(5).replace("-", "月")}日 吃了什么`}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5 disabled:cursor-default"
                >
                  <span className="text-[12px] leading-none tabular-nums text-ink-300">
                    {d.kcal > 0 ? d.kcal : ""}
                  </span>
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-md transition-all duration-500 active:opacity-60"
                    style={{
                      height: barH,
                      background: d.kcal === 0 ? "#e7eae8" : undefined,
                    }}
                  >
                    {d.parts.map((p) => (
                      <div
                        key={p.key}
                        style={{
                          height: `${(p.kcal / Math.max(1, d.kcal)) * 100}%`,
                          background: MEAL_SHADE[p.key] ?? "#8fae9c",
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2">
            {dailyKcal.map((d) => (
              <span
                key={d.date}
                className="flex-1 text-center text-[11px] text-ink-300"
              >
                {d.date.slice(8)}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 border-t border-black/[0.05] pt-2.5 text-[12px] text-ink-300">
            {[
              ["早", MEAL_SHADE.breakfast],
              ["午", MEAL_SHADE.lunch],
              ["晚", MEAL_SHADE.dinner],
              ["加", MEAL_SHADE.snack],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
            {/* 不写“预算随运动量变”这种解释，直接给一个同款虚线样例，看图就懂 */}
            <span className="ml-auto flex items-center gap-1">
              <span className="w-3.5 border-t border-dashed border-warn-500/70" />
              预算
            </span>
          </div>
        </div>
      </section>

      {/* 历史 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">吃过的</h2>
        {grouped.length === 0 ? (
          <div className="card flex flex-col items-center py-9">
            <p className="text-[16px] text-ink-500">还没有记录</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, list]) => {
              const total = list.reduce(
                (s, m) => s + m.nutrition.kcal + drinkKcal(m.drinks),
                0,
              );
              return (
                <div
                  key={date}
                  id={`day-${date}`}
                  className={`scroll-mt-3 rounded-2xl outline-offset-4 transition-[outline-color] duration-500 ${
                    flashDate === date
                      ? "outline outline-2 outline-brand-400/70"
                      : "outline outline-0 outline-transparent"
                  }`}
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-[15px] font-semibold text-ink-700">
                      {date === todayStr() ? "今天" : date.slice(5).replace("-", "月") + "日"}
                    </span>
                    <span className="text-[13px] text-ink-300 tabular-nums">
                      {total} 大卡
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3"
                      >
                        <MealPhoto
                          meal={m}
                          className="h-[88px] w-[88px] shrink-0 rounded-xl"
                          onOpen={(srcs, index) => setGallery({ srcs, index })}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-brand-600">
                            {snackLabel(m)}
                            <span className="ml-1.5 font-normal tabular-nums text-ink-500">
                              {mealTime(m)}
                            </span>
                            {m.updatedAt && (
                              <span className="ml-1.5 font-normal text-ink-300">
                                已改过
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[16px] font-medium leading-snug">
                            {m.items.map((i) => i.name).join("、")}
                          </p>
                          <p className="mt-0.5 text-[13px] tabular-nums text-ink-500">
                            {m.nutrition.kcal + drinkKcal(m.drinks)} 大卡
                            {m.drinks?.length
                              ? ` · ${drinksLabel(m.drinks)}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            onClick={() => openEditor(m)}
                            aria-label="修改这条记录"
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 active:scale-95"
                          >
                            <Icon name="edit" size={17} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("删掉这条记录？")) onDeleteMeal(m.id);
                            }}
                            aria-label="删除这条记录"
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.04] text-ink-500 active:scale-95"
                          >
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-8 px-8 text-center text-[12px] leading-relaxed text-ink-300">
        本产品提供饮食参考，不构成医疗建议。
        <br />
        如有疾病请遵医嘱。
      </p>

      {/* 记体重 */}
      <Sheet
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        title="记体重"
      >
        <p className="mb-6 text-center text-[15px] leading-relaxed text-ink-500">
          早上空腹称最准，一天记一次就够
        </p>
        <Stepper
          value={draft}
          onChange={setDraft}
          min={40}
          max={150}
          step={0.1}
          unit="公斤"
          big
        />
        <div className="mt-8">
          <button
            className="btn-primary"
            onClick={() => {
              onWeight(Math.round(draft * 10) / 10);
              setWeightOpen(false);
            }}
          >
            记下了
          </button>
        </div>
      </Sheet>

      {/* 改记录 */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="改这条记录"
      >
        {editing && edited && (
          <div className="pb-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] text-ink-500">
                {editing.date === todayStr() ? "今天" : editing.date}
              </p>
              <p className="text-[26px] font-bold leading-none tabular-nums">
                {edited.kcal}
                <span className="ml-1 text-[14px] font-medium text-ink-500">
                  大卡
                </span>
              </p>
            </div>

            {/*
              照片在这一层也能改。
              以前的编辑只让他改菜名和份量，可是最常见的错法是"拍进来一张不该算的图"，
              或者"少拍了一盘" —— 那时候只能整条删掉重拍，前功尽弃。
              删掉或补一张，会自动按新的一组重算，账上的菜跟着图走。
            */}
            <div className="mt-2 flex items-center gap-2">
              {editPhotos.map((p, i) => (
                <div key={p.id ?? `legacy-${i}`} className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setGallery({
                        srcs: editPhotos.map((x) => x.src),
                        index: i,
                      })
                    }
                    aria-label={`看第 ${i + 1} 张照片`}
                    className="block h-[68px] w-[68px] overflow-hidden rounded-xl active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`删掉第 ${i + 1} 张照片`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-sm active:scale-90"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}

              {editPhotos.length < 4 && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={addingPhoto}
                  className="flex h-[68px] w-[68px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/10 text-ink-300 active:scale-95"
                >
                  <Icon name="plus" size={18} />
                  <span className="text-[11px] leading-none">
                    {addingPhoto ? "压图…" : "加一张"}
                  </span>
                </button>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {recalcBusy ? (
                <span className="text-[12px] text-ink-400">
                  正在按这几张重算…
                </span>
              ) : editPhotos.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => void recalc()}
                    className="text-[12px] font-medium text-brand-600"
                  >
                    按这几张重算
                  </button>
                  <span className="text-[12px] text-ink-300">
                    换过照片会自动算一次
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-ink-300">
                  没有照片，补一张才能重算
                </span>
              )}
              {recalcErr && (
                <span className="text-[12px] text-[#b23c2c]">{recalcErr}</span>
              )}
            </div>

            <p className="mb-2 mt-5 text-[14px] font-medium text-ink-700">
              是哪一顿
            </p>
            <div className="flex gap-2">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setEditType(t)}
                  className={`h-11 flex-1 rounded-xl text-[15px] font-medium transition ${
                    editType === t
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-700 shadow-sm"
                  }`}
                >
                  {mealTypeLabel(t)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              同一顿只能有条记录，已经记过的不在这儿
            </p>

            <div className="mb-2 mt-5 flex items-baseline justify-between">
              <p className="text-[14px] font-medium text-ink-700">吃了什么</p>
              <span className="text-[13px] text-ink-300">
                {editItems.length} 样
              </span>
            </div>
            {(renameBusy || renameTip) && (
              <p
                className={`text-[13px] leading-relaxed ${
                  renameBusy ? "text-ink-400" : "text-brand-600"
                }`}
              >
                {renameBusy ? "正在按新菜名重算热量…" : renameTip}
              </p>
            )}
            <div className="space-y-2">
              {editItems.map((it, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {renameIdx === i ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          /* 一进来就全选：他要改的通常是整个名字，不该先让他删三个字 */
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() => void commitRename(i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setRenameIdx(null);
                          }}
                          maxLength={20}
                          enterKeyHint="done"
                          aria-label="改菜名"
                          className="w-full rounded-lg bg-black/[0.05] px-2 py-1 text-[16px] font-medium text-ink-900 outline-none ring-2 ring-brand-500/40"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRename(i)}
                          aria-label={`${it.name}，点这里改菜名`}
                          className="flex max-w-full items-center gap-1 text-left active:opacity-60"
                        >
                          <span className="truncate text-[16px] font-medium leading-snug">
                            {it.name}
                          </span>
                          <Icon
                            name="edit"
                            size={13}
                            className="shrink-0 text-ink-300"
                          />
                        </button>
                      )}
                      <p className="text-[13px] text-ink-300">
                        {it.portion} · 约{" "}
                        {Math.round(it.kcal * (factors[i] ?? 1))} 大卡
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(i)}
                      disabled={editItems.length <= 1}
                      aria-label={`删掉${it.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-ink-500 active:scale-95 disabled:opacity-20"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  {/*
                    份量改成「几口 / 一半 / 全吃了」。
                    原来是「− 1 份 +」，逼着人把"还剩小半盘"翻译成 0.5 份。
                    拍照确认页早就换成这三个词了，改记录页却还留着加减号 ——
                    同一件事两套交互，用户学一遍不够，还得学第二遍。
                  */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-black/[0.04] pt-2.5">
                    <span className="flex items-baseline gap-1.5 text-[13px] text-ink-300">
                      吃了多少
                      {/* 老记录里存着 1.5 份、2 份这种加减号时代的值，
                          三个档位盖不住它，得如实说出来，别让人以为按错了 */}
                      {!PORTION_STEPS.some((s) => s.v === (factors[i] ?? 1)) && (
                        <span className="tabular-nums text-ink-400">
                          （按 {factors[i]} 份算）
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {PORTION_STEPS.map((s) => {
                        const on = nearestStep(factors[i] ?? 1) === s.v;
                        return (
                          <button
                            key={s.label}
                            onClick={() =>
                              setFactors((prev) =>
                                prev.map((f, idx) => (idx === i ? s.v : f)),
                              )
                            }
                            aria-pressed={on}
                            className={`h-8 rounded-lg px-2.5 text-[13px] font-medium transition active:scale-95 ${
                              on
                                ? "bg-brand-500 text-white"
                                : "bg-black/[0.05] text-ink-700"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {editItems.length <= 1 && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
                只剩一样菜了。想整顿都不要，回上一页点垃圾桶图标。
              </p>
            )}

            <div className="mt-6 space-y-2">
              <button className="btn-primary" onClick={saveEdit}>
                保存修改
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                不改了
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* 看大图，多张可以翻 */}
      {gallery && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90"
          onClick={() => setGallery(null)}
          role="button"
          tabIndex={0}
          aria-label="关闭大图"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              setGallery(null);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gallery.srcs[gallery.index]}
            alt="这顿饭的照片"
            className="max-h-[74vh] max-w-full object-contain"
          />

          {gallery.srcs.length > 1 && (
            <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
              {gallery.srcs.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setGallery({ ...gallery, index: i })}
                  aria-label={`看第 ${i + 1} 张`}
                  className={`h-14 w-14 overflow-hidden rounded-lg transition ${
                    i === gallery.index
                      ? "ring-2 ring-white"
                      : "opacity-45 active:opacity-80"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setGallery(null)}
            aria-label="关闭大图"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/22 text-white backdrop-blur active:scale-95"
            style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <p className="mb-6 mt-4 text-center text-[13px] text-white/55">
            {gallery.srcs.length > 1
              ? `${gallery.index + 1} / ${gallery.srcs.length} · 点下面换着看`
              : "点一下关掉"}
          </p>
        </div>
      )}
    </div>
  );
}
