/** 基础类型定义 */

export type Gender = "male" | "female";

export type Disease =
  | "hypertension" // 高血压
  | "diabetes" // 血糖高 / 糖尿病
  | "hyperlipidemia" // 高血脂
  | "fattyLiver" // 脂肪肝
  | "gout" // 痛风
  | "stomach" // 胃病
  | "none" // 都没有
  | "unknown"; // 不清楚

export type Taste = "salty" | "normal" | "light";
export type MealRegular = "regular" | "sometimes" | "irregular";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type ActivityLevel = "low" | "normal" | "high";

export interface Profile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  diseases: Disease[];
  taste: Taste;
  mealRegular: MealRegular;
  createdAt: string;
  /**
   * 自己定的达成周数。不填就按每天 400 大卡的默认缺口走。
   *
   * 存周数而不是存日期：日期会过期（今天定"11 月 1 日前"，
   * 过了这天这人还在减），周数永远指向"从现在起多久"。
   */
  goalWeeks?: number;
}

export interface NutritionPlan {
  bmr: number;
  tdee: number;
  dailyBudgetKcal: number;
  proteinTargetG: number;
  fatTargetG: number;
  carbTargetG: number;
  sodiumLimitMg: number;
  /** 是否触发安全下限 */
  clamped: boolean;
  /** 达到目标体重预计需要的周数 */
  weeksToGoal: number;
  /** 每天留的热量缺口 */
  deficit: number;
  /** 按安全边界算，最快也要这么多周 */
  fastestWeeks: number;
  /** 用户自己定的周数，没定就是 null */
  goalWeeks: number | null;
  /** 用户定的比安全边界还快，已经被拦到最快那一档 */
  tooFast: boolean;
  /** 按现在的缺口，一周大约掉多少公斤 */
  perWeekKg: number;
}

export interface FoodItem {
  name: string;
  portion: string;
  kcal: number;
  /**
   * 这一项在照片里到底看不看得到。
   * false 表示只来自用户那句话（"我还喝了碗汤"），照片里没有 ——
   * 这种必须让用户确认过才算数，不然他说一句就能凭空多出三百大卡。
   */
  seen?: boolean;
}

/**
 * 对用户那句话的核对结果。
 * 只对着照片点头是不够的：他说"白粥"，照片是火锅，这时候要质疑，
 * 而不是把白粥和火锅一起列出来，做一个谁也不信的账本。
 */
export interface NoteCheck {
  /** 描述里提到、但照片里找不到的东西 */
  unseen: string[];
  /** 照片里明显有、他一个字没提的 */
  extraInPhoto: string[];
  /** match 基本对得上 / partial 有没拍到的 / conflict 像不是同一顿 */
  verdict: "match" | "partial" | "conflict";
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
}

/**
 * 酒。饭局上真正的热量大头，而且照片永远拍不出来。
 * 单位按中国人自己的说法：白酒论两、啤酒论瓶、红酒论杯。
 */
export type DrinkKind = "baijiu" | "beer" | "wine" | "huangjiu";

export interface Drink {
  kind: DrinkKind;
  /** 白酒/黄酒是「两」，啤酒是「瓶」，红酒是「杯」 */
  count: number;
}

/**
 * 一顿饭的「来源标签」。
 * 盐和油在照片里是看不见的，与其让模型编一个毫克数，
 * 不如让用户点几下：有汤、有咸菜、在外吃。
 * 这几个才是钠的真正出处。
 */
export type MealTag = "soup" | "pickled" | "out" | "fried" | "sweet";

export interface Meal {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  mealType: MealType;
  items: FoodItem[];
  nutrition: Nutrition;
  comment: string;
  /** 用户是否手动改过分量 */
  adjusted: boolean;
  /** 识别置信度 0-1 */
  confidence: number;
  createdAt: string;
  /**
   * 实际吃这顿饭的时间（ISO）。
   * 跟 createdAt 分开：createdAt 是"按下保存"的时刻，补记昨天的饭时两者差一天；
   * eatenAt 才是"几点吃的"，点评里的"吃太晚"、提醒里的"你平时几点吃"都靠它。
   * 没填就当作 createdAt。
   */
  eatenAt?: string;
  /**
   * 这条记录的所有照片（存在 IndexedDB 里的键）。
   * 同一天同一餐次拍了两次（比如先拍盖饭、再补拍馄饨汤）会有两张，
   * 不能再像以前那样后一张把前一张顶掉。
   */
  photoIds?: string[];
  /** 单张照片的旧字段，读到老数据时会被规范成 photoIds */
  photoId?: string;
  /**
   * 更早的版本把 320px 小图直接塞在这里。
   * 读到老数据时会被迁移进 IndexedDB 并清空。
   */
  image?: string;
  /** 最后修改时间；有值说明这条被改过 */
  updatedAt?: string;
  /** 这顿喝了什么。没喝就不填 */
  drinks?: Drink[];
  /** 这顿的盐油来源标签。没打标就没法谈盐 */
  tags?: MealTag[];
}

export interface WeightLog {
  date: string;
  weightKg: number;
}

export interface ActivityLog {
  date: string;
  level: ActivityLevel;
}

export interface DayTotals extends Nutrition {
  meals: number;
}

export interface RecognizeResult {
  items: FoodItem[];
  /** 识别到的酒。跟 items 分开存，但界面上跟菜并列 */
  drinks?: Drink[];
  nutrition: Nutrition;
  comment: string;
  confidence: number;
  /** 是否为演示数据 */
  demo: boolean;
  /** 有描述时，照片与描述的核对结果 */
  noteCheck?: NoteCheck;
  /** 失败时的提示 */
  error?: string;
}
