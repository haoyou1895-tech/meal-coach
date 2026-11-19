import { Text, View } from "@tarojs/components";
import { useMemo } from "react";
import { round } from "../lib/nutrition";
import type { WeightLog } from "../lib/types";

/**
 * 体重趋势。与 web/src/components/WeightTrend.tsx 同一套算法、同一套配色。
 *
 * 小程序不支持 <svg> 标签，所以整张折线图（面积渐变 + 折线 + 圆点）
 * 拼成一个 SVG 字符串，编码成背景图。坐标、线宽、圆点半径全部照抄，
 * 区别只有一个：点不能点了（背景图没有热区），跳到那天的功能去掉。
 */

const W = 300;
const H = 92;
const PAD = 6;

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
      return { x, y, date: p.date, weightKg: p.weightKg };
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
      verdict = "最近在往上走，看看是不是菜里盐太多，或者这几天动得少了";
    } else {
      verdict = "体重基本没动。没动不等于没效果，先看腰围和精力";
    }

    const circles = pts
      .map((p, i) => {
        const isLast = i === pts.length - 1;
        return isLast
          ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#3f8f6b"/>`
          : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="#ffffff" stroke="#3f8f6b" stroke-width="1.6"/>`;
      })
      .join("");

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
      `<defs><linearGradient id="wtFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#3f8f6b" stop-opacity="0.16"/>` +
      `<stop offset="100%" stop-color="#3f8f6b" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<path d="${area}" fill="url(#wtFill)"/>` +
      `<path d="${line}" fill="none" stroke="#3f8f6b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      circles +
      `</svg>`;

    return {
      bg: `url('data:image/svg+xml,${encodeURIComponent(svg)}')`,
      first,
      last,
      delta,
      verdict,
      remain: round(last.weightKg - targetWeightKg, 1),
    };
  }, [data, targetWeightKg]);

  if (data.length === 0) return null;

  // 只记过一次：画不出线，但也不值得占一张卡片
  if (!view) {
    return (
      <Text className="trend-hint">再称一次，这里会画出体重变化</Text>
    );
  }

  const down = view.delta < 0;

  return (
    <View className="sec mt6">
      <Text className="h2">体重变化</Text>
      <View className="card">
        <View className="trend-chart" style={{ backgroundImage: view.bg }} />

        <View className="trend-axis">
          <Text className="trend-axis-text">{mmdd(view.first.date)}</Text>
          <Text className="trend-axis-text">{mmdd(view.last.date)}</Text>
        </View>

        <View className="trend-foot">
          <View>
            <Text className="trend-foot-label">这段时间</Text>
            <Text className={`trend-delta ${down ? "is-down" : ""}`}>
              {down ? "" : "+"}
              {view.delta} kg
            </Text>
          </View>
          <View className="trend-right">
            <Text className="trend-foot-label">距目标</Text>
            <Text className="trend-remain">
              {view.remain > 0 ? `${view.remain} kg` : "已达成"}
            </Text>
          </View>
        </View>

        <Text className="trend-verdict">{view.verdict}</Text>
      </View>
    </View>
  );
}
