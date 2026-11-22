import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { transcribe } from "../lib/api";
import Icon from "./Icon";
import "./VoiceInput.scss";

/**
 * 说一句，变成文字填进描述框。
 *
 * 网页版用 MediaRecorder，小程序没有这个接口，只能走 RecorderManager：
 * 录音落成一个本地文件，读 base64 发给同一个 /api/transcribe。
 * 后端不变，前面那句话也一样 —— 说的是什么，两端都得认。
 *
 * 为什么不用微信的「语音识别」插件：那要单独申请、单独审核，
 * 而这个后端已经在跑，多接一条路只是多一点代码。
 */

/** 60 个字说着说着就超了，30 秒够讲两句 */
const MAX_SECONDS = 30;

type Status = "idle" | "recording" | "uploading" | "error";

export default function VoiceInput({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [seconds, setSeconds] = useState(0);

  /** RecorderManager 是全局单例，onStop 只能注册一次，所以回调走 ref */
  const onStopRef = useRef<(path: string) => void>(() => {});
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const rm = Taro.getRecorderManager();
      if (!rm) return;
      rm.onStop((res) => {
        clearTick();
        const path = (res as { tempFilePath?: string })?.tempFilePath ?? "";
        onStopRef.current(path);
      });
      rm.onError(() => {
        clearTick();
        setStatus("error");
        setMsg("录音出错，检查下微信的麦克风权限");
      });
    } catch {
      /* h5 预览里没有 RecorderManager，点按钮时再提示 */
    }
    return clearTick;
  }, []);

  const send = async (path: string) => {
    if (!path) {
      setStatus("error");
      setMsg("没录上，再试一次");
      return;
    }
    setStatus("uploading");
    setMsg("");
    const r = await transcribe(path);
    if (r.error || !r.text) {
      setStatus("error");
      setMsg(r.error || "没听清，再说一次");
      return;
    }
    onText(r.text);
    setStatus("idle");
    setMsg("");
  };

  onStopRef.current = (path) => {
    void send(path);
  };

  const start = async () => {
    setMsg("");
    let rm: ReturnType<typeof Taro.getRecorderManager> | null = null;
    try {
      rm = Taro.getRecorderManager();
    } catch {
      rm = null;
    }
    if (!rm) {
      setStatus("error");
      setMsg("这里录不了音，用输入法的语音键也行");
      return;
    }

    // 先要权限，被拒了给一句人话，别让人对着没反应的按钮点三遍
    try {
      const auth = await Taro.authorize({ scope: "scope.record" });
      if (!auth) throw new Error("deny");
    } catch {
      setStatus("error");
      setMsg("没拿到麦克风权限，去设置里打开");
      return;
    }

    rm.start({
      duration: MAX_SECONDS * 1000,
      format: "mp3",
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
    });
    setStatus("recording");
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds((v) => {
        // 到点自己停：他手上可能沾着油，未必腾得出手点第二下
        if (v + 1 >= MAX_SECONDS) {
          try {
            rm?.stop();
          } catch {
            /* 已经停了 */
          }
        }
        return Math.min(MAX_SECONDS, v + 1);
      });
    }, 1000);
  };

  const stop = () => {
    try {
      Taro.getRecorderManager().stop();
    } catch {
      clearTick();
      setStatus("idle");
    }
  };

  /**
   * 空闲时不写字。
   * "说一句"摆在输入框下面等于先教一遍怎么用；一个话筒图标谁都认得，
   * 省下的这行高度够放下面那张拍照大卡。
   * 录音、转写、出错三种状态必须写 —— 那三个时刻他需要知道发生了什么。
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

  return (
    <View className="voice">
      <View
        className={`voice-btn ${label ? "" : "is-bare"} ${status === "recording" ? "is-rec" : ""} ${busy ? "is-busy" : ""}`}
        hoverClass={busy ? "none" : "tap"}
        onClick={() => {
          if (busy) return;
          if (status === "recording") stop();
          else void start();
        }}
      >
        {status === "uploading" ? (
          <View className="voice-spin" />
        ) : status === "recording" ? (
          <View className="voice-dot" />
        ) : (
          <Icon name="mic" size={18} color="#176f49" />
        )}
        {!!label && <Text className="voice-label">{label}</Text>}
      </View>

      {!!msg ? (
        <Text className="voice-msg">{msg}</Text>
      ) : status === "recording" ? (
        <Text className="voice-hint">说完点一下</Text>
      ) : null}
    </View>
  );
}
