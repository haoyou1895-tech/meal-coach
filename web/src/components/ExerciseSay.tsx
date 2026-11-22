"use client";

import { useMemo, useState } from "react";

/**
 * 一句话记运动。
 *
 * 为什么要有这个框：按钮的前提是他先认出"我做的事叫什么"。
 * 可他心里的话是"楼下遛了一圈""打了两局乒乓"，和按钮上的字之间隔着一层翻译。
 * 翻译只要错一次，他就不记了。所以这个框收口语，也收语音。
 *
 * 为什么语音放在框下面而不是框里面：麦克风要显示"正在听 3s / 转文字…"，
 * 塞进 input 右侧那一小块，字会被挤成两行，而且录音时他根本看不见状态。
 */

import VoiceInput from "./VoiceInput";
import { parseExerciseText } from "@/lib/exerciseParse";
import type { ParsedExercise } from "@/lib/exerciseParse";

export default function ExerciseSay({
  placeholder,
  actionLabel,
  ariaLabel,
  onSubmit,
  footnote,
}: {
  placeholder: string;
  actionLabel: string;
  ariaLabel: string;
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
    <div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (err) setErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
            }
          }}
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 rounded-xl bg-black/[0.04] px-3 text-[15px] outline-none placeholder:text-[13px] placeholder:text-ink-300 focus:bg-black/[0.06]"
        />
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => commit(text)}
          className="h-11 shrink-0 rounded-xl bg-black/[0.05] px-3.5 text-[15px] font-medium text-brand-600 transition active:scale-95 disabled:opacity-40"
        >
          {actionLabel}
        </button>
      </div>

      <VoiceInput
        ariaLabel={ariaLabel}
        onText={(t) => {
          setText(t);
          commit(t);
        }}
      />

      {err ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-warn-600">{err}</p>
      ) : footnote ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">{footnote}</p>
      ) : null}
    </div>
  );
}
