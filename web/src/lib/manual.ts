/**
 * 「没拍照，直接说」—— 按食物类型决定问什么单位。
 *
 * 为什么不能统一问克数：
 * 人在饭桌上想的量，跟他买这个东西时的单位是一样的。
 * 牛肉是"买了一斤"，米饭是"添了一碗"，烧烤是"点了十串"，苹果是"吃了一个"。
 * 统一问"多少克"，等于要求他先在心里做一次换算 —— 那一秒他就放弃了。
 *
 * 所以这里不是"分量系统"，是"翻译层"：
 * 把他的话译成一个克数，再交给模型算热量。
 * 单位是给他看的，克数只给机器看。
 *
 * 为什么不全靠 AI 现想档位：
 * 同一个"牛肉"，今天返回 4 个档、明天返回 5 个，他会觉得这东西不稳定。
 *
 * 但**也不能只靠这张表**。这两个判断当初是二选一，错了：
 * 稳定性只在"同一个词反复出现"时才有意义，而长尾词（玉米、小龙虾、粽子）
 * 可能一辈子只出现一次 —— 拿一个不存在的稳定性，换掉了覆盖率。
 *
 * 现在的分工：
 *   这张表 = 热路径。常见食物命中就出，0 延迟、0 成本、档位永远一样。
 *   查不到 → 问 /api/portion 一次，结果存本地（lib/portionCache.ts），
 *   同一个词以后不再问。
 *
 * 所以这张表的职责变了：**不是"覆盖所有食物"，是"让最常吃的那批不用等"**。
 * 加词的标准也变了 —— 只有"一个月吃四次以上、且单位跟现有类差得远"才值得加，
 * 剩下的交给 AI。玉米就是这么进来的：它按根，而所有现成的类都按碗/个/份。
 */

export type Preset = {
  /** 给人看的单位，出现在按钮上 */
  label: string;
  /** 折算成克或毫升，只给模型用 */
  amount: number;
  /** 单位：克 / 毫升。饮品按毫升更准 */
  unit: "克" | "毫升";
};

export type FoodClass = {
  id: string;
  /** 问法。放在「吃了多少」上面，让他知道为什么问这个 */
  prompt: string;
  presets: Preset[];
};

/**
 * 匹配规则有两条，缺一条就会认错：
 *
 * ① **长的赢**：「炒饭」赢过「饭」，「牛肉面」赢过「牛肉」。
 *    所以不用维护优先级排序，加新词也不会把旧规则挤掉。
 *
 * ② **等长时前面赢**：这条是「紫菜蛋汤」逼出来的 ——
 *    「蛋」和「汤」都只有 1 个字，谁写在前面谁赢。
 *    而"蛋汤"的主体是汤，所以容器词（汤、粥）必须排在食材词（蛋）前面。
 *    同理，做法词（炒、烧）排最后，因为它是修饰，不该抢走主体。
 *
 * 加新词之前先问一句：它更长吗？如果一样长，它该排在谁前面？
 */
const RULES: Array<FoodClass & { keys: string[] }> = [
  {
    id: "rice",
    prompt: "吃了几碗",
    keys: ["米饭", "白饭", "糙米饭", "杂粮饭", "盖饭", "煲仔饭", "蛋炒饭", "炒饭", "饭"],
    presets: [
      { label: "小半碗", amount: 100, unit: "克" },
      { label: "一碗", amount: 200, unit: "克" },
      { label: "两碗", amount: 400, unit: "克" },
    ],
  },
  {
    id: "noodle",
    prompt: "吃了多少面",
    keys: ["面条", "拉面", "牛肉面", "刀削面", "米线", "河粉", "米粉", "粉丝", "意面", "面", "粉"],
    presets: [
      { label: "小碗", amount: 250, unit: "克" },
      { label: "一碗", amount: 400, unit: "克" },
      { label: "大碗", amount: 600, unit: "克" },
    ],
  },
  {
    id: "meat",
    prompt: "吃了多少，按斤两算",
    keys: [
      "火锅", "涮", "肥牛", "肥羊", "毛肚", "黄喉", "鸭肠", "牛肉", "羊肉",
      "五花", "里脊", "排骨", "鸡腿", "鸡胸", "鸡翅", "肘子", "牛排", "烤肉",
      "烤肉片", "叉烧", "卤肉", "猪蹄",
    ],
    presets: [
      { label: "几片", amount: 50, unit: "克" },
      { label: "半斤", amount: 250, unit: "克" },
      { label: "一斤", amount: 500, unit: "克" },
      { label: "两斤", amount: 1000, unit: "克" },
    ],
  },
  {
    id: "skewer",
    prompt: "吃了几串",
    keys: ["串", "烧烤", "烤串", "烤腰子", "羊肉串", "板筋", "鸡架"],
    presets: [
      { label: "3 串", amount: 100, unit: "克" },
      { label: "5 串", amount: 170, unit: "克" },
      { label: "10 串", amount: 350, unit: "克" },
    ],
  },
  {
    id: "staple",
    prompt: "吃了几个",
    keys: ["馒头", "包子", "饺子", "馄饨", "面包", "烧饼", "花卷", "油条", "饼"],
    presets: [
      { label: "半个", amount: 50, unit: "克" },
      { label: "一个", amount: 100, unit: "克" },
      { label: "两个", amount: 200, unit: "克" },
    ],
  },
  {
    id: "soup",
    prompt: "喝了几碗",
    keys: ["汤", "粥", "羹", "糊", "稀饭"],
    presets: [
      { label: "一小碗", amount: 200, unit: "克" },
      { label: "一碗", amount: 350, unit: "克" },
      { label: "两碗", amount: 700, unit: "克" },
    ],
  },
  {
    id: "egg",
    prompt: "吃了几个",
    keys: ["鸡蛋", "煮蛋", "煎蛋", "茶叶蛋", "荷包蛋", "水煮蛋", "蛋"],
    presets: [
      { label: "一个", amount: 50, unit: "克" },
      { label: "两个", amount: 100, unit: "克" },
      { label: "三个", amount: 150, unit: "克" },
    ],
  },
  {
    id: "fruit",
    prompt: "吃了几个",
    // 西瓜不在这里：说"一个西瓜"是一整个十斤重的，跟"一个苹果"不是一个量级。
    // 它单列在下面的 melon 类，按块问。
    keys: ["苹果", "香蕉", "橘子", "橙子", "梨", "桃", "葡萄", "荔枝", "芒果", "火龙果", "水果"],
    presets: [
      { label: "半个", amount: 100, unit: "克" },
      { label: "一个", amount: 200, unit: "克" },
      { label: "两个", amount: 400, unit: "克" },
    ],
  },
  {
    /*
     * 玉米按"根"——这是用户亲自点出来的缺口。
     * 它不该走兜底类的"一份"：一根中等玉米可食部 120 克，
     * 而兜底类的"一份"是 200 克，差六成大卡，还不报错。
     */
    id: "ear",
    prompt: "吃了几根",
    keys: ["玉米", "甜玉米", "糯玉米", "烤玉米", "玉米棒", "苞谷"],
    presets: [
      { label: "半根", amount: 60, unit: "克" },
      { label: "一根", amount: 120, unit: "克" },
      { label: "两根", amount: 240, unit: "克" },
    ],
  },
  {
    /*
     * 西瓜、哈密瓜必须按块，不能按个。
     * 原来"西瓜"放在 fruit 类里，问"吃了几个"，档位是半个/一个/两个 ——
     * 他心里的"一个"是一整只十斤的瓜，界面上的"一个"是 200 克，
     * 两边根本不是一个东西，而他点完不会知道错了。
     */
    id: "melon",
    prompt: "吃了多少，按块算",
    keys: ["西瓜", "哈密瓜", "甜瓜", "香瓜", "木瓜"],
    presets: [
      { label: "一块", amount: 250, unit: "克" },
      { label: "两块", amount: 500, unit: "克" },
      { label: "四分之一个", amount: 800, unit: "克" },
    ],
  },
  {
    /*
     * 红薯、山药、芋头按个。
     * 刻意不收土豆：土豆丝、土豆片、土豆泥是菜，按个问就错了 ——
     * 这正是本地表管不了的那类，交给 AI 分辨。
     */
    id: "tuber",
    prompt: "吃了几个",
    keys: ["红薯", "地瓜", "山药", "芋头", "紫薯"],
    presets: [
      { label: "小个", amount: 100, unit: "克" },
      { label: "一个", amount: 200, unit: "克" },
      { label: "两个", amount: 400, unit: "克" },
    ],
  },
  {
    id: "drink",
    prompt: "喝了多少",
    keys: [
      "可乐", "雪碧", "啤酒", "白酒", "奶茶", "牛奶", "豆浆", "咖啡", "果汁",
      "饮料", "矿泉水", "酸奶", "茶",
    ],
    presets: [
      { label: "一杯", amount: 250, unit: "毫升" },
      { label: "一瓶", amount: 500, unit: "毫升" },
      { label: "一大瓶", amount: 1000, unit: "毫升" },
    ],
  },
  {
    id: "dish",
    prompt: "吃了多少，按盘算",
    keys: ["炒", "烧", "煎", "炸", "干煸", "回锅", "红烧", "炖", "蒸", "白灼", "凉拌", "拌", "菜"],
    presets: [
      { label: "几口", amount: 100, unit: "克" },
      { label: "半盘", amount: 200, unit: "克" },
      { label: "一盘", amount: 350, unit: "克" },
    ],
  },
];

/**
 * 一样都没命中时用它。
 *
 * 不能返回"没有选项" —— 他不知道怎么填，功能就断在这。
 * 宁可问得粗一点（一小份 / 一份 / 大份），也不能让他卡住。
 */
export const DEFAULT_CLASS: FoodClass = {
  id: "other",
  prompt: "吃了多少",
  presets: [
    { label: "一小份", amount: 100, unit: "克" },
    { label: "一份", amount: 200, unit: "克" },
    { label: "大份", amount: 350, unit: "克" },
  ],
};

/**
 * 按名字判断该问什么单位。命中关键词最长的那个赢 ——
 * "炒饭"（2 字）会赢过"饭"（1 字），"面包"（2 字）会赢过"面"（1 字）。
 * 这样不用维护优先级排序，加新词也不会把旧的挤掉。
 */
export function classify(name: string): FoodClass {
  const text = (name || "").trim();
  if (!text) return DEFAULT_CLASS;

  let best: FoodClass | null = null;
  let bestLen = 0;
  for (const rule of RULES) {
    for (const key of rule.keys) {
      if (text.includes(key) && key.length > bestLen) {
        best = rule;
        bestLen = key.length;
      }
    }
  }
  if (!best) return DEFAULT_CLASS;
  // 去掉 keys 再返回，外面只关心问法和档位
  const { keys: _keys, ...cls } = best as FoodClass & { keys: string[] };
  return cls;
}

/**
 * 把「档位」说成一句模型能照做的话。
 *
 * 为什么带单位说明（"约 500 克"）而不是只传"一斤"：
 * 模型对"一斤"的理解不如对"500 克"稳定，而这一句是会算错的源头。
 * 两个都给：人话在前，克数在后，模型优先认克数。
 */
export function presetToPortion(p: Preset): string {
  return `${p.label}（约 ${p.amount} ${p.unit}）`;
}

/**
 * 一斤、两斤、半斤这种，用户也可能直接打进名字里。
 * 认得出来就别再问一遍 —— 他都说了一斤，还问"吃了多少"是在侮辱人。
 */
export function amountInText(name: string): Preset | null {
  const text = name || "";
  if (!/半斤/.test(text)) {
    const jin = /([0-9一二两三四五六七八九十]+)\s*斤/.exec(text);
    if (jin) {
      const n = cnNumber(jin[1]);
      if (n > 0) return { label: `${jin[1]}斤`, amount: n * 500, unit: "克" };
    }
  } else {
    return { label: "半斤", amount: 250, unit: "克" };
  }
  const liang = /([0-9一二三四五六七八九十]+)\s*两(?!个|种|样)/.exec(text);
  if (liang) {
    const n = cnNumber(liang[1]);
    if (n > 0) return { label: `${liang[1]}两`, amount: n * 50, unit: "克" };
  }
  return null;
}

/**
 * 把名字里的量剥掉 —— "一斤牛肉" 存成 "牛肉"，量交给份量字段。
 *
 * 不剥的后果看着很蠢：列表里出现「一斤牛肉　一斤」，
 * 名字里说一遍、份量里再说一遍。而且下次算额度的时候，
 * 一个叫"一斤牛肉"的条目会让"这份是多少"变得含混。
 *
 * 剥完是空的就别剥 —— 他只说了"一斤"，那"一斤"就是名字。
 */
export function stripAmount(name: string): string {
  const stripped = (name || "")
    .replace(/(半斤|[0-9一二两三四五六七八九十]+\s*斤)/g, "")
    .replace(/([0-9一二三四五六七八九十半]+\s*两)(?!个|种|样)/g, "")
    .trim();
  return stripped.length > 0 ? stripped : (name || "").trim();
}

/** 只处理 1-99 的中文数字，够用了 —— 没人一顿吃"九十九斤" */
function cnNumber(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const map: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (s === "十") return 10;
  if (s.length === 1) return map[s] ?? 0;
  // 十五、二十、二十三
  if (s.startsWith("十")) return 10 + (map[s[1]] ?? 0);
  if (s[1] === "十") return (map[s[0]] ?? 0) * 10 + (s[2] ? (map[s[2]] ?? 0) : 0);
  return 0;
}
