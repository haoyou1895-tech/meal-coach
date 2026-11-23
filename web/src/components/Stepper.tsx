"use client";

import { useEffect, useState } from "react";

/**
 * 数值输入，两种方式同时给：直接打字，或者按 − ＋ 微调。
 *
 * 为什么两种都要，而不是挑一种：
 *
 * - 只给 ± 的人，想填"55 分钟"要点八下。想填 95 的要点十七下，
 *   于是他会凑个 90 就算了 —— 账从这一下开始失真。
 * - 只给打字的人，在手机上要先点开键盘、再点数字、再点收起，
 *   这三步对"顺手记一下"来说太重。他更愿意点两下 +。
 *
 * 所以中间永远是输入框，两边永远有 ±。默认值先填好，他懒得改就直接用，
 * 那也是最省事的一条路。
 *
 * 几个刻意的处理：
 * 1. 打字过程中不 clamp。他打"1"的时候不能立刻被改成最小值 5，
 *    否则第二个字符永远打不进去。只在失焦或回车时收敛。
 * 2. 空值不报错，回落到上一次的有效值 —— 这地方不值得弹提示。
 * 3. 数字用等宽（tabular-nums），± 的时候数字不左右跳。
 */
export default function Stepper({
  value,
  onChange,
  min = 5,
  max = 240,
  step = 5,
  unit = "分",
  ariaLabel = "分钟数",
  compact = false,
  decimal = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  ariaLabel?: string;
  /** 塞进已有的列表行里用：矮一档、窄一档 */
  compact?: boolean;
  /**
   * 允许一位小数。公里（5.5 公里）和体重（78.1 公斤）要用，
   * 分钟和个数不用 —— 谁也不说"跳了 1523.4 个"。
   */
  decimal?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  // 外部改了值（比如切了运动项），输入框要跟着走
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const round = (n: number) => (decimal ? Math.round(n * 10) / 10 : Math.round(n));
  const clamp = (n: number) => round(Math.max(min, Math.min(max, n)));

  /** 打字时只留数字和**一个**小数点。不然 "5.5.5" 会被 Number() 读成 NaN */
  function clean(s: string): string {
    if (!decimal) return s.replace(/[^\d]/g, "");
    const only = s.replace(/[^\d.]/g, "");
    const [head, ...rest] = only.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head;
  }

  function commit(raw: string) {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
      setDraft(String(value));
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  function bump(d: number) {
    const next = clamp(value + d);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-0.5 rounded-xl bg-black/[0.05] ${
        compact ? "h-8 px-0.5" : "h-11 px-1"
      }`}
    >
      <button
        type="button"
        aria-label={`减少${unit}`}
        onClick={() => bump(-step)}
        className={`flex items-center justify-center rounded-lg font-medium text-ink-700 transition active:scale-90 active:bg-black/[0.06] ${
          compact ? "h-7 w-6 text-[15px]" : "h-9 w-8 text-[18px]"
        }`}
      >
        −
      </button>

      <input
        value={draft}
        onChange={(e) => setDraft(clean(e.target.value))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputMode={decimal ? "decimal" : "numeric"}
        aria-label={ariaLabel}
        className={`bg-transparent text-center font-semibold tabular-nums text-ink-700 outline-none ${
          compact
            ? decimal
              ? "w-9 text-[13px]"
              : "w-7 text-[13px]"
            : "w-11 text-[15px]"
        }`}
      />

      <button
        type="button"
        aria-label={`增加${unit}`}
        onClick={() => bump(step)}
        className={`flex items-center justify-center rounded-lg font-medium text-ink-700 transition active:scale-90 active:bg-black/[0.06] ${
          compact ? "h-7 w-6 text-[15px]" : "h-9 w-8 text-[18px]"
        }`}
      >
        +
      </button>

      <span
        className={`pr-1 text-ink-300 ${compact ? "text-[11px]" : "text-[12px]"}`}
      >
        {unit}
      </span>
    </div>
  );
}
