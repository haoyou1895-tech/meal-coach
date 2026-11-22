import { Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "../../components/Icon";
import VoiceInput from "../../components/VoiceInput";
import { estimate, recognize } from "../../lib/api";
import { ruleComment, ruleVerdict } from "../../lib/comment";
import { DRINK_CFG, DRINK_KINDS, drinkKcal } from "../../lib/drinks";
import { compressPath, pathToDataUrl } from "../../lib/image";
import { TAG_CFG, TAG_LIST, saltGram, sodiumWithTags } from "../../lib/mealTags";
import {
  buildPlan,
  guessMealType,
  mealTypeLabel,
  sumMeals,
  todayStr,
} from "../../lib/nutrition";
import { deletePhoto, getPhoto, putPhoto } from "../../lib/photos";
import { PORTION_STEPS } from "../../lib/portion";
import { activityOfDate, latestWeightKg, loadState, saveState, upsertMeal } from "../../lib/store";
import type {
  Drink,
  DrinkKind,
  FoodItem,
  Meal,
  MealTag,
  MealType,
  Nutrition,
  NoteCheck,
  RecognizeResult,
} from "../../lib/types";
import "./index.scss";

/**
 * 记一餐。这一版是照 web/src/components/CameraSheet.tsx 整段搬的。
 *
 * 上一版只做了"拍一张 → 列出菜 → 存"，砍掉了网页版里一半的东西：
 * 多张照片、语音、酒、盐标签、份量三档、"照片里没看见"的确认、
 * 这顿已经记过时的合并提示。这个页面的价值全在这些枝节里 ——
 * 舅舅的饭局是圆桌，一张照片拍不全；他喝半斤白酒，照片里看不出来。
 * 砍掉的那些，正好是这家人的真实情况。
 */

type Phase = "idle" | "working" | "result" | "error";

const VTONE = { good: "#1f8a5b", warn: "#a9631a", over: "#b23c2c" } as const;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** 一次最多几张：四张够拍完一桌菜，再多模型也看不过来 */
const MAX_SHOTS = 4;

/**
 * 还没记进账本的那张照片，放在本地文件系统的固定位置。
 *
 * 识别会失败（断网、接口 502、模型看走眼），而人不会因为失败再把饭
 * 重新吃一遍 —— 上一版失败后只有"重拍一张"，等于假定桌上那盘菜还在，
 * 可他可能已经吃完了。照片跟着失败一起丢，这顿饭就永远没有图。
 *
 * 所以：选完图先落盘，再谈识别。失败、甚至退出页面，图都还在。
 */
const DRAFT_ID = "draft-photo";

/**
 * 加餐的副标题。
 *
 * "加餐"是个分类词，不是人话。下午三点他说"下午茶"，十点说"宵夜"，
 * 上午十点就是"上午"。上一版只有下午茶/宵夜两档，于是上午十一点
 * 打开也写着"下午茶"，跟还没吃的午饭撞在一起。
 */
function snackSub(hour: number): string {
  if (hour >= 20 || hour < 5) return "宵夜";
  if (hour >= 13 && hour < 17) return "下午茶";
  if (hour >= 5 && hour < 12) return "上午";
  return "";
}

export default function CapturePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  /** 压缩后的本地路径，多张时第一张当预览 */
  const [shots, setShots] = useState<string[]>([]);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [hour, setHour] = useState<number>(new Date().getHours());
  const [items, setItems] = useState<FoodItem[]>([]);
  const [base, setBase] = useState<Nutrition | null>(null);
  const [factors, setFactors] = useState<number[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [demo, setDemo] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState<boolean[]>([]);
  const [noteCheck, setNoteCheck] = useState<NoteCheck | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [drinkOpen, setDrinkOpen] = useState(false);
  const [tags, setTags] = useState<MealTag[]>([]);
  const [saving, setSaving] = useState(false);
  /** 上次没认出来的那张，路径；空表示没有 */
  const [draftPath, setDraftPath] = useState("");
  /** 正在改名字的那一项；null 表示没有在改 */
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameTip, setRenameTip] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  /** 写照片是异步的，连点两下会存两份 */
  const busyRef = useRef(false);

  // 进页面读一次就够：这个页面不回头改数据，存完就退回首页
  const [state] = useState(() => loadState());
  const today = todayStr();
  const profile = state.profile;
  const plan = useMemo(() => {
    if (!profile) return null;
    const w = latestWeightKg(state.weights, profile.weightKg);
    // 运动消耗这端还没接，按纯日常活动算（跟首页、记录页同一口径）
    return buildPlan({ ...profile, weightKg: w }, 0);
  }, [state, today]);

  const todayMeals = state.meals.filter((m) => m.date === today);
  const dayKcalBefore = sumMeals(todayMeals).kcal;

  /** 这个餐次今天是否已经记过；记过就只能往这顿里加 */
  const existing = todayMeals.find((m) => m.mealType === mealType);
  const existingKcal = existing ? existing.nutrition.kcal + drinkKcal(existing.drinks) : 0;

  // 进来先按时间猜一顿，猜错了他自己点一下就行
  useEffect(() => {
    const now = new Date();
    setMealType(guessMealType(now, todayMeals.map((m) => m.mealType)));
    setHour(now.getHours());
    // 只在进页面那一刻猜一次；放依赖里会把他手动改的又改回去
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 进页面先看有没有上次没认出来的照片 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await getPhoto(DRAFT_ID);
      if (alive && p) setDraftPath(p);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 标题跟着阶段变：网页版的弹层标题也是这么换的
  useEffect(() => {
    Taro.setNavigationBarTitle({
      title: phase === "result" ? "这一餐" : phase === "working" ? "正在看照片" : "记一餐",
    });
  }, [phase]);

  const preview = shots[0] ?? "";

  const reset = () => {
    setPhase("idle");
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
    setConfirmed([]);
    setNoteCheck(null);
  };

  /** 拍照（一张）或从相册选（可多选） */
  const pick = async (source: "camera" | "album") => {
    try {
      const res = await Taro.chooseMedia({
        count: source === "camera" ? 1 : MAX_SHOTS,
        mediaType: ["image"],
        sourceType: [source],
        sizeType: ["compressed"],
      });
      const files = (res.tempFiles ?? []).slice(0, MAX_SHOTS);
      if (!files.length) return;
      setPhase("working");
      setErrMsg("");
      // 一桌菜拍不完，就一次选几张一起认。
      // 多张走同一次请求，不是拍一张等一次：一次十秒，三张就是三十秒
      const paths: string[] = [];
      const urls: string[] = [];
      for (const f of files) {
        const small = await compressPath(f.tempFilePath);
        paths.push(small);
        const url = await pathToDataUrl(small);
        if (url) urls.push(url);
      }
      if (!urls.length) {
        setPhase("error");
        setErrMsg("这几张图读不出来，换一张试试");
        return;
      }
      setShots(paths);
      /*
        先落盘，再谈识别。
        识别失败的时候人往往已经把饭吃完了 —— 照片要是跟着失败一起丢，
        这顿饭就永远没有图。存进 photos 目录，退出页面再进来也还在。
      */
      try {
        if (await putPhoto(DRAFT_ID, paths[0])) {
          setDraftPath((await getPhoto(DRAFT_ID)) ?? paths[0]);
        }
      } catch {
        // 存不下不影响识别本身，照常往下走
      }
      await run(urls, note);
    } catch (e) {
      const msg = (e as { errMsg?: string })?.errMsg ?? "";
      // 用户自己点了取消，不用报错
      if (/cancel/i.test(msg)) {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setErrMsg("没能打开相机，检查下微信的相机权限");
    }
  };

  const run = async (urls: string[], text: string) => {
    setPhase("working");
    setErrMsg("");
    const data: RecognizeResult = await recognize(urls, text.trim());
    if (!data.items || data.items.length === 0) {
      setErrMsg(data.error || "这张没看清，能再拍一张吗");
      setPhase("error");
      return;
    }
    setItems(data.items);
    setFactors(data.items.map(() => 1));
    // 照片里看不到的那几项先挂起，等用户点头再算热量
    setConfirmed(data.items.map((it) => it.seen !== false));
    if (data.drinks?.length) setDrinks(data.drinks);
    setNoteCheck(data.noteCheck ?? null);
    setBase(data.nutrition);
    setConfidence(data.confidence ?? 0.6);
    setDemo(!!data.demo);
    if (data.error) setErrMsg(data.error);
    setPhase("result");
  };

  /* ---------- 账怎么算 ---------- */

  /** 没确认的那几项按 0 算：他说了但我没看见的东西，没资格进这本账 */
  const factorOf = (i: number) => (confirmed[i] === false ? 0 : (factors[i] ?? 1));

  const computed: Nutrition = useMemo(() => {
    const empty = { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 };
    if (!base || !items.length) return empty;
    const scaledKcal = items.reduce((s, it, i) => s + it.kcal * factorOf(i), 0);
    const ratio = base.kcal > 0 ? scaledKcal / base.kcal : 1;
    const r = (n: number) => Math.round(n * ratio);
    return {
      kcal: Math.round(scaledKcal),
      protein: r(base.protein),
      carb: r(base.carb),
      fat: r(base.fat),
      sodium: r(base.sodium),
    };
  }, [base, items, factors, confirmed]);

  const pending = items.map((it, i) => ({ it, i })).filter(({ i }) => confirmed[i] === false);

  /** 冲突时列表里只留照片里看得到的，别让他替系统一条条否掉 */
  const visible = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => noteCheck?.verdict !== "conflict" || confirmed[i] !== false);

  const pendingKcal = pending.reduce((s, { it, i }) => s + Math.round(it.kcal * (factors[i] ?? 1)), 0);

  const orphanUnseen = (noteCheck?.unseen ?? []).filter(
    (n) => !items.some((it) => it.seen === false && (it.name.includes(n) || n.includes(it.name))),
  );

  /** 酒也是这顿的一部分：半斤白酒七百多大卡，漏了它"这顿合适"就是假话 */
  const withDrinks: Nutrition = { ...computed, kcal: computed.kcal + drinkKcal(drinks) };

  const saltMg = sodiumWithTags(computed.sodium, tags);
  const saltG = saltGram(saltMg);
  const saltLimitMg = plan?.sodiumLimitMg ?? 2000;
  const saltTone = saltMg > saltLimitMg ? "#b23c2c" : saltMg > saltLimitMg * 0.6 ? "#a9631a" : "#4a7d63";

  const verdict =
    profile && plan
      ? ruleVerdict(withDrinks, profile, plan, dayKcalBefore, mealType, new Date())
      : null;

  const setFactor = (i: number, v: number) =>
    setFactors((prev) => prev.map((f, idx) => (idx === i ? v : f)));

  /* ---------- 失败保温：同一张图再认一次 ---------- */

  /** 用手里已有的图重试，不重拍、照片也不动 */
  const retry = async () => {
    const paths = shots.length ? shots : draftPath ? [draftPath] : [];
    if (!paths.length) return;
    setPhase("working");
    setErrMsg("");
    const urls: string[] = [];
    for (const p of paths) {
      const u = await pathToDataUrl(p);
      if (u) urls.push(u);
    }
    if (!urls.length) {
      setPhase("error");
      setErrMsg("这张图读不出来了，重拍一张吧");
      return;
    }
    setShots(paths);
    await run(urls, note);
  };

  /** 丢掉这张，回到干净状态 */
  const dropDraft = () => {
    setDraftPath("");
    setShots([]);
    void deletePhoto(DRAFT_ID);
    setPhase("idle");
    setErrMsg("");
  };

  /* ---------- 改菜名 ---------- */

  const startRename = (i: number) => {
    setRenameIdx(i);
    setRenameDraft(items[i]?.name ?? "");
    setRenameTip("");
  };

  /**
   * 改名，并把热量跟着重算。
   * 只改名不重算等于没修：蒸蛋 100、番茄炒蛋 190，名字对了数字还错，
   * 这本账依然是假的。算不出来也把名字留下 —— 至少事实是对的。
   */
  const commitRename = async (i: number) => {
    const cur = items[i];
    const next = renameDraft.trim().slice(0, 20);
    setRenameIdx(null);
    if (!cur || !next || next === cur.name) return;
    setRenameBusy(true);
    try {
      const { kcal } = await estimate(next, cur.portion);
      if (kcal > 0) {
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: next, kcal } : it)));
        setRenameTip(`「${cur.name}」改成「${next}」，热量按 ${kcal} 大卡重算`);
      } else {
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: next } : it)));
        setRenameTip(`名字改成「${next}」了，但这会儿没算出新热量，可以先调份量`);
      }
    } finally {
      setRenameBusy(false);
    }
  };

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
      prev.map((d) => (d.kind === kind ? { ...d, count: d.count + delta } : d)).filter((d) => d.count > 0),
    );
  };

  const toggleTag = (t: MealTag) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const save = async () => {
    if (busyRef.current) return;
    if (!items.some((_, i) => confirmed[i] !== false)) {
      setErrMsg("一道菜都没算上，先点「算了」或者重拍一张");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    try {
      const id = `m${Date.now()}`;
      // 照片先落到本地文件系统，记录里只存 id。
      // 临时文件会被微信清掉，不落盘的话过两天列表里就是空的
      const photoIds: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        const pid = i === 0 ? id : `${id}-${i}`;
        const ok = await putPhoto(pid, shots[i]);
        if (ok) photoIds.push(pid);
      }

      const now = new Date().toISOString();
      const meal: Meal = {
        id,
        date: today,
        mealType,
        // 只记他确认过的：说了但没算数的那几项不进账本
        items: items
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => confirmed[i] !== false)
          .map(({ it, i }) => ({
            name: it.name,
            portion: it.portion,
            kcal: Math.round(it.kcal * (factors[i] ?? 1)),
          })),
        nutrition: { ...computed, sodium: saltMg },
        comment:
          profile && plan
            ? ruleComment(withDrinks, profile, plan, dayKcalBefore, mealType, new Date())
            : "",
        adjusted: factors.some((f) => f !== 1),
        confidence,
        createdAt: now,
        eatenAt: now,
        photoIds: photoIds.length ? photoIds : undefined,
        drinks: drinks.length ? drinks : undefined,
        tags: tags.length ? tags : undefined,
      };

      saveState(upsertMeal(loadState(), meal));
      // 这张图已经跟着记录存到自己的位置了，草稿可以撤
      void deletePhoto(DRAFT_ID);
      setDraftPath("");
      busyRef.current = false;
      setSaving(false);
      Taro.showToast({ title: existing ? "加进这一顿了" : "记下了", icon: "success" });
      setTimeout(() => Taro.navigateBack({ delta: 1 }), 600);
    } catch {
      busyRef.current = false;
      setSaving(false);
      setErrMsg("没存上，再点一次");
    }
  };

  /* ---------- 界面 ---------- */

  if (phase === "working") {
    return (
      <View className="page cap">
        <View className="busy">
          {shots.length > 1 ? (
            <View className="busy-shots">
              {shots.map((s, i) => (
                <Image key={i} className="busy-thumb" src={s} mode="aspectFill" />
              ))}
            </View>
          ) : (
            !!preview && <Image className="busy-img" src={preview} mode="aspectFill" />
          )}
          <View className="busy-dots">
            <View className="busy-dot" />
            <View className="busy-dot" />
            <View className="busy-dot" />
          </View>
          <Text className="busy-text">
            {shots.length > 1 ? `正在看这 ${shots.length} 张` : "正在看这些菜…"}
          </Text>
          <Text className="busy-sub">一般 5–10 秒</Text>
        </View>
      </View>
    );
  }

  if (phase === "error") {
    // 手里还有图（刚拍的，或上次留下的），就不该只有"重拍"这一条路
    const kept = preview || draftPath;
    return (
      <View className="page cap">
        <View className="err-wrap">
          {!!kept && (
            <View
              className="err-photo"
              hoverClass="tap"
              onClick={() => Taro.previewImage({ urls: [kept] })}
            >
              <Image className="err-photo-img" src={kept} mode="aspectFill" />
            </View>
          )}
          <Text className="err-title">{errMsg || "这张没看清，能再拍一张吗"}</Text>
          {!!kept && (
            <Text className="err-sub">照片留在手机里了，不用重拍。真认不出来，再试一次就行</Text>
          )}
          <View className="err-btns">
            {!!kept && (
              <View className="btn-primary" hoverClass="tap" onClick={() => void retry()}>
                <Text className="btn-primary-text">再试一次</Text>
              </View>
            )}
            <View
              className={kept ? "btn-ghost" : "btn-primary"}
              hoverClass="tap"
              onClick={() => pick("camera")}
            >
              <Text className={kept ? "btn-ghost-text" : "btn-primary-text"}>重拍一张</Text>
            </View>
            {!!kept && (
              <View className="btn-ghost" hoverClass="tap" onClick={() => setPhase("idle")}>
                <Text className="btn-ghost-text">用文字记</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  if (phase === "result") {
    return (
      <View className="page cap">
        {/* 顶部：缩略图 + 大数字 + 重拍 */}
        <View className="res-top">
          {!!preview && (
            <View
              className="res-thumb"
              hoverClass="tap"
              onClick={() => Taro.previewImage({ urls: shots, current: preview })}
            >
              <Image className="res-thumb-img" src={preview} mode="aspectFill" />
              {shots.length > 1 && <Text className="res-thumb-count">{shots.length}</Text>}
            </View>
          )}
          <View className="res-main">
            <Text className="res-label">{mealTypeLabel(mealType)} · 大约</Text>
            {demo ? (
              <Text className="res-demo">示例数据</Text>
            ) : (
              <View className="res-kcal">
                <Text className="res-kcal-num tabular">{withDrinks.kcal}</Text>
                <Text className="res-kcal-unit">大卡</Text>
              </View>
            )}
          </View>
          <View className="res-retake" hoverClass="tap" onClick={() => pick("camera")}>
            <Text className="res-retake-text">重拍</Text>
          </View>
        </View>

        {demo && (
          <View className="demo-tip">
            <Icon name="alert" size={16} color="#c56f10" />
            <Text className="demo-tip-text">
              <Text className="b">未接识别服务。</Text>
              下面这些菜名和热量是固定示例，不是从这张照片认出来的。
              {errMsg ? `\n${errMsg}` : ""}
            </Text>
          </View>
        )}

        {/* 他说了、照片里没有 */}
        {noteCheck?.verdict === "conflict" && (
          <View className="conflict">
            <View className="conflict-head">
              <Icon name="alert" size={18} color="#b23c2c" />
              <View className="conflict-body">
                <Text className="conflict-title">这照片和您说的对不上</Text>
                <Text className="conflict-sub">
                  下面只按照片里的算。
                  {noteCheck.unseen.length > 0 ? `「${noteCheck.unseen.join("、")}」没算进去。` : ""}
                </Text>
              </View>
            </View>
            <View className="two-btns">
              <View className="btn-solid danger" hoverClass="tap" onClick={dropPending}>
                <Text className="btn-solid-text">就按照片记</Text>
              </View>
              <View className="btn-outline danger" hoverClass="tap" onClick={() => pick("camera")}>
                <Text className="btn-outline-text">重拍</Text>
              </View>
            </View>
          </View>
        )}

        {noteCheck?.verdict !== "conflict" && (pending.length > 0 || orphanUnseen.length > 0) && (
          <View className="pending">
            <View className="conflict-head">
              <Icon name="eyeOff" size={18} color="#a9631a" />
              <View className="conflict-body">
                <Text className="pending-title">
                  照片里没看见
                  {(pending.length > 0 ? pending.map((p) => p.it.name) : orphanUnseen).join("、")}
                </Text>
                <Text className="pending-sub">
                  {pending.length === 0
                    ? "这顿先不算，您看要不要重拍一张把它拍进去"
                    : pendingKcal > 0
                      ? `算上的话，这顿多 ${pendingKcal} 大卡`
                      : "要算上吗？"}
                </Text>
              </View>
            </View>
            <View className="two-btns">
              {pending.length > 0 ? (
                <>
                  <View
                    className="btn-solid warn"
                    hoverClass="tap"
                    onClick={() => setConfirmed(items.map(() => true))}
                  >
                    <Text className="btn-solid-text">我确实吃了</Text>
                  </View>
                  <View className="btn-outline warn" hoverClass="tap" onClick={dropPending}>
                    <Text className="btn-outline-text">不算</Text>
                  </View>
                </>
              ) : (
                <>
                  <View className="btn-solid warn" hoverClass="tap" onClick={() => pick("camera")}>
                    <Text className="btn-solid-text">重拍一张</Text>
                  </View>
                  <View
                    className="btn-outline warn"
                    hoverClass="tap"
                    onClick={() => setNoteCheck(null)}
                  >
                    <Text className="btn-outline-text">就这样记</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {noteCheck?.verdict !== "conflict" && pending.length === 0 && orphanUnseen.length === 0 && (
          <Text className="res-ok">
            {noteCheck && noteCheck.extraInPhoto.length > 0
              ? `照片里还有${noteCheck.extraInPhoto.join("、")}，也一起算上了`
              : "描述和照片对得上"}
          </Text>
        )}

        {existing && (
          <View className="merge-tip">
            <Text className="merge-tip-text">
              {mealTypeLabel(mealType)}已记 {existingKcal} 大卡，这次会
              <Text className="b">加进那一顿</Text>
            </Text>
          </View>
        )}

        {/* 改完名字的一句反馈：要说清热量到底跟着变了没有 */}
        {!!renameTip && (
          <View className="rename-tip">
            <Text className="rename-tip-text">{renameTip}</Text>
          </View>
        )}
        {renameBusy && (
          <Text className="rename-busy">正在按新菜名重算热量…</Text>
        )}

        {/* 菜品：份量三档 */}
        <View className="dishes">
          {visible.map(({ it, i }) => {
            const off = confirmed[i] === false;
            return (
              <View key={`${it.name}-${i}`} className={`dish ${off ? "is-off" : ""}`}>
                <View className="dish-left">
                  {/* 菜名是模型给的，认错是常态。名字后面挂个铅笔，
                      点一下就能改 —— 不然只能删掉重拍，而菜已经吃完了 */}
                  {renameIdx === i ? (
                    <Input
                      className="dish-name-input"
                      value={renameDraft}
                      maxlength={20}
                      focus
                      confirmType="done"
                      onInput={(e) => setRenameDraft(e.detail.value)}
                      onBlur={() => void commitRename(i)}
                      onConfirm={() => void commitRename(i)}
                    />
                  ) : (
                    <View className="dish-name-row" hoverClass="tap" onClick={() => startRename(i)}>
                      <Text className={`dish-name ${off ? "is-off" : ""}`}>{it.name}</Text>
                      <Icon name="edit" size={12} color="#9aa5a0" />
                    </View>
                  )}
                  <Text className="dish-sub">
                    {off
                      ? "照片里没看见"
                      : (factors[i] ?? 1) === 1
                        ? `${it.portion} · 约 ${Math.round(it.kcal)} 大卡`
                        : `约 ${Math.round(it.kcal * (factors[i] ?? 1))} 大卡`}
                  </Text>
                </View>
                {off ? (
                  <View
                    className="dish-add"
                    hoverClass="tap"
                    onClick={() => setConfirmed((prev) => prev.map((v, idx) => (idx === i ? true : v)))}
                  >
                    <Text className="dish-add-text">算上</Text>
                  </View>
                ) : (
                  <View className="steps">
                    {PORTION_STEPS.map((s) => (
                      <View
                        key={s.v}
                        className={`step-chip ${(factors[i] ?? 1) === s.v ? "is-on" : ""}`}
                        hoverClass="tap"
                        onClick={() => setFactor(i, s.v)}
                      >
                        <Text className="step-chip-text">{s.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {/* 酒跟菜一样，就是列表里的一条 */}
          {drinks.map((d) => {
            const cfg = DRINK_CFG[d.kind];
            return (
              <View key={d.kind} className="dish">
                <View className="dish-left">
                  <Text className="dish-name">{cfg.label}</Text>
                  <Text className="dish-sub">
                    {d.count} {cfg.unit} · 约 {cfg.kcalPerUnit * d.count} 大卡
                  </Text>
                </View>
                <View className="counter">
                  <View className="counter-btn" hoverClass="tap" onClick={() => changeDrink(d.kind, -1)}>
                    <Text className="counter-sign">−</Text>
                  </View>
                  <Text className="counter-val tabular">
                    {d.count} {cfg.unit}
                  </Text>
                  <View className="counter-btn" hoverClass="tap" onClick={() => changeDrink(d.kind, 1)}>
                    <Text className="counter-sign">+</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {drinkOpen ? (
            <View className="drink-panel">
              <View className="drink-kinds">
                {DRINK_KINDS.map((k) => {
                  const on = drinks.some((d) => d.kind === k);
                  return (
                    <View
                      key={k}
                      className={`drink-kind ${on ? "is-on" : ""}`}
                      hoverClass="tap"
                      onClick={() => addDrink(k)}
                    >
                      <Text className="drink-kind-text">{DRINK_CFG[k].label}</Text>
                    </View>
                  );
                })}
              </View>
              <View className="drink-fold" hoverClass="tap" onClick={() => setDrinkOpen(false)}>
                <Text className="drink-fold-text">收起</Text>
              </View>
            </View>
          ) : (
            <View className="drink-open" hoverClass="tap" onClick={() => setDrinkOpen(true)}>
              <Icon name="alcohol" size={16} color="#6b7671" />
              <Text className="drink-open-text">{drinks.length > 0 ? "再加一种" : "加了酒"}</Text>
            </View>
          )}
        </View>

        {/* 这顿怎么样 */}
        {verdict && (
          <View className="verdict">
            <Icon
              name={verdict.icon as IconName}
              size={18}
              color={VTONE[verdict.tone]}
            />
            <Text className="verdict-short" style={{ color: VTONE[verdict.tone] }}>
              {verdict.short}
            </Text>
            <Text className="verdict-tip ellipsis">{verdict.tip}</Text>
          </View>
        )}

        {/* 三样营养素 */}
        <View className="macros3">
          <MacroCell icon="protein" name="蛋白质" value={computed.protein} color="#a3563f" />
          <MacroCell icon="carb" name="碳水" value={computed.carb} color="#b0842c" />
          <MacroCell icon="fat" name="脂肪" value={computed.fat} color="#7d8b5e" />
        </View>

        {confidence > 0 && confidence < 0.5 && (
          <Text className="low-conf">看不太清，数字是估的 — 点份量改一下</Text>
        )}

        {/* 这顿的盐 */}
        <View className="salt-card">
          <View className="salt-head">
            <View className="salt-title-row">
              <Icon name="salt" size={17} color={saltTone} />
              <Text className="salt-title">
                这顿盐 <Text className="tabular">{saltG}</Text> 克
              </Text>
            </View>
            <Text className="salt-limit">一天最多 5 克</Text>
          </View>
          <Text className="salt-hint">按照片估的。下面这些没拍到的话，勾上会往上加。</Text>
          <View className="salt-tags">
            {TAG_LIST.map((t) => {
              const on = tags.includes(t);
              return (
                <View
                  key={t}
                  className={`salt-tag ${on ? "is-on" : ""}`}
                  hoverClass="tap"
                  onClick={() => toggleTag(t)}
                >
                  <Text className="salt-tag-text">{TAG_CFG[t].label}</Text>
                </View>
              );
            })}
          </View>
          {tags.length > 0 && (
            <Text className="salt-why">{tags.map((t) => TAG_CFG[t].why).join("；")}</Text>
          )}
        </View>

        {!!errMsg && <Text className="err">{errMsg}</Text>}

        <View className="save-wrap">
          <View
            className={`btn-primary ${saving ? "is-busy" : ""}`}
            hoverClass="tap"
            onClick={save}
          >
            <Text className="btn-primary-text">
              {saving
                ? "存…"
                : existing
                  ? `加进${mealTypeLabel(mealType)}`
                  : demo
                    ? "仍然记下（示例）"
                    : "记上了"}
            </Text>
          </View>
          {existing && (
            <Text className="save-preview tabular">
              {existingKcal} → {existingKcal + withDrinks.kcal} 大卡
            </Text>
          )}
        </View>

        <View className="bottom-space" />
      </View>
    );
  }

  /* ---------- 选图（idle） ---------- */
  return (
    <View className="page cap">
      <View className="pick">
        {/*
          上次那张没认出来，图还在。
          这条路是给"拍完就吃完了、菜已经撤了"的人走的：
          他不需要重拍，只需要再认一次。
        */}
        {!!draftPath && (
          <View className="draft-card">
            <View
              className="draft-thumb"
              hoverClass="tap"
              onClick={() => Taro.previewImage({ urls: [draftPath] })}
            >
              <Image className="draft-img" src={draftPath} mode="aspectFill" />
            </View>
            <View className="draft-body">
              <Text className="draft-title">上次那张还在</Text>
              <Text className="draft-sub">不用重拍，再认一次就行</Text>
            </View>
            <View className="draft-retry" hoverClass="tap" onClick={() => void retry()}>
              <Text className="draft-retry-text">再认</Text>
            </View>
            <View className="draft-drop" hoverClass="tap" onClick={dropDraft}>
              <Icon name="close" size={12} color="#8a958f" />
            </View>
          </View>
        )}

        {/* 餐次四选一：拍完就不用再返回来改 */}
        <View className="mealtype-row">
          {MEAL_TYPES.map((t) => {
            const recorded = todayMeals.some((m) => m.mealType === t);
            const on = mealType === t;
            return (
              <View
                key={t}
                className={`mealtype ${on ? "is-on" : ""}`}
                hoverClass="tap"
                onClick={() => setMealType(t)}
              >
                <View className="mealtype-inner">
                  <Text className="mealtype-text">{mealTypeLabel(t)}</Text>
                  {/* 上午十一点不该写"下午茶"：副标题只在该时段出现 */}
                  {t === "snack" && !!snackSub(hour) && (
                    <Text className={`mealtype-sub ${on ? "is-on" : ""}`}>{snackSub(hour)}</Text>
                  )}
                </View>
                {recorded && <Text className={`mealtype-rec ${on ? "is-on" : ""}`}>已记</Text>}
              </View>
            );
          })}
        </View>

        {/* 这顿已经记过：把之前填的摊出来，别让他对着白纸以为没存上 */}
        {existing ? (
          <View className="existing">
            <View className="existing-head">
              <Icon name="check" size={16} color="#176f49" />
              <Text className="existing-title">
                {mealTypeLabel(mealType)}已记 {existingKcal} 大卡
              </Text>
              <View
                className="existing-edit"
                hoverClass="tap"
                onClick={() =>
                  Taro.redirectTo({
                    url: `/pages/record/index?editId=${existing.id}`,
                  })
                }
              >
                <Icon name="edit" size={13} color="#176f49" />
                <Text className="existing-edit-text">改</Text>
              </View>
            </View>
            <Text className="existing-items">{existing.items.map((i) => i.name).join("、")}</Text>
            <Text className="existing-hint">下面拍的会加进这一顿</Text>
          </View>
        ) : null}

        {/* 这顿吃了啥 */}
        <View className="note-wrap">
          <View className="note-head">
            <Text className="note-label">这顿吃了啥？</Text>
            <Text className="note-count tabular">{note.length > 0 ? `${note.length}/60` : ""}</Text>
          </View>
          <Textarea
            className="note-area"
            value={note}
            maxlength={60}
            placeholder="比如：一碗米饭、红烧肉、炒青菜"
            placeholderClass="note-ph"
            onInput={(e) => setNote(e.detail.value)}
            autoHeight={false}
          />
          <VoiceInput onText={(t) => setNote((prev) => (prev ? `${prev}、${t}` : t).slice(0, 60))} />
        </View>

        {/* 虚线大卡片：网页版的拍照入口就长这样 */}
        <View className="shot-box" hoverClass="tap" onClick={() => pick("camera")}>
          <View className="shot-icon">
            <Icon name="camera" size={30} color="#ffffff" />
          </View>
          <Text className="shot-title">拍一张照片</Text>
          <Text className="shot-sub">我帮您算这顿有多少大卡</Text>
        </View>

        <View className="album-btn" hoverClass="tap" onClick={() => pick("album")}>
          <Text className="album-text">
            从相册选
            <Text className="album-hint"> 可多选，一桌菜拍不完就选几张</Text>
          </Text>
        </View>

        {!!errMsg && <Text className="err">{errMsg}</Text>}
      </View>
    </View>
  );
}

/** 三个营养素的小卡：名字必须写全，一个字加一个数字读的人得先猜 */
function MacroCell({
  icon,
  name,
  value,
  color,
}: {
  icon: IconName;
  name: string;
  value: number;
  color: string;
}) {
  return (
    <View className="macro3">
      <View className="macro3-head">
        <Icon name={icon} size={17} color={color} />
        <Text className="macro3-name">{name}</Text>
      </View>
      <Text className="macro3-val tabular">
        {value}
        <Text className="macro3-unit">g</Text>
      </Text>
    </View>
  );
}
