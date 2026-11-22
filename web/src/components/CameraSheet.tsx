"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Drink,
  DrinkKind,
  FoodItem,
  Meal,
  MealTag,
  MealType,
  NoteCheck,
  Nutrition,
  NutritionPlan,
  Profile,
  RecognizeResult,
} from "@/lib/types";
import { guessMealType, mealTypeLabel, todayStr } from "@/lib/nutrition";
import { DRINK_CFG, DRINK_KINDS, drinkKcal } from "@/lib/drinks";
import { TAG_CFG, TAG_LIST, saltGram, sodiumWithTags } from "@/lib/mealTags";
import { ruleComment, ruleVerdict } from "@/lib/comment";
import { putPhoto } from "@/lib/photos";
import { compress, makeThumb } from "@/lib/image";
import { Sheet } from "./ui";
import Icon, { type IconName } from "./Icon";
import VoiceInput from "./VoiceInput";

type Phase = "idle" | "working" | "result" | "error";

const VTONE = { good: "#1f8a5b", warn: "#a9631a", over: "#b23c2c" };

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * 一次最多几张。
 * 四张够拍完一桌菜，再多模型也看不过来，压缩和上传还会拖过 60 秒的时限。
 */
const MAX_SHOTS = 4;

/**
 * 份量的三档，用词不用数。
 *
 * 上一版是「− 1 份 +」，步进 0.5。那个设计假设用户会在心里换算
 * "我大概吃了 0.5 份" —— 而人在饭桌上想的是"还剩半盘"，或者
 * "我就夹了两筷子"。数字是给机器看的，词才是给人用的。
 *
 * 为什么只有三档、没有"更多"：
 * 误差的大头是"没吃完"，不是"吃了两份"。真吃了两碗饭的人极少，
 * 而为了极少数情况多摆一个按钮，会让每道菜都变复杂。
 * 舍掉"更多"，换来一眼就懂的三个词。
 */
const PORTION_STEPS = [
  { v: 0.25, label: "几口" },
  { v: 0.5, label: "一半" },
  { v: 1, label: "全吃了" },
] as const;

/** 压缩图片，避免上传大图拖慢识别 */

export default function CameraSheet({
  open,
  onClose,
  profile,
  plan,
  dayKcalBefore,
  todayMeals,
  onSave,
  onEditMeal,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  plan: NutritionPlan;
  dayKcalBefore: number;
  /** 今天的记录，用于判断这个餐次是不是已经记过 */
  todayMeals: Meal[];
  onSave: (m: Meal) => void;
  /** 这顿已经记过时，给一个直接去改的入口 */
  onEditMeal?: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** 相册入口：不能强制调摄像头，补记昨天的饭、别人发来的照片都得能选 */
  const galleryRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string>("");
  /** 这一顿拍了几张。多张一起识别，预览只展示第一张 */
  const [shots, setShots] = useState<string[]>([]);
  const [mealType, setMealType] = useState<MealType>(guessMealType());
  const [items, setItems] = useState<FoodItem[]>([]);
  const [base, setBase] = useState<Nutrition | null>(null);
  const [factors, setFactors] = useState<number[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [demo, setDemo] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [note, setNote] = useState("");
  /**
   * 每一道菜是否"算数"。
   * 照片里看得见的默认算数；只来自他那句话的默认不算 ——
   * 他说一句就能凭空多出三百大卡的话，这个账本就没有意义了。
   */
  const [confirmed, setConfirmed] = useState<boolean[]>([]);
  /** 描述和照片对不上的地方，拿到就要问一句 */
  const [noteCheck, setNoteCheck] = useState<NoteCheck | null>(null);
  /** 这顿喝了什么、盐从哪来 —— 照片拍不出来的两样，只能问 */
  const [drinks, setDrinks] = useState<Drink[]>([]);
  /** 酒默认收起：不是每顿都喝，不该每顿都问 */
  const [drinkOpen, setDrinkOpen] = useState(false);
  const [tags, setTags] = useState<MealTag[]>([]);
  const [zoom, setZoom] = useState(false);
  /** 写照片到本地仓库是异步的，加个锁防止连点记两遍 */
  const [saving, setSaving] = useState(false);
  /** 打开面板那一刻的钟点，用来判断"加餐"到底是下午茶还是宵夜 */
  const [hour, setHour] = useState<number | null>(null);
  /** 正在改名字的那一项；null 表示没有在改 */
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  /** 改完之后的一句反馈，要说清热量到底跟着变了没有 */
  const [renameTip, setRenameTip] = useState("");

  /** 这个餐次今天是否已经记过；记过就只能往这顿里加，不再新增一条 */
  const existing = todayMeals.find((m) => m.mealType === mealType);
  /** 已记那顿的总热量，含酒。不含酒的话，"720 → 1010" 这种提示会对不上账 */
  const existingKcal = existing
    ? existing.nutrition.kcal + drinkKcal(existing.drinks)
    : 0;

  /**
   * 每次打开面板都重新猜一次餐次。
   *
   * 以前这个猜测只在组件挂载时算一次，可这个面板是常驻的 ——
   * 早上八点打开过页面，晚上十点再点"拍一张"，它还记着"早餐"，
   * 于是十点钟被告知"这算午饭了，早饭 7 点前后吃"。人没疯，逻辑疯了。
   *
   * 只在"关→开"这一刻猜，不跟着每次重渲染猜：
   * 否则他手动把餐次改成晚餐，下一次重渲染又会被改回去。
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const now = new Date();
      setMealType(guessMealType(now, todayMeals.map((m) => m.mealType)));
      setHour(now.getHours());
    }
    wasOpen.current = open;
  });

  const reset = () => {
    setPhase("idle");
    setPreview("");
    setShots([]);
    setItems([]);
    setBase(null);
    setFactors([]);
    setErrMsg("");
    setDemo(false);
    setNote("");
    setDrinks([]);
    setDrinkOpen(false);
    setTags([]);
    setZoom(false);
    setConfirmed([]);
    setNoteCheck(null);
  };

  const handleFile = async (files?: FileList | File[] | null) => {
    const picked = files ? Array.from(files).slice(0, MAX_SHOTS) : [];
    if (!picked.length) return;
    setPhase("working");
    setErrMsg("");
    try {
      /*
        一张照片装不下一桌菜。
        圆桌一米五，他坐在一角，镜头只够拍面前三盘 —— 所以允许一次选多张，
        一起送去识别。多张走同一次请求，不是拍一张等一次：
        一次调用十秒，三张就是三十秒，没人会在饭桌上等。
      */
      const urls = await Promise.all(picked.map((f) => compress(f)));
      setShots(urls);
      setPreview(urls[0]);
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: urls, image: urls[0], note }),
      });
      const data = (await res.json()) as RecognizeResult;
      if (!res.ok || data.error === "没有收到图片") {
        throw new Error(data.error || "识别失败，请重试");
      }
      if (!data.items || data.items.length === 0) {
        setErrMsg(data.error || "这张没看清，能再拍一张吗");
        setPhase("error");
        return;
      }
      setItems(data.items);
      setFactors(data.items.map(() => 1));
      // 照片里看不到的那几项先挂起，等用户点头再算热量
      setConfirmed(data.items.map((it) => it.seen !== false));
      // 识别到的酒直接落在列表里，不用他再点一次"喝酒了？"
      if (data.drinks?.length) {
        setDrinks(data.drinks);
        setDrinkOpen(false);
      }
      setNoteCheck(data.noteCheck ?? null);
      setBase(data.nutrition);
      setConfidence(data.confidence ?? 0.6);
      setDemo(!!data.demo);
      if (data.error) setErrMsg(data.error);
      setPhase("result");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "识别失败，请重试");
      setPhase("error");
    }
  };

  /**
   * 没确认的那几项按 0 算。
   * 不是为了少算，是因为"他说了但我没看见"的东西，在得到他点头之前
   * 没有资格进这本账。
   */
  const factorOf = (i: number) =>
    confirmed[i] === false ? 0 : (factors[i] ?? 1);

  /** 按倍率重算营养 */
  const computed: Nutrition = (() => {
    if (!base || !items.length) {
      return { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 };
    }
    const scaledKcal = items.reduce(
      (s, it, i) => s + it.kcal * factorOf(i),
      0,
    );
    const ratio = base.kcal > 0 ? scaledKcal / base.kcal : 1;
    const round = (n: number) => Math.round(n * ratio);
    return {
      kcal: Math.round(scaledKcal),
      protein: round(base.protein),
      carb: round(base.carb),
      fat: round(base.fat),
      sodium: round(base.sodium),
    };
  })();

  /** 挂起待确认的条目：他说了，但照片里没看见 */
  const pending = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => confirmed[i] === false);

  /**
   * 冲突时列表里只留照片里看得到的。
   * 上面那句已经说了"只按照片算"，下面再挂三条灰的让他一条条点，
   * 属于让他替系统干活 —— 他刚说完自己吃了什么，现在又要亲手一条条否掉。
   */
  const visible = items
    .map((it, i) => ({ it, i }))
    .filter(
      ({ i }) => noteCheck?.verdict !== "conflict" || confirmed[i] !== false,
    );
  const pendingKcal = pending.reduce(
    (s, { it, i }) => s + Math.round(it.kcal * (factors[i] ?? 1)),
    0,
  );

  /**
   * 他说了、模型也在 unseen 里报出来了，却没有对应条目的情况。
   * 正常不该出现（提示词要求必须列条目），但模型不听话时，
   * 至少这一句要让他看见 —— 总比默默吞掉强。
   */
  const orphanUnseen = (noteCheck?.unseen ?? []).filter(
    (n) =>
      !items.some(
        (it) =>
          it.seen === false && (it.name.includes(n) || n.includes(it.name)),
      ),
  );

  /**
   * 酒也是这顿的一部分，判断时不能漏 ——
   * 半斤白酒七百多大卡，漏了它，"这顿合适"就是一句假话。
   */
  const withDrinks: Nutrition = {
    ...computed,
    kcal: computed.kcal + drinkKcal(drinks),
  };

  /**
   * 这一顿的盐，实时跟着勾选变。
   * 用户勾一个"有汤"，上面的数字立刻从 2.4 跳到 3.3 ——
   * 这个即时反馈比任何解释都管用，他才知道勾了会发生什么。
   */
  const saltMg = sodiumWithTags(computed.sodium, tags);
  const saltG = saltGram(saltMg);
  const saltLimitMg = plan?.sodiumLimitMg ?? 2000;
  const saltTone =
    saltMg > saltLimitMg ? "#b23c2c" : saltMg > saltLimitMg * 0.6 ? "#a9631a" : "#4a7d63";

  const comment = ruleComment(
    withDrinks,
    profile,
    plan,
    dayKcalBefore,
    mealType,
    new Date(),
  );
  // 存的是整句，界面上显示的是图标 + 四个字。同一套规则，两种呈现
  const verdict = ruleVerdict(
    withDrinks,
    profile,
    plan,
    dayKcalBefore,
    mealType,
    new Date(),
  );

  const setFactor = (i: number, v: number) => {
    setFactors((prev) => prev.map((f, idx) => (idx === i ? v : f)));
  };

  const startRename = (i: number) => {
    setRenameIdx(i);
    setRenameDraft(items[i]?.name ?? "");
    setRenameTip("");
  };

  /**
   * 改名，并把热量跟着重算。
   *
   * 只改名不重算等于没修：他要改，就是因为"蒸蛋"和"番茄炒蛋"差着近一倍的热量。
   * 名字对了、数字还是错的，这本账依然是假的。
   *
   * 所以名字一落，就去问一次"这份大概多少卡"。算得出来就换掉，
   * 算不出来也把名字留下 —— 名字写错是事实错误，热量不准至少还能靠份量兜。
   */
  const commitRename = async (i: number) => {
    const cur = items[i];
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
      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, name: next, kcal } : it)),
      );
      setRenameTip(
        `「${cur.name}」改成「${next}」，热量按 ${kcal} 大卡重算`,
      );
    } catch {
      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, name: next } : it)),
      );
      setRenameTip(
        `名字改成「${next}」了，但这会儿没算出新热量，可以先调份量`,
      );
    } finally {
      setRenameBusy(false);
    }
  };

  /** 用户说"不算"，就把这几项连同分数一起摘掉，账上不留痕 */
  const dropPending = () => {
    const keep = items.map((_, i) => confirmed[i] !== false);
    setItems(items.filter((_, i) => keep[i]));
    setFactors(factors.filter((_, i) => keep[i]));
    setConfirmed(confirmed.filter((_, i) => keep[i]));
    setNoteCheck(null);
  };

  const addDrink = (kind: DrinkKind) => {
    setDrinks((prev) => {
      const i = prev.findIndex((d) => d.kind === kind);
      if (i < 0) return [...prev, { kind, count: 1 }];
      const next = [...prev];
      next[i] = { ...next[i], count: next[i].count + 1 };
      return next;
    });
  };

  const changeDrink = (kind: DrinkKind, delta: number) => {
    setDrinks((prev) =>
      prev
        .map((d) => (d.kind === kind ? { ...d, count: d.count + delta } : d))
        .filter((d) => d.count > 0),
    );
  };

  const toggleTag = (t: MealTag) => {
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const save = async () => {
    if (saving) return;
    // 一道菜都没确认就别存了，存进去也是一条空账
    if (!items.some((_, i) => confirmed[i] !== false)) {
      setErrMsg("一道菜都没算上，先点「算了」或者重拍一张");
      return;
    }
    setSaving(true);
    try {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now());

      // 照片进 IndexedDB（容量大、可以存清晰的），文字记录进 localStorage。
      // 万一浏览器禁用了 IndexedDB，退回到 480px 小图，照片不至于丢。
      let photoIds: string[] = [];
      let image: string | undefined;
      if (preview) {
        const stored = await putPhoto(id, preview);
        if (stored) {
          photoIds = [id];
        } else {
          image = (await makeThumb(preview)) || undefined;
        }
      }

      const meal: Meal = {
        id,
        date: todayStr(),
        mealType,
        // 只记他确认过的。说了但没算数的那几项不进账本，
        // 否则"我随口说了一句"就会永久改掉他这顿饭的热量。
        items: items
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => confirmed[i] !== false)
          .map(({ it, i }) => ({
            name: it.name,
            portion: it.portion,
            kcal: Math.round(it.kcal * (factors[i] ?? 1)),
          })),
        // 模型估的钠是地基，标签只往上补。
        // 不勾也有盐 —— 一盘正常炒菜本来就有，勾选回答的是"还有没有别的"。
        nutrition: { ...computed, sodium: sodiumWithTags(computed.sodium, tags) },
        comment,
        adjusted: factors.some((f) => f !== 1),
        confidence,
        createdAt: new Date().toISOString(),
        // 拍照记餐这件事本身就是"正在吃饭"，所以吃的时间就是现在，不让用户填。
        eatenAt: new Date().toISOString(),
        photoIds: photoIds.length ? photoIds : undefined,
        image,
        drinks: drinks.length ? drinks : undefined,
        tags: tags.length ? tags : undefined,
      };
      onSave(meal);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
      open={open}
      onClose={() => {
        reset();
        // 重置餐次为当前时段
        setMealType(guessMealType());
        onClose();
      }}
      title={
        phase === "result"
          ? "这一餐"
          : phase === "working"
            ? "正在看照片"
            : "记一餐"
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files);
          e.target.value = "";
        }}
      />
      {/* 不带 capture 就是"从相册选"：补记昨天、别人发来的照片都靠它。
          相册这条路支持多选 —— 一桌菜拍不完，就让他们一次选几张一起认。 */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files);
          e.target.value = "";
        }}
      />

      {phase === "idle" && (
        <div className="pb-4">
          <div className="mb-5 flex gap-2">
            {MEAL_TYPES.map((t) => {
              const recorded = todayMeals.some((m) => m.mealType === t);
              return (
                <button
                  key={t}
                  onClick={() => setMealType(t)}
                  className={`relative h-12 flex-1 rounded-xl text-[16px] font-medium transition ${
                    mealType === t
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-700 shadow-sm"
                  }`}
                >
                  <span className="flex flex-col items-center justify-center leading-tight">
                    <span>{mealTypeLabel(t)}</span>
                    {/* "加餐"是个分类词，不是人话：下午三点是下午茶，十一点是宵夜 */}
                    {t === "snack" && hour !== null && (
                      <span
                        className={`text-[10px] font-normal ${
                          mealType === t ? "text-white/70" : "text-ink-300"
                        }`}
                      >
                        {hour >= 17 || hour < 3 ? "宵夜" : "下午茶"}
                      </span>
                    )}
                  </span>
                  {recorded && (
                    <span
                      className={`absolute bottom-0.5 right-1.5 text-[10px] ${
                        mealType === t ? "text-white/75" : "text-brand-600/70"
                      }`}
                    >
                      已记
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/*
            这顿如果已经记过，就把他之前填的东西直接摊出来。
            以前是让他对着一个空表单重新拍 —— 明明十分钟前刚记过，
            打开还是一张白纸，人会以为没存上，于是再记一遍。
          */}
          {existing ? (
            <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-brand-600" />
                <span className="flex-1 text-[15px] font-semibold text-brand-700">
                  {mealTypeLabel(mealType)}已记 {existingKcal} 大卡
                </span>
                {onEditMeal && (
                  <button
                    type="button"
                    onClick={() => onEditMeal(existing.id)}
                    className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] font-medium text-brand-600 active:scale-95"
                  >
                    <Icon name="edit" size={13} />
                    改
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[15px] leading-snug text-ink-600">
                {existing.items.map((i) => i.name).join("、")}
              </p>
              <p className="mt-1 text-[13px] text-ink-400">
                下面拍的会加进这一顿
              </p>
            </div>
          ) : null}

          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[15px] font-medium text-ink-700">
                这顿吃了啥？
              </span>
              <span className="text-[13px] tabular-nums text-ink-300">
                {note.length > 0 ? `${note.length}/60` : ""}
              </span>
            </div>
            <textarea
              value={note}
              maxLength={60}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如：一碗米饭、红烧肉、炒青菜"
              className="w-full resize-none rounded-xl bg-white px-4 py-3 text-[17px] leading-relaxed text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <VoiceInput
              onText={(t) =>
                setNote((prev) => (prev ? `${prev}、${t}` : t).slice(0, 60))
              }
            />
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50 px-6 py-8 transition active:scale-[0.99]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 8.5A2.5 2.5 0 015.5 6h1.2a2 2 0 001.7-1l.4-.7a1 1 0 01.9-.5h5.6a1 1 0 01.9.5l.4.7a2 2 0 001.7 1h1.2A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-9z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle cx="12" cy="12.8" r="3.6" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </span>
            <span className="text-[19px] font-semibold text-brand-600">
              拍一张照片
            </span>
            <span className="text-[15px] text-ink-500">
              我帮您算这顿有多少大卡
            </span>
          </button>

          <button
            onClick={() => galleryRef.current?.click()}
            className="mt-2.5 w-full rounded-2xl bg-white py-3.5 text-[16px] font-medium text-brand-600 shadow-sm transition active:scale-[0.99]"
          >
            从相册选
            <span className="ml-1 text-[14px] font-normal text-ink-300">
              可多选，一桌菜拍不完就选几张
            </span>
          </button>

        </div>
      )}

      {phase === "working" && (
        <div className="flex flex-col items-center py-8">
          {/* 一次选了几张就都摆出来：他得看见自己那几张都进去了，
              否则手机卡一下、少认一张，他不会知道 */}
          {shots.length > 1 ? (
            <div className="flex w-full items-center justify-center gap-2">
              {shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={s}
                  alt={`第 ${i + 1} 张`}
                  className="h-24 w-24 rounded-xl object-cover"
                />
              ))}
            </div>
          ) : (
            preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="刚拍的照片"
                className="h-44 w-44 rounded-2xl object-cover"
              />
            )
          )}
          <div className="mt-6 flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500" />
          </div>
          <p className="mt-4 text-[17px] font-medium text-ink-700">
            {shots.length > 1 ? `正在看这 ${shots.length} 张` : "正在看这些菜…"}
          </p>
          <p className="mt-1 text-[14px] text-ink-300">一般 5–10 秒</p>
        </div>
      )}

      {phase === "error" && (
        <div className="py-6">
          <p className="text-center text-[17px] leading-relaxed text-ink-700">
            {errMsg || "这张没看清，能再拍一张吗"}
          </p>
          <div className="mt-6 space-y-3">
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>
              重拍一张
            </button>
            <button className="btn-ghost" onClick={reset}>
              换个方式
            </button>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="pb-2">
          <div className="flex items-start gap-3">
            {preview && (
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label="看大图"
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl active:scale-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="刚拍的照片"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-ink-500">
                {mealTypeLabel(mealType)} · 大约
              </p>
              {demo ? (
                <p className="text-[34px] font-bold leading-tight text-warn-500">
                  示例数据
                </p>
              ) : (
                <p className="text-[38px] font-bold leading-tight tabular-nums">
                  {withDrinks.kcal}
                  <span className="ml-1 text-[16px] font-medium text-ink-500">
                    大卡
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-lg bg-black/[0.04] px-3 py-1.5 text-[14px] font-medium text-brand-600 active:scale-95"
            >
              重拍
            </button>
          </div>

          {demo && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-warn-100 px-3 py-3">
              <svg
                className="mt-0.5 shrink-0 text-warn-600"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M8 4.6v4.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
              </svg>
              <p className="text-[13px] leading-relaxed text-warn-600">
                <span className="font-semibold">未接识别服务。</span>
                下面这些菜名和热量是固定示例，不是从这张照片认出来的。
                {errMsg && (
                  <span className="mt-1 block opacity-70">{errMsg}</span>
                )}
              </p>
            </div>
          )}

          {/*
            他说了、但照片里没有的东西，不能闷头算进去。
            以前的做法是直接采纳 —— 他说"还喝了碗汤"，账上就凭空多出两百大卡，
            而没人会记得自己说过这句话。
          */}
          {noteCheck?.verdict === "conflict" && (
            <div className="mt-3 rounded-2xl bg-[#fdecea] px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Icon name="alert" className="mt-0.5 shrink-0 text-[#b23c2c]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-[#b23c2c]">
                    这照片和您说的对不上
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug text-[#b23c2c]/75">
                    下面只按照片里的算。
                    {noteCheck.unseen.length > 0 &&
                      `「${noteCheck.unseen.join("、")}」没算进去。`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={dropPending}
                  className="h-11 flex-1 rounded-xl bg-[#b23c2c] text-[15px] font-semibold text-white active:scale-[0.98]"
                >
                  就按照片记
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="h-11 flex-1 rounded-xl bg-white text-[15px] font-semibold text-[#b23c2c] active:scale-[0.98]"
                >
                  重拍
                </button>
              </div>
            </div>
          )}

          {noteCheck?.verdict !== "conflict" &&
            (pending.length > 0 || orphanUnseen.length > 0) && (
            <div className="mt-3 rounded-2xl bg-[#fff4e5] px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Icon name="eyeOff" className="mt-0.5 shrink-0 text-[#a9631a]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold leading-snug text-[#a9631a]">
                    照片里没看见
                    {(pending.length > 0
                      ? pending.map((p) => p.it.name)
                      : orphanUnseen
                    ).join("、")}
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug text-[#a9631a]/75">
                    {pending.length === 0
                      ? "这顿先不算，您看要不要重拍一张把它拍进去"
                      : pendingKcal > 0
                        ? `算上的话，这顿多 ${pendingKcal} 大卡`
                        : "要算上吗？"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {pending.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmed(items.map(() => true))}
                      className="h-11 flex-1 rounded-xl bg-[#a9631a] text-[15px] font-semibold text-white active:scale-[0.98]"
                    >
                      我确实吃了
                    </button>
                    <button
                      type="button"
                      onClick={dropPending}
                      className="h-11 flex-1 rounded-xl bg-white text-[15px] font-semibold text-[#a9631a] active:scale-[0.98]"
                    >
                      不算
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="h-11 flex-1 rounded-xl bg-[#a9631a] text-[15px] font-semibold text-white active:scale-[0.98]"
                    >
                      重拍一张
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteCheck(null)}
                      className="h-11 flex-1 rounded-xl bg-white text-[15px] font-semibold text-[#a9631a] active:scale-[0.98]"
                    >
                      就这样记
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {noteCheck?.verdict !== "conflict" &&
            pending.length === 0 &&
            orphanUnseen.length === 0 && (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
                {noteCheck && noteCheck.extraInPhoto.length > 0
                  ? `照片里还有${noteCheck.extraInPhoto.join("、")}，也一起算上了`
                  : "描述和照片对得上"}
              </p>
            )}

          {existing && (
            <div className="mt-4 rounded-xl bg-warn-100 px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-warn-600">
                {mealTypeLabel(mealType)}已记{" "}
                {existingKcal} 大卡，这次会
                <span className="font-semibold">加进那一顿</span>
              </p>
            </div>
          )}

          {(renameBusy || renameTip) && (
            <p
              className={`mt-4 text-[13px] leading-relaxed ${
                renameBusy ? "text-ink-400" : "text-brand-600"
              }`}
            >
              {renameBusy ? "正在按新菜名重算热量…" : renameTip}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {visible.map(({ it, i }) => {
              const off = confirmed[i] === false;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                    off
                      ? "border border-dashed border-[#d8b98e] bg-[#fffaf2]"
                      : "bg-white"
                  }`}
                >
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
                        className="w-full rounded-lg bg-black/[0.05] px-2 py-1 text-[17px] font-medium text-ink-900 outline-none ring-2 ring-brand-500/40"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(i)}
                        aria-label={`${it.name}，点这里改菜名`}
                        className="flex max-w-full items-center gap-1 text-left active:opacity-60"
                      >
                        <span
                          className={`truncate text-[17px] font-medium ${
                            off ? "text-ink-300" : ""
                          }`}
                        >
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
                      {off
                        ? "照片里没看见"
                        : (factors[i] ?? 1) === 1
                          ? `${it.portion} · 约 ${Math.round(it.kcal)} 大卡`
                          : `约 ${Math.round(it.kcal * (factors[i] ?? 1))} 大卡`}
                    </p>
                  </div>
                  {off ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmed((prev) =>
                          prev.map((v, idx) => (idx === i ? true : v)),
                        )
                      }
                      className="shrink-0 rounded-lg bg-[#a9631a] px-3 py-2 text-[14px] font-semibold text-white active:scale-95"
                    >
                      算上
                    </button>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      {PORTION_STEPS.map((s) => {
                        const active = (factors[i] ?? 1) === s.v;
                        return (
                          <button
                            key={s.v}
                            type="button"
                            onClick={() => setFactor(i, s.v)}
                            className={`h-8 rounded-lg px-2 text-[12px] font-medium transition active:scale-95 ${
                              active
                                ? "bg-brand-500 text-white"
                                : "bg-black/[0.05] text-ink-500"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/*
              酒跟菜一样，就是列表里的一条。
              以前它单独一块"喝酒了？"，等于在早午晚餐之外又开了第五个门类 ——
              用户不该为了记一杯酒，先学会"这个 App 把酒分开放"。
              现在它和"红烧肉"完全同构：有名字、有份量、有热量、能加减。
            */}
            {drinks.map((d) => {
              const cfg = DRINK_CFG[d.kind];
              return (
                <div
                  key={d.kind}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium">
                      {cfg.label}
                    </p>
                    <p className="text-[13px] text-ink-300">
                      {d.count} {cfg.unit} · 约 {cfg.kcalPerUnit * d.count} 大卡
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => changeDrink(d.kind, -1)}
                      aria-label={`${cfg.label}减一${cfg.unit}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.05] text-[18px] font-bold text-ink-700 active:scale-95"
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-[14px] font-semibold tabular-nums">
                      {d.count} {cfg.unit}
                    </span>
                    <button
                      onClick={() => changeDrink(d.kind, 1)}
                      aria-label={`${cfg.label}加一${cfg.unit}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.05] text-[18px] font-bold text-ink-700 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 没喝就不占地方，只留一个不催人的入口 */}
            {drinkOpen ? (
              <div className="rounded-2xl bg-white px-3 py-3">
                <div className="flex gap-2">
                  {DRINK_KINDS.map((k) => {
                    const on = drinks.some((d) => d.kind === k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => addDrink(k)}
                        className={`h-11 flex-1 rounded-xl text-[15px] font-medium transition active:scale-[0.97] ${
                          on
                            ? "bg-[#fdecea] text-[#b23c2c]"
                            : "bg-black/[0.04] text-ink-700"
                        }`}
                      >
                        {DRINK_CFG[k].label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setDrinkOpen(false)}
                  className="mt-2 h-9 w-full rounded-lg text-[13px] font-medium text-ink-300 active:bg-black/[0.04]"
                >
                  收起
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDrinkOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink-300/40 py-3 text-[15px] text-ink-400 active:scale-[0.99]"
              >
                <Icon name="alcohol" size={16} />
                {drinks.length > 0 ? "再加一种" : "加了酒"}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3.5">
            <div className="flex items-center gap-1.5">
              <Icon
                name={verdict.icon as IconName}
                size={18}
                className="shrink-0"
                // 图标跟着判断走：合适是绿的，有问题是橙的，别让"有点咸"配个绿勾
                style={{ color: VTONE[verdict.tone] }}
              />
              <span
                className="text-[17px] font-semibold"
                style={{ color: VTONE[verdict.tone] }}
              >
                {verdict.short}
              </span>
              <span className="truncate text-[14px] text-ink-400">
                {verdict.tip}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Macro
              icon="protein"
              name="蛋白质"
              value={computed.protein}
              unit="g"
              color="#a3563f"
            />
            <Macro
              icon="carb"
              name="碳水"
              value={computed.carb}
              unit="g"
              color="#b0842c"
            />
            <Macro
              icon="fat"
              name="脂肪"
              value={computed.fat}
              unit="g"
              color="#7d8b5e"
            />
          </div>

          {confidence > 0 && confidence < 0.5 && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
              看不太清，数字是估的 — 点加减改一下
            </p>
          )}

          {/*
            「盐从哪来」这个标题问的是来源，用户读起来像一道填空题：
            我不勾，是不是就等于这顿没盐？—— 这是上一版的真错误，
            钠被标签独占，不勾只剩 250mg 底。
            现在标题直接给答案（这一顿几克），下面的标签变成可选项：
            「还有这些没拍到吗」，勾了往上加，不勾也是数。
          */}
          <div className="mt-3 rounded-2xl bg-white px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Icon name="salt" size={17} className="shrink-0" style={{ color: saltTone }} />
                <p className="text-[16px] font-medium text-ink-700">
                  这顿盐 <span className="tabular-nums">{saltG}</span> 克
                </p>
              </div>
              <span className="text-[12px] text-ink-300">一天最多 5 克</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-400">
              按照片估的。下面这些没拍到的话，勾上会往上加。
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TAG_LIST.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`h-11 flex-1 rounded-xl text-[14px] font-medium transition active:scale-[0.97] ${
                      on
                        ? "bg-brand-500 text-white"
                        : "bg-black/[0.04] text-ink-700"
                    }`}
                  >
                    {TAG_CFG[t].label}
                  </button>
                );
              })}
            </div>
            {tags.length > 0 && (
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-500">
                {tags.map((t) => TAG_CFG[t].why).join("；")}
              </p>
            )}
          </div>

          <div className="mt-6">
            <button
              className="btn-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {existing
                ? `加进${mealTypeLabel(mealType)}`
                : demo
                  ? "仍然记下（示例）"
                  : "记上了"}
            </button>
            {existing && (
              <p className="mt-2 text-center text-[12px] tabular-nums text-ink-300">
                {existingKcal} → {existingKcal + withDrinks.kcal} 大卡
              </p>
            )}
          </div>
        </div>
      )}
      </Sheet>

      {zoom && preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={() => setZoom(false)}
          role="button"
          tabIndex={0}
          aria-label="关闭大图"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              setZoom(false);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="这顿饭的照片"
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
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
          <p className="absolute bottom-6 left-0 right-0 text-center text-[13px] text-white/55">
            点一下关掉
          </p>
        </div>
      )}
    </>
  );
}

/**
 * 三个营养素的小卡。
 * 这里也试过只写「蛋 10g / 饭 58g / 油 6g」—— 和首页踩的是同一个坑：
 * 一个字加一个数字，读的人得先猜这个字代表什么。名字写全。
 */
function Macro({
  icon,
  name,
  value,
  unit,
  color,
}: {
  icon: IconName;
  name: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white py-2.5">
      <div className="flex items-center justify-center gap-1">
        {/* 图标要上色：灰色图标在这个尺寸下和文字一样轻，等于没画。
            尺寸不再往下压到 14 —— 14px 下不管画什么都只是一点，17 才认得出形状 */}
        <Icon name={icon} size={17} style={{ color }} />
        <span className="text-[13px] text-ink-400">{name}</span>
      </div>
      <p className="mt-1 text-center text-[18px] font-semibold leading-none tabular-nums">
        {value}
        <span className="ml-0.5 text-[11px] font-normal text-ink-300">{unit}</span>
      </p>
    </div>
  );
}
