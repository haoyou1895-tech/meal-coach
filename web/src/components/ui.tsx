"use client";

import { useEffect, useState, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

/** 底部弹出层 */
export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="animate-sheet relative mx-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[#f4f6f4] pb-[calc(env(safe-area-inset-bottom,0px)+28px)]">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#f4f6f4] px-5 pb-2 pt-4">
          <span className="text-[19px] font-bold">{title}</span>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-500 shadow-sm"
            aria-label="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>
  );
}

/** 数字步进器：既能点加减，也能直接点数字输入 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  big,
  decimals,
  belowHint,
  aboveHint,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  big?: boolean;
  /** 保留几位小数，默认由 step 推导 */
  decimals?: number;
  /** 低于下限时说什么。不传就只说范围 */
  belowHint?: string;
  /** 高于上限时说什么 */
  aboveHint?: string;
}) {
  // step < 1 时保留一位小数，否则取整。
  // 浮点累加必须收口，否则 73.1 + 0.1 会显示成 73.100000000000
  const digits = decimals ?? (step < 1 ? 1 : 0);
  const fix = (v: number) => {
    const f = 10 ** digits;
    return Math.round(v * f) / f;
  };
  const set = (v: number) => {
    const next = fix(Math.min(max, Math.max(min, v)));
    if (next !== value) onChange(next);
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // 输超范围了要说出来。以前是悄悄夹回边界，用户看着数字自己跳走，
  // 不知道是输错了还是软件坏了。
  const [rangeMsg, setRangeMsg] = useState("");

  const startEdit = () => {
    setDraft(fix(value).toFixed(digits));
    setRangeMsg("");
    setEditing(true);
  };
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      if (parsed < min) {
        setRangeMsg(belowHint ?? `最少填 ${fix(min)}${unit}`);
        if (fix(min) !== value) onChange(fix(min));
      } else if (parsed > max) {
        setRangeMsg(aboveHint ?? `最多填 ${fix(max)}${unit}`);
        if (fix(max) !== value) onChange(fix(max));
      } else {
        setRangeMsg("");
        set(parsed);
      }
    }
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setRangeMsg("");
            set(fix(value) - step);
          }}
          disabled={fix(value) <= min}
          aria-label="减"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-[28px] font-bold text-ink-700 shadow-sm transition active:scale-95 disabled:opacity-30"
        >
          −
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-1.5">
          {editing ? (
            <input
              autoFocus
              value={draft}
              inputMode={digits > 0 ? "decimal" : "numeric"}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="直接输入数字"
              className={`w-[4.4em] border-b-2 border-brand-500 bg-transparent text-center font-bold tabular-nums tracking-tight focus:outline-none ${
                big ? "text-[56px] leading-none" : "text-[44px] leading-none"
              }`}
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              aria-label="点这里可以直接输入"
              className={`font-bold tabular-nums tracking-tight active:opacity-60 ${
                big ? "text-[56px] leading-none" : "text-[44px] leading-none"
              }`}
            >
              {fix(value).toFixed(digits)}
            </button>
          )}
          <span className="text-[17px] font-medium text-ink-500">{unit}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setRangeMsg("");
            set(fix(value) + step);
          }}
          disabled={fix(value) >= max}
          aria-label="加"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-[28px] font-bold text-ink-700 shadow-sm transition active:scale-95 disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p
        className={`mt-2 text-center text-[12px] ${
          rangeMsg ? "text-[#b23c2c]" : "text-ink-300"
        }`}
      >
        {rangeMsg || "点数字可以直接输入"}
      </p>
    </div>
  );
}

/** 选项卡片 */
export function OptionCard({
  active,
  onClick,
  title,
  desc,
  multi,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`opt ${active ? "opt-active" : ""}`}
    >
      <span className="flex flex-col py-3">
        <span>{title}</span>
        {desc && (
          <span className="mt-0.5 text-[14px] font-normal text-ink-500">
            {desc}
          </span>
        )}
      </span>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center ${
          multi ? "rounded-lg" : "rounded-full"
        } border-2 ${
          active
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-ink-300 bg-white"
        }`}
      >
        {active && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2.5 7.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

/** 顶部返回 + 进度 */
export function ProgressBar({ value, total }: { value: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${(value / total) * 100}%` }}
        />
      </div>
      <span className="w-10 text-right text-[14px] font-medium text-ink-500 tabular-nums">
        {value}/{total}
      </span>
    </div>
  );
}

/** 热量进度环 */
export function CalorieRing({
  used,
  budget,
  tone,
}: {
  used: number;
  budget: number;
  tone: "good" | "warn" | "over";
}) {
  const size = 232;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, budget > 0 ? used / budget : 0);
  const color =
    tone === "over" ? "#d94f3d" : tone === "warn" ? "#e8871e" : "#1f8a5b";
  const left = Math.max(0, budget - used);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e7eae8"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset .6s ease, stroke .3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[14px] font-medium text-ink-400">
          {tone === "over" ? "超了" : "还能吃"}
        </span>
        <span
          className="mt-0.5 text-[58px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color }}
        >
          {tone === "over" ? Math.round(used - budget) : Math.round(left)}
        </span>
        <span className="mt-1 text-[13px] font-medium tabular-nums text-ink-300">
          / {budget}
        </span>
      </div>
    </div>
  );
}

/** 营养素小条 */
/**
 * 三个成分条。
 *
 * 以前是"蛋白绿、碳水橙、脂肪红" —— 但红条只填了 77% 的时候，
 * 长辈看到红色会以为已经超标了。颜色该说状态，不该说类别。
 * 所以现在统一：没超是灰绿，快到了是黄，超了才是红。
 */
/**
 * 一个营养素一列：图标定位、名称说清楚、数字最大。
 *
 * 这里试过只留图标加一个字（蛋/饭/油），失败了 —— 蛋白质不是鸡蛋，
 * 碳水也不是饭。图标的作用是让人一眼扫到，不是替人说出名字。
 */
export function MacroBar({
  icon,
  color,
  label,
  value,
  target,
  unit,
}: {
  icon: IconName;
  /** 图标自身的颜色，只用来区分三类，不用来表示状态 */
  color: string;
  /** 中文名，界面上完整显示：蛋白质 / 碳水 / 脂肪 */
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const ratio = target > 0 ? value / target : 0;
  const pct = Math.min(100, ratio * 100);
  const over = ratio > 1.05;
  const near = !over && ratio >= 0.85;
  const barColor = over ? "#d94f3d" : near ? "#e0a83a" : "#8fae9c";

  return (
    <div className="flex-1">
      <div className="flex items-center gap-1">
        <Icon
          name={icon}
          size={14}
          style={{ color: over ? "#b23c2c" : color }}
        />
        <span className="text-[13px] leading-none text-ink-500">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-0.5">
        <span
          className={`text-[18px] font-semibold leading-none tabular-nums ${
            over ? "text-[#b23c2c]" : "text-ink-700"
          }`}
        >
          {Math.round(value)}
        </span>
        <span className="text-[11px] font-normal leading-none text-ink-300">
          /{target}
          {unit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.07]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}
