import { NextResponse } from "next/server";
import { createLimiter } from "@/lib/ratelimit";
import type { Nutrition } from "@/lib/types";

export const runtime = "nodejs";
/**
 * 纯文本调用，比视觉模型快得多，10 秒足够。
 * 真超时就让前端保留原热量 —— 改名这件事不能因为估不出数字就失败。
 */
export const maxDuration = 20;

const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const AI_MODEL = process.env.AI_MODEL || "qwen-vl-max";
const AI_API_KEY = process.env.AI_API_KEY || "";

/**
 * 为什么要有这个接口：
 *
 * 照片认错菜名是常态（番茄炒蛋被认成蒸蛋，热量差一倍）。
 * 以前用户只能调份量或者删掉 —— 相当于让他为模型的错误买单。
 * 改名字本身不难，难的是改完名字热量得跟着对，
 * 否则"账上的菜"和"盘子里的菜"还是两回事。
 *
 * 所以这里只做一件事：给一个菜名，返回这一份大概有多少热量和营养。
 */
const SYSTEM_PROMPT = `你是一位熟悉中国家常菜的营养师。用户会给你一道菜的名字，可能还带份量。你只估这一份的营养。

要求：
1. 份量里给了克数或毫升（形如「一斤（约 500 克）」）时，**必须按这个量算，不要按"一份"估**。
   1 斤 = 500 克，1 两 = 50 克。这是唯一会让结果差三倍的地方，务必照做。
2. 没给份量时，按一个成年人的常规一份来估（一盘、一碗、一个）。
3. 按克算时用下面的锚点，别凭感觉 —— 估高会让他不敢吃，估低会让账本失效：
   熟米饭 100 克 ≈ 116 大卡；生瘦牛肉 100 克 ≈ 200 大卡（涮熟后约 250）；
   五花肉 100 克 ≈ 350 大卡；熟面条 100 克 ≈ 130 大卡；鸡胸 100 克 ≈ 130 大卡；
   纯牛奶 100 毫升 ≈ 65 大卡；啤酒 100 毫升 ≈ 40 大卡；可乐 100 毫升 ≈ 43 大卡。
   例：一斤牛肉 ≈ 1100-1250 大卡。听起来多，但它确实有这么多，不要往下压。
4. 家常分量参考：米饭一碗 200-250 大卡，家常炒菜一盘 150-350 大卡。
   名字里带"炒、炸、红烧、干煸、回锅"的，油要算够；
   带"蒸、煮、白灼、清炒"的，油要少算。
   举例：番茄炒蛋一盘约 190 大卡，蒸蛋一碗约 100 大卡 —— 同样是蛋，油不一样，热量差近一倍。
5. 钠的单位是毫克，一道家常菜的盐通常在 500-1500 之间；按克算时，生肉本身含钠很低（约 60 毫克/100 克），
   火锅涮肉要算上蘸料。
6. 只输出 JSON，不要解释、不要 markdown 代码块。

输出格式：
{"kcal":190,"protein":9,"carb":7,"fat":14,"sodium":620}`;

/** 模型偶尔给出离谱数值，这里做硬约束 */
function sanitize(raw: Partial<Nutrition>): Nutrition {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const num = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.round(Math.min(max, Math.max(min, num)));
  };
  return {
    // 一道菜最多 2000 大卡，再多就是模型在胡说
    kcal: clamp(raw.kcal, 0, 2000, 0),
    protein: clamp(raw.protein, 0, 150, 0),
    carb: clamp(raw.carb, 0, 300, 0),
    fat: clamp(raw.fat, 0, 150, 0),
    sodium: clamp(raw.sodium, 0, 6000, 0),
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

/**
 * 单独一套限额，不跟拍照识别抢。
 * 改一次名字算一次，比拍照便宜得多，所以给得宽松些。
 */
const renameLimiter = createLimiter({
  perMinute: 12,
  perDay: 150,
  dayMessage: "今天改菜名的次数有点多了，明天再改吧",
});

export async function POST(req: Request) {
  let name = "";
  let portion = "";
  try {
    const body = await req.json();
    name = String(body?.name ?? "")
      .slice(0, 20)
      .trim();
    portion = String(body?.portion ?? "")
      .slice(0, 12)
      .trim();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "没有菜名" }, { status: 400 });
  }

  /*
    没配 Key 时不瞎猜。
    返回 503，前端收到就把名字改掉、热量保留原值并明说"没算出来"。
    给个假数字比给不出更糟 —— 那会直接污染账本。
  */
  if (!AI_API_KEY) {
    return NextResponse.json({ error: "没接识别服务" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const gate = renameLimiter.check(ip);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const userText = portion ? `菜名：${name}\n份量：${portion}` : `菜名：${name}`;
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[estimate] 模型接口 ${res.status}: ${body.slice(0, 300)}`);
      return NextResponse.json({ error: "估算服务没响应" }, { status: 502 });
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text) as Partial<Nutrition>;
    const nutrition = sanitize(parsed);

    // 估出 0 大卡等于没估 —— 宁可报错让前端保留原值
    if (nutrition.kcal <= 0) {
      return NextResponse.json({ error: "没算出来" }, { status: 502 });
    }

    return NextResponse.json({ name, nutrition });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "估算失败";
    console.error(`[estimate] 失败: ${msg}`);
    return NextResponse.json({ error: "没算出来" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
