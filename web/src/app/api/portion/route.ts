import { NextResponse } from "next/server";
import { createLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
/**
 * 纯文本、输出极短（4 个档位），正常 1 秒内回。
 * 8 秒还没回就当它挂了 —— 前端宁可落回兜底档位，也不能让输入框卡着。
 */
export const maxDuration = 20;

const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
/**
 * 默认值不用 qwen-vl-max：那个模型 2026-10-10 已下线，
 * 一旦环境变量丢了，代码会 fallback 到一个调不通的名字，报错还看不出原因。
 */
const AI_MODEL = process.env.AI_MODEL || "qwen3-vl-plus";
const AI_API_KEY = process.env.AI_API_KEY || "";

/**
 * 为什么要有这个接口：
 *
 * 本地规则表只能覆盖常见食物。玉米该按「根」问，但规则表里没有玉米，
 * 于是落到兜底类问「一小份 / 一份 / 大份」—— 单位不对，他选不准，
 * 选出来的热量也就没意义。
 *
 * 规则表的错不在词少，在**这类知识永远补不全**：玉米是根、小龙虾是只、
 * 西瓜是块、粽子是个、汤圆是颗、奶茶是杯。补 100 个还有 1000 个。
 *
 * 所以规则表当热路径（常见词零延迟），这个接口当兜底（长尾词问一次，之后走本地缓存）。
 *
 * 注意它只回答「怎么量」，不回答「多少热量」——
 * 热量仍然交给 estimate，一件事一个接口，不重叠。
 */
const SYSTEM_PROMPT = `你是营养师，正在帮一个不懂克数的人记录饮食。

用户会给你一个食物或菜的名字。你不用算热量，只需要回答两件事：
① 这东西在中国人的饭桌上一般按什么量（一根、一碗、一串、一斤、一瓶、一块…）
② 这个单位的 2~4 个常见档位，每档大概多少克（饮品按毫升）

要求：
1. 单位必须是他张嘴就能说的日常单位。玉米是"根"，小龙虾是"只"，西瓜是"块"，
   粽子是"个"，汤圆是"颗"，奶茶是"杯"，火锅涮肉是"斤"。
   **绝对不要把"克"当单位** —— 让他填克数，等于让他先心算一次，那一刻他就放弃了。
2. 档位 2~4 个，从小到大，必须包含"常规一份"那一档。
3. 不要过细。玉米不能是"一粒"，米饭不能是"一勺"。
   但如果这东西本来就是小口吃的（汤圆、饺子、葡萄），就用"颗""个"。
4. 每档给出对应克数，按可食部算 —— 不带骨、不带壳、不带皮。
   参考：一根中等玉米可食部约 120 克；一个苹果约 200 克；一碗米饭约 200 克；
   一只中等小龙虾可食部约 15 克；一颗汤圆约 20 克；一个中等粽子约 150 克；
   一块西瓜可食部约 250 克；一杯奶茶约 500 毫升。
5. prompt 是一句问法，4~10 个字，形如"吃了几根""喝了几碗""吃了多少，按斤两算"。
   不要写"请输入""请选择"这类系统腔。
6. **label 只放量词本身**，像"小半根""一根""两份""3颗"。
   不要写括号，不要写克数，不要写"约"，不要解释 ——
   克数已经在 amount 字段里了，界面只显示 label，括号会被切掉留半个符号。
7. label 要是他真会这么说的说法。"大一个"不是话，"两个"是；"一份（10只）"不是标签，是解释。
8. 只输出 JSON，不要解释，不要 markdown 代码块。

输出格式：
{"prompt":"吃了几根","presets":[{"label":"小半根","amount":80,"unit":"克"},{"label":"一根","amount":120,"unit":"克"},{"label":"两根","amount":240,"unit":"克"}]}`;

type Preset = { label: string; amount: number; unit: "克" | "毫升" };

/**
 * 模型会给出怪东西（"一粒"、5 个档位、克数倒序），这里逐条卡死。
 * 校验不过就返回 null，让前端落回兜底 —— 显示一个可疑的档位比不显示更糟，
 * 因为他会照着点，然后账本里多一条差三倍的记录。
 */
function sanitize(raw: unknown): { prompt: string; presets: Preset[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const prompt = String(obj.prompt ?? "").trim().slice(0, 12);
  if (!prompt) return null;

  const list = Array.isArray(obj.presets) ? obj.presets : [];
  if (list.length < 2 || list.length > 4) return null;

  const out: Preset[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    /*
     * 提示词已经要求 label 不带括号，但它有时还是会写「一份（10只）」。
     * 这里先切掉括号再截长度 —— 否则「一份（10只」这种半个符号会直接显示在按钮上，
     * 看着像界面坏了（K51 是同一个病：名字被挤没）。留 8 个字给「四分之一个」。
     */
    const label = String(p.label ?? "")
      .replace(/[（(].*$/, "")
      .trim()
      .slice(0, 8);
    const amount = Number(p.amount);
    // 一颗葡萄约 8 克、一锅炖菜约 2000 克，这个区间之外的都当模型在胡说
    if (!label || !Number.isFinite(amount) || amount < 5 || amount > 3000) return null;
    out.push({
      label,
      amount: Math.round(amount),
      unit: p.unit === "毫升" ? "毫升" : "克",
    });
  }

  // 必须严格递增，否则「一斤」排在「半斤」前面会让人选错
  for (let i = 1; i < out.length; i++) {
    if (out[i].amount <= out[i - 1].amount) return null;
  }

  return { prompt, presets: out };
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
 * 单独一套限额。
 * 比 estimate 宽松：这个接口在输入框里会被触发多次（他改说法），
 * 但单次极便宜，卡太紧会让「多打两个字」就报错。
 */
const portionLimiter = createLimiter({
  perMinute: 20,
  perDay: 200,
  dayMessage: "今天问得有点多了，明天再问吧",
});

export async function POST(req: Request) {
  let name = "";
  try {
    const body = await req.json();
    name = String(body?.name ?? "")
      .slice(0, 20)
      .trim();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "没有吃的名字" }, { status: 400 });
  }

  // 没配 Key 就明说，前端落回兜底档位，不假装给了答案
  if (!AI_API_KEY) {
    return NextResponse.json({ error: "没接识别服务" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const gate = portionLimiter.check(ip);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        // 档位要稳定，温度压到最低
        model: AI_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `食物：${name}` },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[portion] 模型接口 ${res.status}: ${body.slice(0, 300)}`);
      return NextResponse.json({ error: "想不出来" }, { status: 502 });
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = sanitize(extractJson(text));

    if (!parsed) {
      console.warn(`[portion] 模型给的东西不合法：${text.slice(0, 200)}`);
      return NextResponse.json({ error: "想不出来" }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    console.error(`[portion] 失败: ${msg}`);
    return NextResponse.json({ error: "想不出来" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
