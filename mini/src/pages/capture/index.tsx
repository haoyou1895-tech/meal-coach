import { Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import { recognize } from "../../lib/api";
import { compressPath, pathToDataUrl } from "../../lib/image";
import { guessMealType, mealTypeLabel, round } from "../../lib/nutrition";
import { putPhoto } from "../../lib/photos";
import { loadState, saveState, upsertMeal } from "../../lib/store";
import type { FoodItem, Meal, MealType, RecognizeResult } from "../../lib/types";
import "./index.scss";

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "早饭" },
  { key: "lunch", label: "午饭" },
  { key: "dinner", label: "晚饭" },
  { key: "snack", label: "加餐" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function CapturePage() {
  const [step, setStep] = useState<"pick" | "busy" | "result">("pick");
  const [imgPath, setImgPath] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const [mealType, setMealType] = useState<MealType>(() => {
    const s = loadState();
    const recorded = s.meals.filter((m) => m.date === today).map((m) => m.mealType);
    return guessMealType(new Date(), recorded);
  });

  /** 拍照或从相册选。选完先压再转 base64，识别时直接用 */
  const pick = async (source: "camera" | "album") => {
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [source],
        sizeType: ["compressed"],
      });
      const temp = res.tempFiles?.[0]?.tempFilePath;
      if (!temp) return;
      setErr("");

      /*
        预览和存盘都用压缩后的那张，不是原图。
        手机原图三四兆，存十张就二十几兆，而列表里显示的还只是个小方块 ——
        压到 720px 肉眼分不出区别，省下的空间是实打实的。
      */
      const small = await compressPath(temp);
      setImgPath(small);

      const url = await pathToDataUrl(small);
      if (!url) {
        setErr("这张图读不出来，换一张试试");
        return;
      }
      setDataUrl(url);
    } catch (e) {
      // 用户自己点了取消，不用报错
      const msg = (e as { errMsg?: string })?.errMsg ?? "";
      if (!/cancel/i.test(msg)) {
        setErr("没能打开相机，检查下微信的相机权限");
      }
    }
  };

  const run = async () => {
    if (!dataUrl) return;
    setStep("busy");
    setErr("");
    const r = await recognize([dataUrl], note.trim());
    if (r.error && !r.items?.length) {
      setStep("pick");
      setErr(r.error);
      return;
    }
    setResult(r);
    setItems(r.items ?? []);
    setStep("result");
  };

  /** 删掉认错的那一项，营养按剩下的热量比例缩 —— 不重算，但不会离谱 */
  const removeItem = (index: number) => {
    if (!result) return;
    const next = items.filter((_, i) => i !== index);
    const before = items.reduce((n, i) => n + i.kcal, 0);
    const after = next.reduce((n, i) => n + i.kcal, 0);
    const k = before > 0 ? after / before : 0;
    setItems(next);
    setResult({
      ...result,
      nutrition: {
        kcal: round(result.nutrition.kcal * k),
        protein: round(result.nutrition.protein * k, 1),
        carb: round(result.nutrition.carb * k, 1),
        fat: round(result.nutrition.fat * k, 1),
        sodium: round(result.nutrition.sodium * k),
      },
    });
  };

  const save = async () => {
    if (saving || !result) return;
    setSaving(true);
    const id = `m${Date.now()}`;

    // 照片先落到本地文件系统，记录里只存 id。
    // 临时文件会被微信清掉，不落盘的话过两天列表里的图就是空的
    const ok = await putPhoto(id, imgPath);

    const now = new Date().toISOString();
    const meal: Meal = {
      id,
      date: today,
      mealType,
      items,
      nutrition: result.nutrition,
      comment: result.comment || "",
      adjusted: false,
      confidence: result.confidence ?? 0,
      createdAt: now,
      eatenAt: now,
      photoIds: ok ? [id] : [],
      drinks: result.drinks,
    };

    const s = loadState();
    saveState(upsertMeal(s, meal));

    Taro.showToast({ title: "记下了", icon: "success" });
    // 没有原生 tabBar，switchTab 会失败
    setTimeout(() => Taro.reLaunch({ url: "/pages/index/index" }), 600);
  };

  /* ---------- 选图 ---------- */
  if (step === "pick") {
    return (
      <View className="page cap">
        {!imgPath ? (
          <View className="pick">
            <Text className="pick-title">拍一张，不用自己算</Text>
            <Text className="pick-sub">
              它会看清盘子里有什么、大概多少，然后告诉你这顿超没超。
            </Text>
            <View className="pick-btn" onClick={() => pick("camera")}>
              <Text className="pick-btn-text">拍照</Text>
            </View>
            <View className="pick-btn ghost" onClick={() => pick("album")}>
              <Text className="pick-btn-text ghost-text">从相册选</Text>
            </View>
          </View>
        ) : (
          <View className="preview">
            <Image className="preview-img" src={imgPath} mode="aspectFill" />
            <View className="preview-body">
              <Text className="preview-label">还吃了什么没拍到的？（可不填）</Text>
              <Input
                className="note-input"
                placeholder="比如：还喝了碗汤、吃了半碗饭"
                value={note}
                maxlength={30}
                onInput={(e) => setNote(e.detail.value)}
              />
              {!!err && <Text className="err">{err}</Text>}
              <View className="pick-btn" onClick={run}>
                <Text className="pick-btn-text">看看吃了啥</Text>
              </View>
              <View
                className="pick-btn ghost"
                onClick={() => {
                  setImgPath("");
                  setDataUrl("");
                  setErr("");
                }}
              >
                <Text className="pick-btn-text ghost-text">重拍</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  /* ---------- 识别中 ---------- */
  if (step === "busy") {
    return (
      <View className="page cap">
        <View className="busy">
          <Image className="busy-img" src={imgPath} mode="aspectFill" />
          <View className="spinner" />
          <Text className="busy-text">正在看这张照片…</Text>
          <Text className="busy-sub">一般要 4 到 8 秒，别退出</Text>
        </View>
      </View>
    );
  }

  /* ---------- 结果 ---------- */
  const total = result?.nutrition.kcal ?? 0;
  return (
    <View className="page cap">
      <Image className="result-img" src={imgPath} mode="aspectFill" />

      <View className="card mealtype-card">
        <Text className="field-label">这是哪一顿</Text>
        <View className="row">
          {MEAL_TYPES.map((m) => (
            <View
              key={m.key}
              className={`chip ${mealType === m.key ? "is-on" : ""}`}
              onClick={() => setMealType(m.key)}
            >
              <Text className="chip-text">{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="card">
        <View className="card-head">
          <Text className="field-label">看出来的东西</Text>
          <Text className="kcal-big">{Math.round(total)} 大卡</Text>
        </View>

        {result?.demo && (
          <Text className="demo-tip">这是演示数据：服务端没配模型 Key</Text>
        )}

        {items.length === 0 ? (
          <Text className="empty-tip">
            这张照片里没认出吃的。要是拍清楚了还是这样，就自己补一句"吃了什么"再试。
          </Text>
        ) : (
          items.map((it, i) => (
            <View key={`${it.name}-${i}`} className="item-row">
              <View className="item-left">
                <Text className="item-name">{it.name}</Text>
                <Text className="item-portion">{it.portion}</Text>
              </View>
              <Text className="item-kcal">{Math.round(it.kcal)}</Text>
              <View className="item-del" onClick={() => removeItem(i)}>
                <Text className="item-del-text">删</Text>
              </View>
            </View>
          ))
        )}

        {!!result?.comment && <Text className="comment">{result.comment}</Text>}
      </View>

      {!!result && items.length > 0 && (
        <View className="card macros">
          <MacroCell label="蛋白质" value={result.nutrition.protein} />
          <MacroCell label="碳水" value={result.nutrition.carb} />
          <MacroCell label="脂肪" value={result.nutrition.fat} />
          <MacroCell label="钠" value={result.nutrition.sodium} unit="毫克" />
        </View>
      )}

      {!!err && <Text className="err">{err}</Text>}

      <View className="bottom-space" />
      <View className="bottom">
        <View className="pick-btn" onClick={save}>
          <Text className="pick-btn-text">{saving ? "存…" : `存进${mealTypeLabel(mealType)}`}</Text>
        </View>
        <View className="pick-btn ghost" onClick={() => Taro.navigateBack()}>
          <Text className="pick-btn-text ghost-text">算了，不记了</Text>
        </View>
      </View>
    </View>
  );
}

function MacroCell({
  label,
  value,
  unit = "克",
}: {
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <View className="macro-cell">
      <Text className="macro-cell-value">
        {Math.round(value)}
        <Text className="macro-cell-unit"> {unit}</Text>
      </Text>
      <Text className="macro-cell-label">{label}</Text>
    </View>
  );
}
