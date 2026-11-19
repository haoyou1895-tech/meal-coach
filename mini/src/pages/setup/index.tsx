import { Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { buildPlan } from "../../lib/nutrition";
import { loadState, saveState, withWeight } from "../../lib/store";
import type { Disease, Gender, Profile, Taste } from "../../lib/types";
import "./index.scss";

/**
 * 首次填写。
 *
 * 网页版是 8 步一步一步问，小程序先做成一屏 —— 骨架阶段先保证数据链路通，
 * 后面再拆成一步一屏（那时要重排节奏，不是复制粘贴）。
 */
const DISEASES: { key: Disease; label: string }[] = [
  { key: "hypertension", label: "高血压" },
  { key: "diabetes", label: "血糖高" },
  { key: "hyperlipidemia", label: "血脂高" },
  { key: "fattyLiver", label: "脂肪肝" },
  { key: "gout", label: "痛风" },
  { key: "stomach", label: "胃不好" },
  { key: "none", label: "都没有" },
];

const TASTES: { key: Taste; label: string }[] = [
  { key: "light", label: "偏淡" },
  { key: "normal", label: "正常" },
  { key: "salty", label: "偏咸" },
];

export default function SetupPage() {
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("46");
  const [heightCm, setHeight] = useState("172");
  const [weightKg, setWeight] = useState("78");
  const [targetWeightKg, setTarget] = useState("72");
  const [diseases, setDiseases] = useState<Disease[]>(["hypertension"]);
  const [taste, setTaste] = useState<Taste>("salty");

  const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;

  const toggleDisease = (k: Disease) => {
    if (k === "none") {
      setDiseases(["none"]);
      return;
    }
    const rest = diseases.filter((d) => d !== "none");
    setDiseases(rest.includes(k) ? rest.filter((d) => d !== k) : [...rest, k]);
  };

  const submit = () => {
    const h = num(heightCm);
    const w = num(weightKg);
    const t = num(targetWeightKg);
    if (h < 100 || h > 230) {
      Taro.showToast({ title: "身高填一下", icon: "none" });
      return;
    }
    if (w < 30 || w > 200) {
      Taro.showToast({ title: "体重填一下", icon: "none" });
      return;
    }

    const profile: Profile = {
      gender,
      age: num(age) || 45,
      heightCm: h,
      weightKg: w,
      targetWeightKg: t || w,
      diseases: diseases.length ? diseases : ["unknown"],
      taste,
      mealRegular: "sometimes",
      createdAt: new Date().toISOString(),
    };

    const prev = loadState();
    // 第一次称的体重也算一条记录，不然记录页的体重曲线是空的
    const next = withWeight(
      { ...prev, profile, onboarded: true },
      { date: new Date().toISOString().slice(0, 10), weightKg: w },
    );
    saveState(next);

    const plan = buildPlan(profile);
    Taro.showToast({
      title: `每天 ${plan.dailyBudgetKcal} 大卡`,
      icon: "none",
    });
    setTimeout(() => {
      Taro.switchTab({ url: "/pages/index/index" });
    }, 700);
  };

  return (
    <View className="page">
      <Text className="lede">
        填四项，剩下的它自己算。{"\n"}不用记账，它会告诉你下一顿怎么吃。
      </Text>

      <View className="field">
        <Text className="label">性别</Text>
        <View className="row">
          {(["male", "female"] as Gender[]).map((g) => (
            <View
              key={g}
              className={`chip ${gender === g ? "is-on" : ""}`}
              onClick={() => setGender(g)}
            >
              <Text className="chip-text">{g === "male" ? "男" : "女"}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="label">年龄</Text>
        <Input
          className="input"
          type="number"
          value={age}
          onInput={(e) => setAge(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="label">身高（厘米）</Text>
        <Input
          className="input"
          type="digit"
          value={heightCm}
          onInput={(e) => setHeight(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="label">现在体重（公斤）</Text>
        <Input
          className="input"
          type="digit"
          value={weightKg}
          onInput={(e) => setWeight(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="label">想减到（公斤）</Text>
        <Input
          className="input"
          type="digit"
          value={targetWeightKg}
          onInput={(e) => setTarget(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="label">身体有哪些情况（可多选）</Text>
        <View className="chips">
          {DISEASES.map((d) => (
            <View
              key={d.key}
              className={`chip ${diseases.includes(d.key) ? "is-on" : ""}`}
              onClick={() => toggleDisease(d.key)}
            >
              <Text className="chip-text">{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="label">平时口味</Text>
        <View className="row">
          {TASTES.map((t) => (
            <View
              key={t.key}
              className={`chip ${taste === t.key ? "is-on" : ""}`}
              onClick={() => setTaste(t.key)}
            >
              <Text className="chip-text">{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="submit" onClick={submit}>
        <Text className="submit-text">算一下我每天能吃多少</Text>
      </View>

      <Text className="fine">
        数据只存在这台手机上。餐谋不构成医疗建议，用药和诊断请遵医嘱。
      </Text>
    </View>
  );
}
