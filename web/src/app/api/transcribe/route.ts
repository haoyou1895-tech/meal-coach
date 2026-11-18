import { NextResponse } from "next/server";

/**
 * 语音转文字。
 *
 * 为什么不在前端用浏览器自带的 Web Speech API：
 * Chrome 的 SpeechRecognition 把音频发到境外服务器，国内基本连不上；
 * 鸿蒙 ArkWeb 也没有这个接口。只能走服务端。
 *
 * 用百炼的 qwen3-asr-flash，走 OpenAI 兼容格式。
 * 它接受 Base64 data URI，所以不用先传对象存储，少一个依赖。
 * 价格 0.00022 元/秒，一条 5 秒的话大概一厘钱。
 */

const AI_BASE_URL = (
  process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
).replace(/\/+$/, "");
const AI_API_KEY = process.env.AI_API_KEY || "";
const ASR_MODEL = process.env.ASR_MODEL || "qwen3-asr-flash";

/** 30 秒 opus 大约 60KB，base64 后 80KB；给足余量防异常（前端限制 30 秒） */
const MAX_BYTES = 6 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 30;

type AsrBody = { audio?: string };

/**
 * qwen3-asr 的返回，不同版本可能是纯文本、JSON 字符串或分段数组。
 * 三种都兜一下，免得服务端一升级就整个功能哑掉。
 */
function pickText(content: unknown): string {
  if (typeof content === "string") {
    const s = content.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) return s;
    try {
      return pickText(JSON.parse(s));
    } catch {
      return s;
    }
  }
  if (Array.isArray(content)) {
    return content.map((p) => pickText(p)).filter(Boolean).join("");
  }
  if (content && typeof content === "object") {
    const o = content as Record<string, unknown>;
    for (const key of ["text", "transcript", "content", "sentence"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return "";
}

export async function POST(req: Request) {
  if (!AI_API_KEY) {
    return NextResponse.json(
      { error: "服务端没配语音识别的密钥" },
      { status: 500 },
    );
  }

  let body: AsrBody;
  try {
    body = (await req.json()) as AsrBody;
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }

  const audio = body.audio;
  if (!audio || !audio.startsWith("data:audio")) {
    return NextResponse.json({ error: "没有收到录音" }, { status: 400 });
  }
  if (audio.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "这段录音太长了，说短一点" },
      { status: 413 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ASR_MODEL,
        // 注意：qwen3-asr 不支持 system message，加了会报 InvalidParameter。
        // 想提升菜名准确率只能靠上下文热词，但先不上，稳定优先。
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: audio } }],
          },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("asr failed", res.status, detail.slice(0, 300));
      return NextResponse.json(
        { error: "没听清，再说一次试试" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text = pickText(data?.choices?.[0]?.message?.content).trim();

    if (!text) {
      return NextResponse.json(
        { error: "没听清，再说一次试试" },
        { status: 422 },
      );
    }

    // 顺手砍掉模型可能加上的引号、句号结尾和换行
    const clean = text
      .replace(/^["“「『]|["”」』]$/g, "")
      .replace(/[。，、！？\s]+$/g, "")
      .replace(/\s*\n+\s*/g, "、")
      .trim();

    // 静音或环境噪声常被转成"嗯""啊""哦"，这种别往输入框里塞
    if (!clean || /^[嗯啊哦呃额唉诶哎]+$/u.test(clean)) {
      return NextResponse.json(
        { error: "没听清，再说一次试试" },
        { status: 422 },
      );
    }

    return NextResponse.json({ text: clean.slice(0, 60) });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "网络有点慢，再试一次" : "语音转文字失败了" },
      { status: aborted ? 504 : 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
