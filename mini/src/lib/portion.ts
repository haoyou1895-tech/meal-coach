/* 自动同步自 web/src/lib/portion.ts，不要在这里改，改 web 那份再跑 npm run sync */
/**
 * 份量的三档，用词不用数。
 *
 * 上一版是「− 1 份 +」，步进 0.5。那个设计假设用户会在心里换算
 * "我大概吃了 0.5 份" —— 而人在饭桌上想的是"还剩半盘"，或者
 * "我就夹了两筷子"。数字是给机器看的，词才是给人用的。
 *
 * 为什么只有三档、没有"更多"：
 * 误差的大头是"没吃完"，不是"吃了两份"。真吃了两碗饭的人极少，
 * 而为了极少数情况多摆一个按钮，会让每道菜都变复杂。
 * 舍掉"更多"，换来一眼就懂的三个词。
 */
export const PORTION_STEPS = [
  { v: 0.25, label: "几口" },
  { v: 0.5, label: "一半" },
  { v: 1, label: "全吃了" },
] as const;

/**
 * 老记录里存着 0.5 / 1 / 1.5 / 2 这种倍率（加减号那一版留下的）。
 * 三个按钮显示哪个"亮着"，不能直接比相等，否则 1.5 份的记录三个都不亮，
 * 看起来像坏了。取最接近的一档。
 */
export function nearestStep(factor: number): number {
  let best = PORTION_STEPS[0].v as number;
  let gap = Infinity;
  for (const s of PORTION_STEPS) {
    const d = Math.abs(s.v - factor);
    if (d < gap) {
      gap = d;
      best = s.v;
    }
  }
  return best;
}
