"use client";

import { useEffect, useMemo, useState } from "react";
import { useExplain } from "@/components/Explain";
import { Sheet } from "@/components/ui";
import { ruleComment } from "@/lib/comment";
import {
  DEFAULT_CLASS,
  amountInText,
  classify,
  presetToPortion,
  stripAmount,
} from "@/lib/manual";
import type { FoodClass, Preset } from "@/lib/manual";
import { getCached, putCached } from "@/lib/portionCache";
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

  /** 本地规则表的判定 */
  const localCls = useMemo(() => classify(name), [name]);
  /** 他自己说了量（"一斤牛肉"）就不用再问 —— 问了是在侮辱人 */
  const written = useMemo(() => amountInText(name), [name]);

  /** AI 想出来的档位（只在这个词本地查不到时才有） */
  const [aiCls, setAiCls] = useState<FoodClass | null>(null);
  const [aiState, setAiState] = useState<"idle" | "wait" | "fail">("idle");

  /*
   * 本地查不到才问 AI。
   *
   * 为什么不把这一步做成"点一下再问"：他已经输了名字，
   * 再让他点一次"帮我算"就是多一步，而这一步没有任何选择价值。
   *
   * 为什么 500ms 才发：他会一个字一个字打（玉 → 玉米 → 玉米粒），
   * 每敲一下就请求一次，三次里两次是废的。
   *
   * 为什么第 0 秒就显示"想一下"：如果等 500ms 后再切状态，
   * 这半秒里屏幕上显示的是兜底类的「一小份 / 一份 / 大份」——
   * 他手快就点下去了，点完 AI 的档位才到。所以从输入那刻起就是等待态。
   */
  useEffect(() => {
    setAiCls(null);
    const key = name.trim();
    if (!key || localCls.id !== "other" || written) {
      setAiState("idle");
      return;
    }

    const hit = getCached(key);
    if (hit) {
      setAiCls(hit);
      setAiState("idle");
      return;
    }

    setAiState("wait");
    // 名字又变了就别管这次的结果 —— 否则"玉米"的档位会盖到"小龙虾"上
    let dead = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/portion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: key }),
        });
        if (!res.ok) throw new Error("no");
        const data = (await res.json()) as {
          prompt?: string;
          presets?: Preset[];
        };
        if (!data?.prompt || !Array.isArray(data.presets) || data.presets.length < 2) {
          throw new Error("bad");
        }
        const got: FoodClass = { id: "ai", prompt: data.prompt, presets: data.presets };
        putCached(key, got);
        if (!dead) {
          setAiCls(got);
          setAiState("idle");
        }
      } catch {
        // 想不出来就落回兜底档位：问粗一点，好过卡在这
        if (!dead) setAiState("fail");
      }
    }, 500);

    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [name, localCls, written]);

  /**
   * 最终用哪套档位：本地命中就用本地的（瞬出、永远一样），
   * 没命中才用 AI 的；AI 也没成，落兜底。
   */
  const cls: FoodClass =
    localCls.id !== "other" ? localCls : (aiCls ?? DEFAULT_CLASS);

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
            ) : aiState === "wait" ? (
              /*
               * 等待态不摆按钮。
               * 摆了的话他可能先点下去，而那是兜底类的「一份」——
               * 点完上面才换成「一根 / 两根」，得再选一次，等于白点。
               */
              <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-3">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-500" />
                <span className="animate-pulse text-[15px] text-ink-300">
                  想想怎么量…
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
