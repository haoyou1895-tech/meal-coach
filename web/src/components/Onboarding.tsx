"use client";

import { useMemo, useState } from "react";
import type { Disease, Gender, MealRegular, Profile, Taste } from "@/lib/types";
import { DISEASE_LABEL } from "@/lib/nutrition";
import { buildPlan } from "@/lib/nutrition";
import { OptionCard, ProgressBar, Stepper } from "./ui";

const TOTAL = 8;

export default function Onboarding({
  onDone,
  onBack,
}: {
  onDone: (p: Profile) => void;
  onBack?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState(62);
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(75);
  const [targetWeightKg, setTargetWeightKg] = useState(68);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [taste, setTaste] = useState<Taste>("normal");
  const [mealRegular, setMealRegular] = useState<MealRegular>("regular");
  const [showResult, setShowResult] = useState(false);

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

  const toggleDisease = (d: Disease) => {
    setDiseases((prev) => {
      if (d === "none" || d === "unknown") {
        return prev.includes(d) ? [] : [d];
      }
      const withoutNone = prev.filter((x) => x !== "none" && x !== "unknown");
      return withoutNone.includes(d)
        ? withoutNone.filter((x) => x !== d)
        : [...withoutNone, d];
    });
  };

  const next = () => {
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
    if (step === 0) {
      onBack?.();
      return;
    }
    setStep((s) => s - 1);
  };

  if (showResult) {
    return (
      <div className="safe-top flex min-h-dvh flex-col px-5 pb-6 pt-4">
        <div className="animate-pop flex flex-1 flex-col justify-center">
          <p className="text-[17px] font-medium text-ink-500">算好了</p>
          <h1 className="mt-2 text-[30px] font-bold leading-tight">
            您每天可以吃
            <br />
            <span className="text-brand-500">{plan.dailyBudgetKcal}</span> 大卡
          </h1>

          <div className="card mt-7 space-y-4">
            <Row label="基础代谢" value={`${plan.bmr} 大卡`} />
            <Row label="日常消耗" value={`${plan.tdee} 大卡`} />
            <div className="h-px bg-black/[0.06]" />
            <Row
              label="每天少吃"
              value="400 大卡"
              hint="约合两碗米饭"
            />
            <Row
              label="达到目标约需"
              value={`${plan.weeksToGoal} 周`}
              hint={`从 ${weightKg} 到 ${targetWeightKg} kg`}
            />
          </div>

          {plan.clamped && (
            <p className="mt-4 rounded-2xl bg-warn-100 px-4 py-3 text-[15px] leading-relaxed text-warn-600">
              按公式算出的额度低于安全线，已经帮您提到 {plan.dailyBudgetKcal} 大卡。
              减得太快对身体不好。
            </p>
          )}

          <p className="mt-5 text-[15px] leading-relaxed text-ink-500">
            这个量分三顿吃，每顿大约 {Math.round(plan.dailyBudgetKcal / 3)} 大卡。
            接下来每顿饭拍一张照，我帮您算，不用称、不用查表。
          </p>
        </div>

        <button className="btn-primary mt-6" onClick={() => onDone(profile)}>
          开始
        </button>
      </div>
    );
  }

  return (
    <div className="safe-top flex min-h-dvh flex-col px-5 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <button
          onClick={prev}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink-700 shadow-sm"
          aria-label="返回"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 3l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex-1">
          <ProgressBar value={step + 1} total={TOTAL} />
        </div>
      </div>

      <div key={step} className="animate-pop flex flex-1 flex-col pt-8">
        {step === 0 && (
          <Question title="您是" hint="用来算基础代谢">
            <div className="space-y-3">
              <OptionCard
                active={gender === "male"}
                onClick={() => setGender("male")}
                title="男"
              />
              <OptionCard
                active={gender === "female"}
                onClick={() => setGender("female")}
                title="女"
              />
            </div>
          </Question>
        )}

        {step === 1 && (
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
        )}

        {step === 2 && (
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
        )}

        {step === 3 && (
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
        )}

        {step === 4 && (
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
        )}

        {step === 5 && (
          <Question title="有没有下面这些情况" hint="可以多选，会影响吃什么">
            <div className="space-y-3">
              {(
                [
                  "hypertension",
                  "diabetes",
                  "hyperlipidemia",
                  "fattyLiver",
                  "gout",
                  "stomach",
                  "none",
                  "unknown",
                ] as Disease[]
              ).map((d) => (
                <OptionCard
                  key={d}
                  multi
                  active={diseases.includes(d)}
                  onClick={() => toggleDisease(d)}
                  title={DISEASE_LABEL[d]}
                />
              ))}
            </div>
          </Question>
        )}

        {step === 6 && (
          <Question title="平时吃饭口味" hint="决定提醒您少放多少盐">
            <div className="space-y-3">
              <OptionCard
                active={taste === "salty"}
                onClick={() => setTaste("salty")}
                title="偏咸"
                desc="爱吃咸菜、酱料、口味重"
              />
              <OptionCard
                active={taste === "normal"}
                onClick={() => setTaste("normal")}
                title="一般"
              />
              <OptionCard
                active={taste === "light"}
                onClick={() => setTaste("light")}
                title="偏清淡"
              />
            </div>
          </Question>
        )}

        {step === 7 && (
          <Question title="三餐规律吗" hint="决定提前多久提醒您">
            <div className="space-y-3">
              <OptionCard
                active={mealRegular === "regular"}
                onClick={() => setMealRegular("regular")}
                title="很规律"
                desc="提前 45 分钟提醒，过了点马上追问"
              />
              <OptionCard
                active={mealRegular === "sometimes"}
                onClick={() => setMealRegular("sometimes")}
                title="偶尔漏一顿"
                desc="提前 30 分钟提醒，过半小时再问"
              />
              <OptionCard
                active={mealRegular === "irregular"}
                onClick={() => setMealRegular("irregular")}
                title="经常不规律"
                desc="不提前催，过点一小时才问吃没吃"
              />
            </div>
          </Question>
        )}
      </div>

      <button className="btn-primary mt-6" onClick={next}>
        {step === TOTAL - 1 ? "算一下" : "下一步"}
      </button>
    </div>
  );
}

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="text-[27px] font-bold leading-snug tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-2 text-[16px] text-ink-500">{hint}</p>}
      <div className="mt-7">{children}</div>
    </>
  );
}

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
    <div className="flex items-baseline justify-between">
      <div>
        <span className="text-[16px] text-ink-700">{label}</span>
        {hint && <p className="mt-0.5 text-[13px] text-ink-300">{hint}</p>}
      </div>
      <span className="text-[18px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
