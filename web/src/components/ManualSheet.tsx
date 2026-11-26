"use client";

import { useEffect, useMemo, useState } from "react";
import { useExplain } from "@/components/Explain";
import { Sheet } from "@/components/ui";
import { ruleComment } from "@/lib/comment";
import { amountInText, classify, presetToPortion, stripAmount } from "@/lib/manual";
import type { Preset } from "@/lib/manual";
import { guessMealType, todayStr } from "@/lib/nutrition";
import type { Meal, Nutrition, NutritionPlan, Profile } from "@/lib/types";

/** 已经算好的一样东西 */
type Row = {
  name: string;
  /** 他说的话：一斤、一碗 */
  portion: string;
  kcal: number;
  nutrition: Nutrition;
};

const EMPTY: Nutrition = { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 };

/**
 * 「没拍照，直接说」—— 吃完才发现忘了拍的那一顿。
 *
 * 为什么必须单独开一条路，而不是在拍照界面里塞个输入框：
 * 拍照那条路的起点是一张图，识别接口没有图就直接 400。文字在那边只是"补充"，
 * 用来告诉模型照片里没拍到的东西。而这里的用户根本没有图，
 * 他是凭记忆说"我吃了什么" —— 起点就不是同一个东西。
 *
 * 这个组件的核心不是输入框，是**问什么单位**：
 * 牛肉按斤问，米饭按碗问，烧烤按串问，可乐按瓶问。
 * 统一问"多少克"等于让他先做一次心算，那一秒他就放弃了。
 * 单位策略在 lib/manual.ts，这里只负责把它问出来。
 */
export default function ManualSheet({
  open,
  onClose,
  profile,
  plan,
  dayKcalBefore,
  todayMeals,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  plan: NutritionPlan;
  dayKcalBefore: number;
  todayMeals: Meal[];
  onSave: (m: Meal) => void;
}) {
  const showHints = useExplain();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Preset | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState("");

  /** 换名字就重置选中的档位 —— 上一样选的"一斤"不能留给下一样 */
  useEffect(() => {
    setPicked(null);
    setTip("");
  }, [name]);

  /** 该问什么单位 */
  const cls = useMemo(() => classify(name), [name]);
  /** 他自己说了量（"一斤牛肉"）就不用再问 —— 问了是在侮辱人 */
  const written = useMemo(() => amountInText(name), [name]);

  const reset = () => {
    setName("");
    setPicked(null);
    setRows([]);
    setTip("");
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const total = rows.reduce(
    (s, r) => ({
      kcal: s.kcal + r.nutrition.kcal,
      protein: s.protein + r.nutrition.protein,
      carb: s.carb + r.nutrition.carb,
      fat: s.fat + r.nutrition.fat,
      sodium: s.sodium + r.nutrition.sodium,
    }),
    { ...EMPTY },
  );

  /**
   * 加一样。
   *
   * 每加一样就去算一次，而不是攒到最后一起算 ——
   * 攒起来算的话，他得等所有都输完才知道第一个对不对，
   * 而"牛肉火锅"这种东西算出来往往是三位数，他看见就要改说法。
   */
  const add = async () => {
    const raw = name.trim().slice(0, 20);
    if (!raw || busy) return;
    const preset = written ?? picked;
    if (!preset) {
      setTip("先选吃了多少");
      return;
    }
    /*
     * 名字和量分开存。
     * 他说"一斤牛肉"，量已经在 preset 里了，名字只该留"牛肉" ——
     * 否则列表里会出现「一斤牛肉　一斤」，同一件事说两遍。
     */
    const n = written ? stripAmount(raw) : raw;
    setBusy(true);
    setTip("");
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, portion: presetToPortion(preset) }),
      });
      if (!res.ok) throw new Error("estimate failed");
      const data = (await res.json()) as { nutrition?: Nutrition };
      const nut = data.nutrition;
      // 算出 0 大卡等于没算 —— 宁可报错，也不能往账本里塞一个假数字
      if (!nut || !(nut.kcal > 0)) throw new Error("empty");
      setRows((prev) => [
        ...prev,
        { name: n, portion: preset.label, kcal: Math.round(nut.kcal), nutrition: nut },
      ]);
      setName("");
    } catch {
      setTip("这个没算出来，换个说法再试一次");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!rows.length || busy) return;
    const now = new Date();
    const mealType = guessMealType(now, todayMeals.map((m) => m.mealType));
    const nutrition: Nutrition = {
      kcal: Math.round(total.kcal),
      protein: Math.round(total.protein),
      carb: Math.round(total.carb),
      fat: Math.round(total.fat),
      sodium: Math.round(total.sodium),
    };
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(now.getTime());

    const meal: Meal = {
      id,
      date: todayStr(),
      mealType,
      items: rows.map((r) => ({ name: r.name, portion: r.portion, kcal: r.kcal })),
      nutrition,
      comment: ruleComment(nutrition, profile, plan, dayKcalBefore, mealType, now),
      // 不是"改过分量"，是整条都是他说的 —— 两者意义不同，别混成一个旗子
      adjusted: false,
      /*
       * 1 不是"模型很自信"，是"这东西是他自己报的"。
       * 名字绝对对，量按他选的，只有热量是估的 —— 比照片认出来的可信。
       */
      confidence: 1,
      createdAt: now.toISOString(),
      eatenAt: now.toISOString(),
    };
    onSave(meal);
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="没拍照片">
      <div className="space-y-4 pb-4">
        {/* 已经算好的，摞在上面 —— 他要能一眼看出"我一共吃了多少" */}
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={`${r.name}-${i}`}
                className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-medium text-ink-700">
                    {r.name}
                  </div>
                  <div className="text-[13px] text-ink-300">{r.portion}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[15px] tabular-nums text-ink-700">
                    {r.kcal} 卡
                  </span>
                  <button
                    type="button"
                    aria-label={`删掉 ${r.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 active:scale-95"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-medium text-ink-700">
              吃的是什么
            </span>
            <span className="text-[13px] text-ink-300">
              {name.length > 0 ? `${name.length}/20` : ""}
            </span>
          </div>
          <input
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="牛肉、米饭、一瓶可乐"
            className="w-full rounded-xl bg-white px-4 py-3 text-[17px] text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {showHints && (
            <p className="text-[13px] leading-relaxed text-ink-300">
              一次说一样。知道吃了多少就一起说，比如「一斤牛肉」。
            </p>
          )}
        </div>

        {/* 量：他自己说了就直接认，没说自己选 */}
        {name.trim().length > 0 && (
          <div className="space-y-2">
            {written ? (
              <div className="rounded-xl bg-brand-50 px-3.5 py-2.5">
                <span className="text-[14px] text-brand-600">
                  按你说的算：{written.label}
                  <span className="text-ink-300">
                    （约 {written.amount} {written.unit}）
                  </span>
                </span>
              </div>
            ) : (
              <>
                <p className="text-[15px] font-medium text-ink-700">
                  {cls.prompt}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cls.presets.map((p) => {
                    const on = picked?.label === p.label;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setPicked(p);
                          setTip("");
                        }}
                        className={`rounded-xl px-4 py-2.5 text-[15px] transition active:scale-[0.97] ${
                          on
                            ? "bg-brand-500 font-medium text-white"
                            : "bg-white text-ink-700"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {tip && <p className="text-[14px] text-[#b23c2c]">{tip}</p>}

        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !name.trim()}
          className="h-11 w-full rounded-xl bg-brand-500 text-[16px] font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "算着…" : "添加"}
        </button>

        {rows.length > 0 && (
          <>
            <div className="flex items-baseline justify-between border-t border-black/[0.06] pt-3">
              <span className="text-[15px] text-ink-500">
                一共 {rows.length} 样
              </span>
              <span className="text-[19px] font-semibold tabular-nums text-ink-700">
                {Math.round(total.kcal)} 大卡
              </span>
            </div>
            <button
              type="button"
              onClick={save}
              className="h-12 w-full rounded-xl bg-ink-700 text-[17px] font-medium text-white active:scale-[0.98]"
            >
              确定
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
