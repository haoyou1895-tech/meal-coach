import { NextResponse } from "next/server";
import { mockRecognize } from "@/lib/mock";
import type { Nutrition } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const AI_MODEL = process.env.AI_MODEL || "qwen-vl-max";
const AI_API_KEY = process.env.AI_API_KEY || "";

const SYSTEM_PROMPT = `你是一位熟悉中国家常菜的营养师。用户会给你一张饭菜照片，你要估算里面有哪些食物、大概分量和营养。

要求：
1. 只识别画面里能看到的食物，不要凭空添加。
2. 按中国常见的家庭分量估算（一碗、一盘、一个），不要用克数描述分量。
3. 营养值要贴近实际：一碗米饭约 200-250 大卡，一份家常炒菜约 150-350 大卡。
4. 如果画面里没有食物或看不清，items 返回空数组，confidence 低于 0.3。
5. 只输出 JSON，不要任何解释文字、不要 markdown 代码块。

输出格式：
{"items":[{"name":"米饭","portion":"1 碗","kcal":230}],"nutrition":{"kcal":620,"protein":22,"carb":62,"fat":31,"sodium":980},"confidence":0.82}`;

/** 数值区间校验：模型偶尔会给出离谱数值，这里做硬约束 */
function sanitize(n: Partial<Nutrition>): Nutrition {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const num = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.round(Math.min(max, Math.max(min, num)));
  };
  return {
    kcal: clamp(n.kcal, 0, 3000, 0),
    protein: clamp(n.protein, 0, 200, 0),
    carb: clamp(n.carb, 0, 400, 0),
    fat: clamp(n.fat, 0, 200, 0),
    sodium: clamp(n.sodium, 0, 8000, 0),
  };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型未返回 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callModel(image: string, signal: AbortSignal) {
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: "这是什么饭菜？按约定格式返回 JSON。" },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`模型接口 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return extractJson(text) as {
    items?: { name?: string; portion?: string; kcal?: number }[];
    nutrition?: Partial<Nutrition>;
    confidence?: number;
  };
}

export async function POST(req: Request) {
  let image = "";
  try {
    const body = await req.json();
    image = String(body?.image ?? "");
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }

  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "没有收到图片" }, { status: 400 });
  }
  // 约 4MB 上限，防止超大图拖垮请求
  if (image.length > 5_500_000) {
    return NextResponse.json(
      { error: "照片太大了，请重拍一张" },
      { status: 413 },
    );
  }

  // 没有配置 Key：走演示数据，保证流程可以完整跑通
  if (!AI_API_KEY) {
    const m = mockRecognize();
    return NextResponse.json({
      ...m,
      nutrition: sanitize(m.nutrition),
      demo: true,
    });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const parsed = await callModel(image, controller.signal);
      clearTimeout(timer);

      const items = (parsed.items ?? [])
        .filter((it) => it && typeof it.name === "string" && it.name.trim())
        .slice(0, 8)
        .map((it) => ({
          name: String(it.name).slice(0, 20),
          portion: String(it.portion ?? "1 份").slice(0, 12),
          kcal: Math.round(Number(it.kcal) || 0),
        }));

      const confidence =
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.6;

      if (!items.length) {
        return NextResponse.json({
          items: [],
          nutrition: sanitize({}),
          confidence,
          demo: false,
          error: "这张没看清，能再拍一张吗",
        });
      }

      return NextResponse.json({
        items,
        nutrition: sanitize(parsed.nutrition ?? {}),
        confidence,
        demo: false,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 1) {
        const msg = e instanceof Error ? e.message : "识别失败";
        // 兜底：不让用户卡在错误页，给演示数据并说明原因
        const m = mockRecognize();
        return NextResponse.json({
          ...m,
          nutrition: sanitize(m.nutrition),
          demo: true,
          error: `识别服务暂时不可用（${msg.slice(0, 60)}），已填入估算值`,
        });
      }
    }
  }

  return NextResponse.json({ error: "识别失败" }, { status: 500 });
}
