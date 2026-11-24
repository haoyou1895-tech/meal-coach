import { Input, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import "./ExStepper.scss";

/**
 * 运动用的小号数字输入。对着 web/src/components/Stepper.tsx 抄。
 *
 * 为什么不复用 components/Stepper.tsx：那个是"大号、带提示行"的版本，
 * 用在体重和身高上；这里是塞进一条已有列表行里的紧凑版（h-8），
 * 上面是名字、下面是卡路里，再摆一个带提示行的大号控件，行高就撑开了。
 * 网页版也是两个组件，这里跟着分。
 *
 * 两种输入方式同时给：
 * - 只给 ± 的人，想填 55 要点八下，于是凑个 50 就算了 —— 账从这一下开始失真。
 * - 只给打字的人，在手机上要先点开键盘、再点数字、再收起，对"顺手记一下"太重。
 */
export default function ExStepper({
  value,
  onChange,
  min = 5,
  max = 240,
  step = 5,
  unit = "分",
  compact = false,
  decimal = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** 塞进已有的列表行里用：矮一档、窄一档 */
  compact?: boolean;
  /** 允许一位小数。公里要用，分钟和个数不用 */
  decimal?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  // 外部改了值（比如切了运动项），输入框要跟着走
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const digits = decimal ? 1 : 0;
  const round = (n: number) => Math.round(n * 10 ** digits) / 10 ** digits;
  const clamp = (n: number) => round(Math.max(min, Math.min(max, n)));

  /** 打字时只留数字和**一个**小数点，否则 "5.5.5" 会被 Number() 读成 NaN */
  function clean(s: string): string {
    if (!decimal) return s.replace(/[^\d]/g, "");
    const only = s.replace(/[^\d.]/g, "");
    const [head, ...rest] = only.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head;
  }

  function commit(raw: string) {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
      setDraft(String(value));
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  function bump(d: number) {
    const next = clamp(value + d);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <View className={`exstep ${compact ? "is-compact" : ""}`}>
      <View
        className={`exstep-btn ${compact ? "is-compact" : ""}`}
        hoverClass="tap"
        hoverStayTime={60}
        onClick={() => bump(-step)}
      >
        <Text className="exstep-sign">−</Text>
      </View>

      <Input
        className={`exstep-input ${compact ? "is-compact" : ""} ${
          compact && decimal ? "is-wide" : ""
        }`}
        type={decimal ? "digit" : "number"}
        value={draft}
        onInput={(e) => setDraft(clean(e.detail.value))}
        onBlur={(e) => commit(e.detail.value)}
        onConfirm={(e) => commit(e.detail.value)}
      />

      <View
        className={`exstep-btn ${compact ? "is-compact" : ""}`}
        hoverClass="tap"
        hoverStayTime={60}
        onClick={() => bump(step)}
      >
        <Text className="exstep-sign">+</Text>
      </View>

      <Text className={`exstep-unit ${compact ? "is-compact" : ""}`}>{unit}</Text>
    </View>
  );
}
