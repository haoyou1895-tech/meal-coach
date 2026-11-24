import { Text } from "@tarojs/components";
import type { ReactNode } from "react";

/**
 * 说明文字的总闸（对着 web/src/components/Explain.tsx 抄）。
 *
 * 默认一句都不给：四十多岁的人在饭局散场后打开这一页，只想把"走了多久"填进去，
 * 输入框下面那行解释他读一遍两秒，两秒里手机可能就放下了。
 *
 * 网页版用 Context 传开关；小程序这边没有 Provider 的层级，
 * 用一个模块级的开关 —— 页面在渲染前调 setExplainShow(state.hints)，
 * 状态一变整页重渲染，读到的就是新值。
 *
 * 规矩一样：解释性文字包进来，状态（"还没记"）和报错不要包。
 */
let SHOW = false;

export function setExplainShow(v: boolean) {
  SHOW = !!v;
}

export default function Explain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  if (!SHOW) return null;
  return <Text className={className ?? "explain"}>{children}</Text>;
}
