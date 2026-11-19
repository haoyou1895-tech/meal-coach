import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import "./Stepper.scss";

/**
 * 数字加减器。对着 web/src/components/ui.tsx 的 Stepper 抄。
 *
 * 网页版点数字可以改成键盘直接输，小程序这边保留同样的行为 ——
 * 46 岁的人调身高，点 30 次加号会烦，点数字直接打「172」才是他想的。
 *
 * 输超范围不能悄悄夹回边界：数字自己跳走，用户不知道是输错了还是软件坏了。
 * 所以给一句提示，说清楚范围。
 */
export default function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  big,
  belowHint,
  aboveHint,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  big?: boolean;
  belowHint?: string;
  aboveHint?: string;
}) {
  // step < 1 时保留一位小数，否则取整。
  // 浮点累加必须收口，否则 73.1 + 0.1 会显示成 73.100000000000
  const digits = step < 1 ? 1 : 0;
  const fix = (v: number) => {
    const f = 10 ** digits;
    return Math.round(v * f) / f;
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [rangeMsg, setRangeMsg] = useState("");

  const set = (v: number) => {
    const next = fix(Math.min(max, Math.max(min, v)));
    if (next !== value) onChange(next);
  };

  const startEdit = () => {
    setDraft(fix(value).toFixed(digits));
    setRangeMsg("");
    setEditing(true);
  };

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      if (parsed < min) {
        setRangeMsg(belowHint ?? `最少填 ${fix(min)}${unit}`);
        if (fix(min) !== value) onChange(fix(min));
      } else if (parsed > max) {
        setRangeMsg(aboveHint ?? `最多填 ${fix(max)}${unit}`);
        if (fix(max) !== value) onChange(fix(max));
      } else {
        setRangeMsg("");
        set(parsed);
      }
    }
    setEditing(false);
  };

  return (
    <View className="stepper">
      <View className="stepper-row">
        <View
          className={`stepper-btn ${fix(value) <= min ? "is-off" : ""}`}
          hoverClass={fix(value) <= min ? "none" : "tap"}
          onClick={() => {
            if (fix(value) <= min) return;
            setRangeMsg("");
            set(fix(value) - step);
          }}
        >
          <Text className="stepper-sign">−</Text>
        </View>

        <View className="stepper-mid">
          {editing ? (
            <Input
              className={`stepper-input ${big ? "is-big" : ""}`}
              type="digit"
              focus
              value={draft}
              onInput={(e) => setDraft(e.detail.value.replace(/[^\d.]/g, ""))}
              onBlur={commit}
              onConfirm={commit}
            />
          ) : (
            <Text
              className={`stepper-num ${big ? "is-big" : ""}`}
              onClick={startEdit}
            >
              {fix(value).toFixed(digits)}
            </Text>
          )}
          <Text className="stepper-unit">{unit}</Text>
        </View>

        <View
          className={`stepper-btn ${fix(value) >= max ? "is-off" : ""}`}
          hoverClass={fix(value) >= max ? "none" : "tap"}
          onClick={() => {
            if (fix(value) >= max) return;
            setRangeMsg("");
            set(fix(value) + step);
          }}
        >
          <Text className="stepper-sign">+</Text>
        </View>
      </View>

      <Text className={`stepper-hint ${rangeMsg ? "is-err" : ""}`}>
        {rangeMsg || "点数字可以直接输入"}
      </Text>
    </View>
  );
}
