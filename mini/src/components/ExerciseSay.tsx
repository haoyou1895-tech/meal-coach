import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import Explain from "./Explain";
import VoiceInput from "./VoiceInput";
import { parseExerciseText, type ParsedExercise } from "../lib/exerciseParse";
import "./ExerciseSay.scss";

/**
 * 一句话记运动。对着 web/src/components/ExerciseSay.tsx 抄。
 *
 * 为什么要有这个框：按钮的前提是他先认出"我做的事叫什么"。
 * 可他心里的话是"楼下遛了一圈""打了两局乒乓"，和按钮上的字之间隔着一层翻译。
 * 翻译只要错一次，他就不记了。所以这个框收口语，也收语音。
 *
 * 语音放在框下面而不是框里面：麦克风要显示"正在听 3s / 转文字…"，
 * 塞进输入框右侧那一小块，字会被挤成两行，录音时他根本看不见状态。
 */
export default function ExerciseSay({
  placeholder,
  actionLabel,
  onSubmit,
  footnote,
}: {
  placeholder: string;
  actionLabel: string;
  onSubmit: (items: ParsedExercise[]) => void;
  footnote?: string;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  function commit(raw: string) {
    const t = raw.trim();
    if (!t) return;
    const items = parseExerciseText(t);
    if (!items.length) {
      setErr("这句没听出运动。试试「快走 40 分钟」或者「游泳半小时」");
      return;
    }
    setErr("");
    setText("");
    onSubmit(items);
  }

  return (
    <View>
      <View className="say-row">
        <Input
          className="say-input"
          value={text}
          placeholder={placeholder}
          placeholderStyle="font-size:13px;color:#b6bdb9"
          confirmType="done"
          onInput={(e) => {
            setText(e.detail.value);
            if (err) setErr("");
          }}
          onConfirm={() => commit(text)}
        />
        <View
          className={`say-btn ${text.trim() ? "" : "is-disabled"}`}
          hoverClass={text.trim() ? "tap" : "none"}
          hoverStayTime={60}
          onClick={() => commit(text)}
        >
          <Text className="say-btn-text">{actionLabel}</Text>
        </View>
      </View>

      <VoiceInput
        onText={(t) => {
          setText(t);
          commit(t);
        }}
      />

      {err ? (
        <Text className="say-err">{err}</Text>
      ) : footnote ? (
        <Explain>{footnote}</Explain>
      ) : null}
    </View>
  );
}
