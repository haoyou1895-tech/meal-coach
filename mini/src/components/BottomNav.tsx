import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import Icon, { type IconName } from "./Icon";
import "./BottomNav.scss";

/**
 * 底部操作区。
 *
 * 不用小程序原生 tabBar：原生那条是白底灰字，选中态是绿色文字，
 * 而网页版是一个白色圆角卡片浮在页面上、上面还压着一个绿色大按钮。
 * 形状不一样，怎么调颜色都不会像。
 *
 * 所以关掉原生 tabBar（app.config 里已删），自己画。
 * 切页用 redirectTo：几个页面不需要返回栈，来回跳不涨内存。
 *
 * 三个 tab 跟网页版一一对应：吃 / 动 / 账。
 * 上一版是"今天 / 记录"两页，运动挤在首页的一行入口里 —— 网页版早就拆成三页了（ADR-021）。
 * 顺序、字、图标全照网页版：图标是 page.tsx 里内联的那三条路径，一个字没改。
 */

export type TabKey = "eat" | "move" | "ledger";

/** tab 和落地页的对应关系。写在一处，加 tab 只改这一张表 */
const ROUTES: Record<TabKey, string> = {
  eat: "/pages/index/index",
  move: "/pages/move/index",
  ledger: "/pages/record/index",
};

export default function BottomNav({
  active,
  showCapture,
  onCapture,
}: {
  active: TabKey;
  /** 只有首页显示"拍一张"大按钮 */
  showCapture: boolean;
  onCapture: () => void;
}) {
  const go = (t: TabKey) => {
    if (t === active) return;
    Taro.redirectTo({ url: ROUTES[t] });
  };

  return (
    <View className="bottombar">
      <View className="bottombar-grad">
        {showCapture && (
          <View className="capture-btn" hoverClass="tap" hoverStayTime={60} onClick={onCapture}>
            <Icon name="camera" size={24} color="#ffffff" />
            <Text className="capture-text">拍一张，记一餐</Text>
          </View>
        )}
        <View className="tabs">
          <TabButton active={active === "eat"} label="吃" icon="tabEat" onClick={() => go("eat")} />
          <TabButton active={active === "move"} label="动" icon="tabMove" onClick={() => go("move")} />
          <TabButton active={active === "ledger"} label="账" icon="calendar" onClick={() => go("ledger")} />
        </View>
      </View>
      <View className="bottombar-safe" />
    </View>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <View
      className={`tab-btn ${active ? "is-active" : ""}`}
      hoverClass="tap"
      hoverStayTime={60}
      onClick={onClick}
    >
      <Icon name={icon} size={22} color={active ? "#176f49" : "#6b7671"} />
      <Text className="tab-label">{label}</Text>
    </View>
  );
}
