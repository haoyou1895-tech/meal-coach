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
 * 切页用 redirectTo：两个页面不需要返回栈，来回跳不涨内存。
 */

export type TabKey = "home" | "record";

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
    Taro.redirectTo({ url: t === "home" ? "/pages/index/index" : "/pages/record/index" });
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
          <TabButton active={active === "home"} label="今天" icon="home" onClick={() => go("home")} />
          <TabButton active={active === "record"} label="记录" icon="calendar" onClick={() => go("record")} />
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
