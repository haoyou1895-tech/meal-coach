import { Text, View } from "@tarojs/components";
import "./ProgressBar.scss";

/**
 * 引导页顶部的进度条。对着网页版 ui.tsx 的 ProgressBar 抄：
 * 一条 6.375px 的圆角轨道 + 右侧「3/8」。
 *
 * 有数字是必要的 —— 只有一条线的话，走到第 6 步会以为快完了，
 * 结果还剩两步，那种「怎么还没完」比进度条本身更劝退。
 */
export default function ProgressBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const pct = Math.round((value / total) * 100);
  return (
    <View className="pbar">
      <View className="pbar-track">
        <View className="pbar-fill" style={{ width: `${pct}%` }} />
      </View>
      <Text className="pbar-count">
        {value}/{total}
      </Text>
    </View>
  );
}
