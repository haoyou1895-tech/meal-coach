"use client";

import { useEffect, type ReactNode } from "react";

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

/** 数字步进器：避免长辈调起键盘 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  big,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  big?: boolean;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-[28px] font-bold text-ink-700 shadow-sm transition active:scale-95 disabled:opacity-30"
      >
        −
      </button>
      <div className="flex flex-1 items-baseline justify-center gap-1.5">
        <span
          className={`font-bold tabular-nums tracking-tight ${
            big ? "text-[56px] leading-none" : "text-[44px] leading-none"
          }`}
        >
          {value}
        </span>
        <span className="text-[17px] font-medium text-ink-500">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-[28px] font-bold text-ink-700 shadow-sm transition active:scale-95 disabled:opacity-30"
      >
        +
      </button>
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
        <span className="text-[15px] font-medium text-ink-500">
          {tone === "over" ? "已超出" : "今天还能吃"}
        </span>
        <span
          className="mt-1 text-[58px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color }}
        >
          {tone === "over" ? Math.round(used - budget) : Math.round(left)}
        </span>
        <span className="mt-1.5 text-[15px] font-medium text-ink-500">
          共 {budget} 大卡 · 已吃 {Math.round(used)}
        </span>
      </div>
    </div>
  );
}

/** 营养素小条 */
export function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-ink-700">
          {Math.round(value)}
          <span className="ml-1 text-[11px] font-normal text-ink-300">
            / {target}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
