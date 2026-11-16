"use client";

import { useRef, useState } from "react";
import type {
  FoodItem,
  Meal,
  MealType,
  Nutrition,
  NutritionPlan,
  Profile,
  RecognizeResult,
} from "@/lib/types";
import { guessMealType, mealTypeLabel, todayStr } from "@/lib/nutrition";
import { ruleComment } from "@/lib/comment";
import { Sheet } from "./ui";

type Phase = "idle" | "working" | "result" | "error";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** 压缩图片，避免上传大图拖慢识别 */
function compress(file: File, maxSide = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("画布不可用"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("图片读取失败"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function CameraSheet({
  open,
  onClose,
  profile,
  plan,
  dayKcalBefore,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  plan: NutritionPlan;
  dayKcalBefore: number;
  onSave: (m: Meal) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string>("");
  const [mealType, setMealType] = useState<MealType>(guessMealType());
  const [items, setItems] = useState<FoodItem[]>([]);
  const [base, setBase] = useState<Nutrition | null>(null);
  const [factors, setFactors] = useState<number[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [demo, setDemo] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setPhase("idle");
    setPreview("");
    setItems([]);
    setBase(null);
    setFactors([]);
    setErrMsg("");
    setDemo(false);
    setNote("");
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setPhase("working");
    setErrMsg("");
    try {
      const dataUrl = await compress(file);
      setPreview(dataUrl);
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, note }),
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

  /** 按倍率重算营养 */
  const computed: Nutrition = (() => {
    if (!base || !items.length) {
      return { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 };
    }
    const scaledKcal = items.reduce(
      (s, it, i) => s + it.kcal * (factors[i] ?? 1),
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

  const comment = ruleComment(computed, profile, plan, dayKcalBefore);

  const adjust = (i: number, delta: number) => {
    setFactors((prev) =>
      prev.map((f, idx) =>
        idx === i ? Math.min(2, Math.max(0.5, Math.round((f + delta) * 10) / 10)) : f,
      ),
    );
  };

  const save = () => {
    const meal: Meal = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()),
      date: todayStr(),
      mealType,
      items: items.map((it, i) => ({
        ...it,
        kcal: Math.round(it.kcal * (factors[i] ?? 1)),
      })),
      nutrition: computed,
      comment,
      adjusted: factors.some((f) => f !== 1),
      confidence,
      createdAt: new Date().toISOString(),
    };
    onSave(meal);
    reset();
    onClose();
  };

  return (
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
          const f = e.target.files?.[0];
          handleFile(f);
          e.target.value = "";
        }}
      />

      {phase === "idle" && (
        <div className="pb-4">
          <div className="mb-5 flex gap-2">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setMealType(t)}
                className={`h-12 flex-1 rounded-xl text-[16px] font-medium transition ${
                  mealType === t
                    ? "bg-brand-500 text-white"
                    : "bg-white text-ink-700 shadow-sm"
                }`}
              >
                {mealTypeLabel(t)}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[15px] font-medium text-ink-700">
                这顿吃了啥？
              </span>
              <span className="text-[13px] tabular-nums text-ink-300">
                {note.length > 0 ? `${note.length}/60` : "可以不填"}
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
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
              说出来它就不用猜，有汤、有凉菜的时候更准
            </p>
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

          <p className="mt-4 text-center text-[13px] leading-relaxed text-ink-300">
            盘子和碗一起拍进去更准
          </p>
        </div>
      )}

      {phase === "working" && (
        <div className="flex flex-col items-center py-8">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="刚拍的照片"
              className="h-44 w-44 rounded-2xl object-cover"
            />
          )}
          <div className="mt-6 flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500" />
          </div>
          <p className="mt-4 text-[17px] font-medium text-ink-700">
            正在看这些菜…
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="刚拍的照片"
                className="h-20 w-20 shrink-0 rounded-2xl object-cover"
              />
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
                  {computed.kcal}
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

          {note && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[13px] leading-relaxed text-ink-500">
              您说的「{note}」已经算进去了
            </p>
          )}

          <p className="mb-2 mt-5 text-[13px] text-ink-300">
            分量不对？点右边的加减调一下
          </p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div
                key={`${it.name}-${i}`}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-medium">{it.name}</p>
                  <p className="text-[13px] text-ink-300">
                    {it.portion} · 约 {Math.round(it.kcal * (factors[i] ?? 1))} 大卡
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => adjust(i, -0.5)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.05] text-[18px] font-bold text-ink-700 active:scale-95"
                  >
                    −
                  </button>
                  <span className="w-11 text-center text-[14px] font-semibold tabular-nums">
                    {factors[i] ?? 1} 份
                  </span>
                  <button
                    onClick={() => adjust(i, 0.5)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.05] text-[18px] font-bold text-ink-700 active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-4">
            <p className="text-[16px] font-medium leading-relaxed text-brand-700">
              {comment}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Macro label="蛋白" value={computed.protein} unit="g" />
            <Macro label="碳水" value={computed.carb} unit="g" />
            <Macro label="脂肪" value={computed.fat} unit="g" />
          </div>

          {confidence > 0 && confidence < 0.5 && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
              这张看不太清，数字是估算的，您可以点上面的加减改一下分量。
            </p>
          )}

          <div className="mt-6">
            <button className="btn-primary" onClick={save}>
              {demo ? "仍然记下（示例）" : "记上了"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl bg-white py-2.5">
      <p className="text-[12px] text-ink-300">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums">
        {value}
        <span className="text-[11px] font-normal text-ink-300">{unit}</span>
      </p>
    </div>
  );
}
