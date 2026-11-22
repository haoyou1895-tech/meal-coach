"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 说完话，自动变成文字填进描述框。
 *
 * 为什么不用浏览器自带的语音识别：
 * Chrome 的 SpeechRecognition 要把音频发到境外服务器，国内基本连不上，
 * 鸿蒙 ArkWeb 更是没有这个接口。所以老老实实录音 + 服务端转写。
 */

type Status = "idle" | "recording" | "uploading" | "error";

/** 60 个字，说着说着就超了；30 秒够讲两句 */
const MAX_SECONDS = 30;

/** 安卓 Chrome 和 ArkWeb 给 opus，iOS Safari 只给 mp4，按优先级挑一个能用的 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* 某些浏览器 isTypeSupported 会抛异常，忽略继续试 */
    }
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("录音读取失败"));
    reader.readAsDataURL(blob);
  });
}

export default function VoiceInput({
  onText,
  disabled,
  ariaLabel = "用语音说吃了什么",
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  /** 同一个按钮用在吃饭、记运动两处，读屏得说对地方 */
  ariaLabel?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const autoRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearTimers = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoRef.current) {
      window.clearTimeout(autoRef.current);
      autoRef.current = null;
    }
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      // 组件被关掉时如果还在录，一定要把麦克风放掉，否则一直亮着录音灯
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      releaseMic();
    };
  }, []);

  async function send(blob: Blob) {
    if (!mountedRef.current) return;
    if (blob.size < 1200) {
      setStatus("error");
      setMsg("没录上，再试一次");
      return;
    }
    setStatus("uploading");
    setMsg("");
    try {
      const dataUrl = await blobToDataUrl(blob);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "没听清，再说一次");
      if (!mountedRef.current) return;
      onText(String(data.text || "").trim());
      setStatus("idle");
      setMsg("");
    } catch (e) {
      if (!mountedRef.current) return;
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "语音转文字失败了");
    }
  }

  function stop() {
    const rec = recorderRef.current;
    clearTimers();
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      releaseMic();
      setStatus("idle");
    }
  }

  async function start() {
    setMsg("");
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("error");
      setMsg("这里录不了音，用输入法的语音键也行");
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mountedRef.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = s;

      const mime = pickMime();
      const rec = new MediaRecorder(
        s,
        mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined,
      );
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        // 先把声音攥在手里再释放资源，顺序反了就录了个空
        const blob = new Blob(chunksRef.current, {
          type: mime || "audio/webm",
        });
        chunksRef.current = [];
        releaseMic();
        void send(blob);
      };

      rec.start();
      recorderRef.current = rec;
      setStatus("recording");
      setSeconds(0);
      tickRef.current = window.setInterval(() => {
        setSeconds((v) => Math.min(MAX_SECONDS, v + 1));
      }, 1000);
      autoRef.current = window.setTimeout(() => stop(), MAX_SECONDS * 1000);
    } catch (e) {
      releaseMic();
      setStatus("error");
      const name = e instanceof DOMException ? e.name : "";
      setMsg(
        name === "NotAllowedError"
          ? "没拿到麦克风权限，去设置里打开"
          : name === "NotFoundError"
            ? "没找到麦克风"
            : "打不开麦克风",
      );
    }
  }

  /**
   * 空闲时不写字。
   * "说一句"这三个字摆在输入框下面，等于先教他一遍怎么用 ——
   * 一个话筒图标，谁都认得，而且省下的这行高度够放拍照那张大卡。
   * 录音、转写、出错三种状态必须写：那三个时刻他需要知道发生了什么。
   */
  const label =
    status === "recording"
      ? `正在听 ${seconds}s`
      : status === "uploading"
        ? "转文字…"
        : status === "error"
          ? "再说一次"
          : "";

  const busy = disabled || status === "uploading";
  const bare = label === "";

  return (
    <div className="mt-2 flex items-center gap-2.5">
      <button
        type="button"
        disabled={busy}
        aria-label={status === "recording" ? "结束录音" : ariaLabel}
        onClick={() => {
          if (status === "recording") stop();
          else void start();
        }}
        className={`flex h-11 items-center gap-2 rounded-xl text-[15px] font-medium transition active:scale-[0.97] disabled:opacity-50 ${
          bare ? "w-11 justify-center px-0" : "px-4"
        } ${
          status === "recording"
            ? "bg-[#d94f3d] text-white"
            : "bg-black/[0.05] text-brand-600"
        }`}
      >
        {status === "uploading" ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
        ) : status === "recording" ? (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect
              x="9"
              y="2.5"
              width="6"
              height="11"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
        {label}
      </button>
      {msg ? (
        <span className="text-[13px] leading-snug text-warn-600">{msg}</span>
      ) : (
        // 空闲时不写说明：按钮上有话筒和"说一句"，再解释一遍是废话
        status === "recording" ? (
          <span className="text-[13px] text-ink-300">说完点一下</span>
        ) : null
      )}
    </div>
  );
}
