"use client";

import { useMemo } from "react";
import type { WeightLog } from "@/lib/types";
import { round } from "@/lib/nutrition";
import Icon from "./Icon";

/**
 * 体重趋势。
 *
 * 减重的人最想看的不是"今天多少斤"，是"我有没有在往下走"。
 * 所以这里不画坐标轴、不画刻度，只给一条线加一句结论——
 * 数字留给上面那张卡片，这里只回答"趋势对不对"。
 */

const W = 300;
const H = 92;
const PAD = 6;

/** 两个 yyyy-mm-dd 之间差几天 */
function dayDiff(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00`).getTime();
  const t2 = new Date(`${b}T00:00:00`).getTime();
  return Math.round((t2 - t1) / 86400000);
}

function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function WeightTrend({
  weights,
  targetWeightKg,
}: {
  weights: WeightLog[];
  targetWeightKg: number;
}) {
  const data = useMemo(() => {
    // 按时间正序，只取最近 30 天的点
    const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!sorted.length) return [];
    const lastDate = sorted[sorted.length - 1].date;
    return sorted.filter((w) => dayDiff(w.date, lastDate) <= 30);
  }, [weights]);

  const view = useMemo(() => {
    if (data.length < 2) return null;

    const first = data[0];
    const last = data[data.length - 1];
    const span = Math.max(7, dayDiff(first.date, last.date));
    const ws = data.map((p) => p.weightKg);
    const lo = Math.min(...ws) - 0.6;
    const hi = Math.max(...ws) + 0.6;
    const range = hi - lo || 1;

    const pts = data.map((p) => {
      const x = PAD + (dayDiff(first.date, p.date) / span) * (W - PAD * 2);
      const y = PAD + (1 - (p.weightKg - lo) / range) * (H - PAD * 2);
      return { x, y, ...p };
    });

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${H} L${pts[0].x.toFixed(1)} ${H} Z`;

    const delta = round(last.weightKg - first.weightKg, 1);
    const days = Math.max(1, dayDiff(first.date, last.date));
    const perWeek = (delta / days) * 7;

    let verdict: string;
    if (delta <= -0.3) {
      if (perWeek < -0.9) {
        verdict = "掉得有点快，一周超过 1 公斤多半是水分，别饿着自己";
      } else if (perWeek <= -0.2) {
        verdict = "这个速度刚好，不伤身体也不容易反弹";
      } else {
        verdict = "在慢慢往下走，稳着来就行";
      }
    } else if (delta >= 0.3) {
      verdict = "最近在往上走，看看是不是菜太咸，或者这几天动得少了";
    } else {
      verdict = "体重基本没动。没动不等于没效果，先看腰围和精力";
    }

    return {
      pts,
      line,
      area,
      first,
      last,
      delta,
      verdict,
      remain: round(last.weightKg - targetWeightKg, 1),
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">体重变化</h2>
        <div className="card flex items-center gap-2.5">
          <Icon name="scale" size={20} className="shrink-0 text-ink-300" />
          <p className="text-[15px] leading-relaxed text-ink-500">
            一周称两次，早上空腹最准
          </p>
        </div>
      </section>
    );
  }

  if (!view) {
    return (
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[17px] font-bold">体重变化</h2>
        <div className="card">
          <p className="text-[15px] leading-relaxed text-ink-500">
            目前只有 1 次记录（{data[0].weightKg} 公斤）。
            <br />
            再记一次就能看到趋势线。
          </p>
        </div>
      </section>
    );
  }

  const down = view.delta < 0;

  return (
    <section className="mt-6 px-5">
      <h2 className="mb-3 text-[17px] font-bold">体重变化</h2>
      <div className="card">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`体重从 ${view.first.weightKg} 公斤变为 ${view.last.weightKg} 公斤`}
        >
          <defs>
            <linearGradient id="wtFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3f8f6b" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#3f8f6b" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={view.area} fill="url(#wtFill)" />
          <path
            d={view.line}
            fill="none"
            stroke="#3f8f6b"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {view.pts.map((p, i) => {
            const isLast = i === view.pts.length - 1;
            return (
              <circle
                key={p.date}
                cx={p.x}
                cy={p.y}
                r={isLast ? 4 : 2.4}
                fill={isLast ? "#3f8f6b" : "#ffffff"}
                stroke="#3f8f6b"
                strokeWidth={isLast ? 0 : 1.6}
              />
            );
          })}
        </svg>

        <div className="mt-1 flex items-baseline justify-between text-[12px] text-ink-300">
          <span>{mmdd(view.first.date)}</span>
          <span>{mmdd(view.last.date)}</span>
        </div>

        <div className="mt-3 flex items-end justify-between border-t border-black/[0.05] pt-3">
          <div>
            <p className="text-[13px] text-ink-300">这段时间</p>
            <p
              className={`mt-0.5 text-[22px] font-bold leading-none tabular-nums ${
                down ? "text-brand-500" : "text-ink-700"
              }`}
            >
              {down ? "" : "+"}
              {view.delta} kg
            </p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-ink-300">距目标</p>
            <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums">
              {view.remain > 0 ? `${view.remain} kg` : "已达成"}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-600">
          {view.verdict}
        </p>
      </div>
    </section>
  );
}
