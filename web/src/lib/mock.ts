import type { FoodItem, Nutrition } from "./types";

/** 演示模式用的常见中餐组合，用于没有配置 AI Key 时跑通全流程 */
const PRESETS: { items: FoodItem[]; nutrition: Nutrition }[] = [
  {
    items: [
      { name: "米饭", portion: "1 碗", kcal: 230 },
      { name: "红烧肉", portion: "5 块", kcal: 320 },
      { name: "炒青菜", portion: "1 小盘", kcal: 70 },
    ],
    nutrition: { kcal: 620, protein: 22, carb: 62, fat: 31, sodium: 980 },
  },
  {
    items: [
      { name: "白粥", portion: "1 碗", kcal: 110 },
      { name: "咸菜", portion: "1 小碟", kcal: 25 },
      { name: "鸡蛋", portion: "1 个", kcal: 80 },
      { name: "馒头", portion: "半个", kcal: 120 },
    ],
    nutrition: { kcal: 335, protein: 13, carb: 55, fat: 8, sodium: 1250 },
  },
  {
    items: [
      { name: "牛肉面", portion: "1 大碗", kcal: 580 },
      { name: "卤蛋", portion: "1 个", kcal: 85 },
    ],
    nutrition: { kcal: 665, protein: 31, carb: 78, fat: 22, sodium: 2100 },
  },
  {
    items: [
      { name: "清蒸鱼", portion: "半条", kcal: 180 },
      { name: "米饭", portion: "1 小碗", kcal: 160 },
      { name: "凉拌黄瓜", portion: "1 碟", kcal: 45 },
    ],
    nutrition: { kcal: 385, protein: 28, carb: 42, fat: 9, sodium: 620 },
  },
  {
    items: [
      { name: "饺子", portion: "12 个", kcal: 480 },
      { name: "醋碟", portion: "1 份", kcal: 10 },
    ],
    nutrition: { kcal: 490, protein: 19, carb: 62, fat: 18, sodium: 890 },
  },
];

export function mockRecognize() {
  const pick = PRESETS[Math.floor(Math.random() * PRESETS.length)];
  return {
    items: pick.items,
    nutrition: pick.nutrition,
    confidence: 0.78,
    demo: true,
  };
}
