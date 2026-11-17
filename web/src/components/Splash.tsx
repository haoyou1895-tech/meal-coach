"use client";

import { useEffect, useState } from "react";

/**
 * 开屏的一句话。
 * 按日期取，保证一天之内每次打开看到的是同一句——
 * 天天换着花样反而像随机推送，同一句连着看几天才有分量。
 */
const LINES = [
  "每顿少一口，三个月后看得见",
  "不用饿着，换个吃法就行",
  "先吃菜再吃饭，血糖稳，也扛饿",
  "今天这顿记下来，就够了",
  "慢一点没关系，别停下",
  "咸的少一口，血压降一点",
];

function pickLine(now: Date) {
  const seed =
    now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
  return LINES[seed % LINES.length];
}

export default function Splash({ onDone }: { onDone: () => void }) {
  const [line] = useState(() => pickLine(new Date()));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // 少动效的人直接给内容，不做淡出
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const t1 = setTimeout(() => setLeaving(true), reduce ? 0 : 1000);
    const t2 = setTimeout(onDone, reduce ? 600 : 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-400 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "linear-gradient(165deg, #22935f 0%, #14663f 100%)" }}
      aria-label="正在打开餐谋"
    >
      <div className="animate-pop flex flex-col items-center px-10">
        <svg width="76" height="76" viewBox="0 0 48 48" fill="none">
          <path
            d="M5.5 21.5h37c0 9.4-8.3 17-18.5 17S5.5 30.9 5.5 21.5z"
            stroke="white"
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
          <path
            d="M12 16.5c1.6-4 6.4-6.5 12-6.5s10.4 2.5 12 6.5"
            stroke="white"
            strokeWidth="2.3"
            strokeLinecap="round"
            opacity="0.55"
          />
          <circle cx="24" cy="28" r="2" fill="white" opacity="0.9" />
        </svg>

        <p
          className="mt-5 text-[30px] font-bold tracking-[0.18em] text-white"
          style={{ paddingLeft: "0.18em" }}
        >
          餐谋
        </p>

        <div className="mt-4 h-px w-8 bg-white/30" />

        <p className="mt-4 text-center text-[17px] font-medium leading-relaxed text-white/85">
          {line}
        </p>
      </div>

      <p className="absolute bottom-12 text-[12px] tracking-widest text-white/35">
        吃饭这件事，有个参谋
      </p>
    </div>
  );
}
