import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import "./Splash.scss";

/**
 * 开屏。照 web/src/components/Splash.tsx 搬的。
 *
 * 句子每次打开都随机 —— 一天一句像公告牌，几次看到同一句就不再读了。
 * 都往应酬、饭局、酒上靠：这是这个用户真实的场景，
 * 泛泛的"要健康"对他没用。
 */
const LINES = [
  "咸的少一口，血压降一点",
  "每顿少一口，三个月后看得见",
  "不用饿着，换个吃法就行",
  "先吃菜再吃饭，血糖稳，也扛饿",
  "今天这顿记下来，就够了",
  "慢一点没关系，别停下",
  "应酬躲不掉，回来记一笔就行",
  "喝酒那顿，第二天清淡点",
  "一荤两素，比什么都强",
  "汤泡饭最省事，也最容易吃多",
  "吃到七分饱，下午不犯困",
  "能走两步就走两步，不算白走",
  "今天的账今天记，明天就忘了",
  "少喝一口汤，少吃半勺盐",
  "不是要你忌口，是要你心里有数",
];

/** 碗的图形。小程序没有 <svg>，只能把同一份路径画进 data URI 当背景图 */
function bowlBg() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 48 48" fill="none">` +
    `<path d="M5.5 21.5h37c0 9.4-8.3 17-18.5 17S5.5 30.9 5.5 21.5z" stroke="#ffffff" stroke-width="2.3" stroke-linejoin="round"/>` +
    `<path d="M12 16.5c1.6-4 6.4-6.5 12-6.5s10.4 2.5 12 6.5" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" opacity="0.55"/>` +
    `<circle cx="24" cy="28" r="2" fill="#ffffff" opacity="0.9"/></svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}

export default function Splash({ onDone }: { onDone: () => void }) {
  const [line, setLine] = useState(LINES[0]);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLine(LINES[Math.floor(Math.random() * LINES.length)]);
    // 1 秒开始淡出，1.4 秒交回首页；留 0.4 秒给过渡，不然是硬切
    const t1 = setTimeout(() => setLeaving(true), 1000);
    const t2 = setTimeout(onDone, 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <View className={`splash ${leaving ? "is-leaving" : ""}`}>
      <View className="splash-mid">
        <View className="splash-bowl" style={{ backgroundImage: bowlBg() }} />
        <Text className="splash-name">餐谋</Text>
        <View className="splash-hr" />
        <Text className="splash-line">{line}</Text>
      </View>
      <Text className="splash-foot">吃饭这件事，有个参谋</Text>
    </View>
  );
}
