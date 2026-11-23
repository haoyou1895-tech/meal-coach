"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * 说明文字的总闸。
 *
 * 这个产品的默认状态是「一句解释都不给」。
 *
 * 原因不是极简好看，是那批字真的在挡路：一个四十多岁的人在饭局散场后
 * 打开它，只想把"走了多久"填进去。输入框下面那行"「和」隔开能一次记几种"，
 * 他读一遍要两秒，而这两秒里他可能就把手机放下了。
 *
 * 但他也不是永远不需要 —— 第一次用、或者搞不懂某个数字怎么来的时候，
 * 他得能把说明书翻出来。所以留一个开关（设置页「显示说明文字」），
 * 默认关，他自己开。
 *
 * 用法：所有解释性文字包进 <Explain>，状态性文字不要包。
 *   ✅ 包："按体重 78 公斤算，已经扣掉躺着也要消耗的那部分"
 *   ✅ 包："运动不抵扣今天的饭量"
 *   ❌ 不包："还没记" —— 这是状态，不是解释
 *   ❌ 不包：报错信息 —— 出错了必须说，那是功能不是注释
 */
const Ctx = createContext(false);

export function ExplainProvider({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return <Ctx.Provider value={show}>{children}</Ctx.Provider>;
}

export default function Explain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const show = useContext(Ctx);
  if (!show) return null;
  return (
    <p className={className ?? "mt-1.5 text-[12px] leading-relaxed text-ink-300"}>
      {children}
    </p>
  );
}

/**
 * 需要把说明塞进按钮/一行文字中间时（比如「从相册选　可多选」），
 * 用这个判断，自己决定渲染成 span 还是整段。
 */
export function useExplain(): boolean {
  return useContext(Ctx);
}
