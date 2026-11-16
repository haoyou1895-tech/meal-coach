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
}

export interface FoodItem {
  name: string;
  portion: string;
  kcal: number;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
}

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
  nutrition: Nutrition;
  comment: string;
  confidence: number;
  /** 是否为演示数据 */
  demo: boolean;
  /** 失败时的提示 */
  error?: string;
}
