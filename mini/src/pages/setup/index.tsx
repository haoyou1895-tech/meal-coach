import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Icon from "../../components/Icon";
import ProgressBar from "../../components/ProgressBar";
import Stepper from "../../components/Stepper";
import { DISEASE_LABEL, buildPlan } from "../../lib/nutrition";
import { loadState, saveState, withWeight } from "../../lib/store";
import type { Disease, Gender, MealRegular, Profile, Taste } from "../../lib/types";
import "./index.scss";

/**
 * 首次填写。对着 web/src/components/Onboarding.tsx 一步一步搬过来。
 *
 * 一屏八问看着省事，其实更难填：八个输入框摊开，人第一反应是"这要填到什么时候"。
 * 一步一问，每屏只有一个决定，页脚永远只有一个「下一步」。
 *
 * 页面结构也一样：返回圆钮 + 进度条 / 大标题 + 一句提示 / 选项或加减器 / 底部大按钮。
 */
const TOTAL = 8;

const DISEASE_ORDER: Disease[] = [
  "hypertension",
  "diabetes",
  "hyperlipidemia",
  "fattyLiver",
  "gout",
  "stomach",
  "none",
  "unknown",
];

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState(62);
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(75);
  const [targetWeightKg, setTargetWeightKg] = useState(68);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [taste, setTaste] = useState<Taste>("normal");
  const [mealRegular, setMealRegular] = useState<MealRegular>("regular");

  const profile: Profile = useMemo(
    () => ({
      gender,
      age,
      heightCm,
      weightKg,
      targetWeightKg,
      diseases,
      taste,
      mealRegular,
      createdAt: new Date().toISOString(),
    }),
    [gender, age, heightCm, weightKg, targetWeightKg, diseases, taste, mealRegular],
  );

  const plan = useMemo(() => buildPlan(profile), [profile]);

  /** 「都没有」「不清楚」是互斥项：选了它们就把具体病名全清掉 */
  const toggleDisease = (d: Disease) => {
    setDiseases((prev) => {
      if (d === "none" || d === "unknown") {
        return prev.includes(d) ? [] : [d];
      }
      const rest = prev.filter((x) => x !== "none" && x !== "unknown");
      return rest.includes(d) ? rest.filter((x) => x !== d) : [...rest, d];
    });
  };

  const next = () => {
    // 目标体重不能高于当前体重。走到第 5 问才发现自己填反了，比一开始就挡住更烦
    if (step === 4 && targetWeightKg >= weightKg) {
      setTargetWeightKg(Math.max(40, weightKg - 1));
    }
    if (step === TOTAL - 1) {
      setShowResult(true);
      return;
    }
    setStep((s) => s + 1);
  };

  const prev = () => {
    if (showResult) {
      setShowResult(false);
      return;
    }
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    // 第一步没有「上一题」。但如果是改资料进来的，就该退回首页；
    // 首次使用没有上一页，点了也不动 —— 跟网页版一样，那里 onBack 为空时同样不动。
    if (Taro.getCurrentPages().length > 1) Taro.navigateBack();
  };

  const finish = () => {
    const prevState = loadState();
    // 第一次称的体重也算一条记录，不然记录页的体重曲线是空的
    const nextState = withWeight(
      { ...prevState, profile, onboarded: true },
      { date: new Date().toISOString().slice(0, 10), weightKg },
    );
    saveState(nextState);
    // 没有原生 tabBar（底栏是自己画的），switchTab 会报错，用 reLaunch
    Taro.reLaunch({ url: "/pages/index/index" });
  };

  /* ---------- 算完了 ---------- */
  if (showResult) {
    return (
      <View className="page onb">
        <View className="onb-top">
          <View className="onb-back" hoverClass="tap" onClick={prev}>
            <Icon name="back" size={18} color="#3b4642" />
          </View>
        </View>

        <View className="onb-result">
          <Text className="onb-kicker">算好了</Text>
          <Text className="onb-big">
            您每天可以吃{"\n"}
            <Text className="onb-big-num">{plan.dailyBudgetKcal}</Text> 大卡
          </Text>

          <View className="card onb-card">
            <Row label="基础代谢" value={`${plan.bmr} 大卡`} />
            <Row label="日常消耗" value={`${plan.tdee} 大卡`} />
            <View className="onb-hr" />
            <Row label="每天少吃" value="400 大卡" hint="约合两碗米饭" />
            <Row
              label="达到目标约需"
              value={`${plan.weeksToGoal} 周`}
              hint={`从 ${weightKg} 到 ${targetWeightKg} kg`}
            />
          </View>

          {plan.clamped ? (
            <Text className="onb-warn">
              按公式算出的额度低于安全线，已经帮您提到 {plan.dailyBudgetKcal}{" "}
              大卡。减得太快对身体不好。
            </Text>
          ) : null}

          <Text className="onb-note">
            这个量分三顿吃，每顿大约 {Math.round(plan.dailyBudgetKcal / 3)}{" "}
            大卡。接下来每顿饭拍一张照，我帮您算，不用称、不用查表。
          </Text>
        </View>

        <View className="btn-primary onb-next" hoverClass="tap" onClick={finish}>
          开始
        </View>
      </View>
    );
  }

  /* ---------- 一道一道问 ---------- */
  return (
    <View className="page onb">
      <View className="onb-top">
        {/* 网页版第一题也留着这个白圆钮，点了不动。留着位置，进度条不会横跳 */}
        <View className="onb-back" hoverClass="tap" onClick={prev}>
          <Icon name="back" size={18} color="#3b4642" />
        </View>
        <View className="onb-progress">
          <ProgressBar value={step + 1} total={TOTAL} />
        </View>
      </View>

      <View className="onb-body">
        {step === 0 ? (
          <Question title="您是" hint="用来算基础代谢">
            <Opt
              active={gender === "male"}
              onClick={() => setGender("male")}
              title="男"
            />
            <Opt
              active={gender === "female"}
              onClick={() => setGender("female")}
              title="女"
            />
          </Question>
        ) : null}

        {step === 1 ? (
          <Question title="年龄" hint="基础代谢跟年龄有关">
            <Stepper
              value={age}
              onChange={setAge}
              min={18}
              max={90}
              unit="岁"
              big
              belowHint="这个工具只做成年人的饮食参考，18 岁以下请找医生"
              aboveHint="年龄请填 18 到 90 之间"
            />
          </Question>
        ) : null}

        {step === 2 ? (
          <Question title="身高" hint="上下点，调到您的身高">
            <Stepper
              value={heightCm}
              onChange={setHeightCm}
              min={140}
              max={200}
              unit="厘米"
              big
            />
          </Question>
        ) : null}

        {step === 3 ? (
          <Question title="现在体重" hint="按最近一次称的填">
            <Stepper
              value={weightKg}
              onChange={setWeightKg}
              min={40}
              max={150}
              step={0.5}
              unit="公斤"
              big
            />
          </Question>
        ) : null}

        {step === 4 ? (
          <Question title="想减到多少" hint="别定太狠，一个月减 2 公斤就很好">
            <Stepper
              value={targetWeightKg}
              onChange={(v) => setTargetWeightKg(Math.min(v, weightKg - 1))}
              min={40}
              max={Math.max(41, weightKg - 1)}
              step={0.5}
              unit="公斤"
              big
            />
          </Question>
        ) : null}

        {step === 5 ? (
          <Question title="有没有下面这些情况" hint="可以多选，会影响吃什么">
            {DISEASE_ORDER.map((d) => (
              <Opt
                key={d}
                multi
                active={diseases.includes(d)}
                onClick={() => toggleDisease(d)}
                title={DISEASE_LABEL[d]}
              />
            ))}
          </Question>
        ) : null}

        {step === 6 ? (
          <Question title="平时吃饭口味" hint="决定提醒您少放多少盐">
            <Opt
              active={taste === "salty"}
              onClick={() => setTaste("salty")}
              title="偏咸"
              desc="爱吃咸菜、酱料、口味重"
            />
            <Opt
              active={taste === "normal"}
              onClick={() => setTaste("normal")}
              title="一般"
            />
            <Opt
              active={taste === "light"}
              onClick={() => setTaste("light")}
              title="偏清淡"
            />
          </Question>
        ) : null}

        {step === 7 ? (
          <Question title="三餐规律吗" hint="决定提前多久提醒您">
            <Opt
              active={mealRegular === "regular"}
              onClick={() => setMealRegular("regular")}
              title="很规律"
              desc="提前 45 分钟提醒，过了点马上追问"
            />
            <Opt
              active={mealRegular === "sometimes"}
              onClick={() => setMealRegular("sometimes")}
              title="偶尔漏一顿"
              desc="提前 30 分钟提醒，过半小时再问"
            />
            <Opt
              active={mealRegular === "irregular"}
              onClick={() => setMealRegular("irregular")}
              title="经常不规律"
              desc="不提前催，过点一小时才问吃没吃"
            />
          </Question>
        ) : null}
      </View>

      <View className="btn-primary onb-next" hoverClass="tap" onClick={next}>
        {step === TOTAL - 1 ? "算一下" : "下一步"}
      </View>
    </View>
  );
}

/** 一道题：大标题 + 一句提示 + 选项。网页版的 Question */
function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="q">
      <Text className="q-title">{title}</Text>
      {hint ? <Text className="q-hint">{hint}</Text> : null}
      <View className="q-opts">{children}</View>
    </View>
  );
}

/** 一个选项。网页版的 OptionCard：左标题右圆点，选中打勾 */
function Opt({
  active,
  onClick,
  title,
  desc,
  multi,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
  multi?: boolean;
}) {
  return (
    <View
      className={`opt ${active ? "opt-active" : ""}`}
      hoverClass="tap"
      onClick={onClick}
    >
      <View className="opt-body">
        <Text className="opt-title">{title}</Text>
        {desc ? <Text className="opt-desc">{desc}</Text> : null}
      </View>
      <View
        className={`opt-mark ${multi ? "is-square" : ""} ${
          active ? "is-on" : ""
        }`}
      >
        {active ? <Icon name="check" size={14} color="#ffffff" /> : null}
      </View>
    </View>
  );
}

/** 结果页的一行。网页版的 Row */
function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View className="onb-row">
      <View className="onb-row-l">
        <Text className="onb-row-label">{label}</Text>
        {hint ? <Text className="onb-row-hint">{hint}</Text> : null}
      </View>
      <Text className="onb-row-value">{value}</Text>
    </View>
  );
}
