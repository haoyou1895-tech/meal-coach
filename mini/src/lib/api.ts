import Taro from "@tarojs/taro";
import type { RecognizeResult } from "./types";

/**
 * 识别接口。地址跟网页版是同一个后端，请求体也一样：
 * { images: [dataURL...], note: "一句话" }
 *
 * 为什么要换成自带 base64：小程序没法直接 POST 文件，
 * 只能把图片读成 base64 拼进 JSON。720px、压缩过的图大约两三百 KB，够用。
 *
 * 地址写死在这里，不走 process.env —— 小程序构建时取不到自定义环境变量，
 * 一读 process 就在 h5 里炸「process is not defined」，小程序里则静默变成 undefined。
 * 以后换域名，改这一行。
 */
const BASE = "https://canmou.net.cn";

export async function recognize(
  images: string[],
  note = "",
): Promise<RecognizeResult> {
  try {
    const res = await Taro.request<RecognizeResult>({
      url: `${BASE}/api/recognize`,
      method: "POST",
      // 模型要看图，4–8 秒是常态，排到慢节点会到 30 秒
      timeout: 60000,
      header: { "Content-Type": "application/json" },
      data: { images, note },
    });

    const body = res.data;
    if (!body || typeof body !== "object") {
      return { ...EMPTY, error: "服务没返回内容" };
    }
    if (body.error) return { ...body, items: body.items ?? [] };
    return body;
  } catch (e) {
    const msg = (e as { errMsg?: string })?.errMsg ?? "";
    // 域名没配白名单时，报错是 "url not in domain list"，这个提示必须说人话
    if (/domain list/i.test(msg)) {
      return {
        ...EMPTY,
        error: "这个域名还没加进小程序白名单，开发时先勾上「不校验合法域名」",
      };
    }
    if (/timeout/i.test(msg)) {
      return { ...EMPTY, error: "等太久了，网络可能不好，再试一次" };
    }
    return { ...EMPTY, error: "没连上，检查下网络" };
  }
}

/**
 * 语音转文字。
 *
 * 网页版用 MediaRecorder + Blob，小程序没有这套：录音走 RecorderManager，
 * 落下来是一个本地文件（mp3），读成 base64 再拼 data URI。
 * 服务端只认 data:audio 开头，所以 mime 得跟着录音格式写对。
 */
export async function transcribe(filePath: string): Promise<{ text?: string; error?: string }> {
  let b64 = "";
  try {
    b64 = String(Taro.getFileSystemManager().readFileSync(filePath, "base64"));
  } catch {
    return { error: "录音读不出来，再试一次" };
  }
  if (!b64) return { error: "没录上，再试一次" };

  try {
    const res = await Taro.request<{ text?: string; error?: string }>({
      url: `${BASE}/api/transcribe`,
      method: "POST",
      timeout: 30000,
      header: { "Content-Type": "application/json" },
      // 录音固定用 mp3。微信只给 aac / mp3，qwen3-asr 认 mp3 最稳
      data: { audio: `data:audio/mpeg;base64,${b64}` },
    });
    if (res.statusCode >= 400) {
      return { error: res.data?.error || "没听清，再说一次" };
    }
    return { text: res.data?.text ?? "" };
  } catch (e) {
    const msg = (e as { errMsg?: string })?.errMsg ?? "";
    if (/domain list/i.test(msg)) {
      return { error: "这个域名还没加进小程序白名单" };
    }
    if (/timeout/i.test(msg)) return { error: "网络有点慢，再试一次" };
    return { error: "语音转文字失败了" };
  }
}

/**
 * 改完菜名后重算这一份的热量。
 *
 * 只改名不重算是假修：「蒸蛋 100」和「番茄炒蛋 190」差着近一倍，
 * 名字对了数字还错，这本账依然是错的。
 * 这道菜叫什么是用户的知识，值多少卡是模型的知识 —— 各问各的。
 */
export async function estimate(
  name: string,
  portion: string,
): Promise<{ kcal: number }> {
  try {
    const res = await Taro.request<{
      nutrition?: { kcal?: number };
      error?: string;
    }>({
      url: `${BASE}/api/estimate`,
      method: "POST",
      // 纯文本调用，比看图快得多；给 30 秒已经是很宽的余量
      timeout: 30000,
      header: { "Content-Type": "application/json" },
      data: { name, portion },
    });
    return { kcal: Math.round(Number(res.data?.nutrition?.kcal) || 0) };
  } catch {
    // 估不出来不是错误：名字照样改掉，热量让他自己调份量
    return { kcal: 0 };
  }
}

const EMPTY: RecognizeResult = {
  items: [],
  nutrition: { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 },
  comment: "",
  confidence: 0,
  demo: false,
};
