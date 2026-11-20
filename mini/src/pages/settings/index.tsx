import { Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { DISEASE_LABEL, buildPlan, todayStr } from "../../lib/nutrition";
import { clearPhotos } from "../../lib/photos";
import {
  activityOfDate,
  latestWeightKg,
  loadState,
  resetState,
  saveState,
  type AppState,
} from "../../lib/store";
import "./index.scss";

/**
 * 设置。照 web/src/app/page.tsx 里那个 Sheet 搬过来的。
 *
 * 上一版首页的齿轮直接跳到引导页 —— 那是"重新填一遍资料"，
 * 不是设置。用户点齿轮想看的三个数（预算、代谢、体重），
 * 在引导页里一个都找不到。
 */
type Panel = null | "export" | "import";

export default function SettingsPage() {
  const [state, setState] = useState<AppState | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [dump, setDump] = useState("");
  const [notice, setNotice] = useState("");

  useDidShow(() => {
    setState(loadState());
  });

  const today = todayStr();

  const vm = useMemo(() => {
    if (!state?.profile) return null;
    const profile = state.profile;
    // 预算按最近一次称的体重算，跟首页一致
    const weight = latestWeightKg(state.weights, profile.weightKg);
    const plan = buildPlan({ ...profile, weightKg: weight }, activityOfDate(state, today));
    return { profile, plan, weight };
  }, [state, today]);

  if (!vm || !state) return <View className="page" />;

  const { profile, plan, weight } = vm;

  const exportCode = () => {
    setDump(JSON.stringify(state));
    setPanel("export");
    setNotice("");
  };

  const importCode = async () => {
    setPanel("import");
    setNotice("");
    try {
      const r = await Taro.getClipboardData();
      setDump(r.data ?? "");
    } catch {
      setDump("");
    }
  };

  const copy = () => {
    Taro.setClipboardData({ data: dump })
      .then(() => setNotice("复制好了，存到微信收藏或备忘录里"))
      .catch(() => setNotice("复制不了，长按上面的字全选"));
  };

  const restore = () => {
    try {
      const parsed = JSON.parse(dump) as AppState;
      if (!parsed || !Array.isArray(parsed.meals)) throw new Error("bad");
      resetState();
      void clearPhotos();
      const next: AppState = {
        profile: parsed.profile ?? null,
        meals: parsed.meals,
        weights: Array.isArray(parsed.weights) ? parsed.weights : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        onboarded: !!parsed.onboarded,
      };
      saveState(next);
      setState(next);
      setPanel(null);
      setNotice("恢复好了");
    } catch {
      setNotice("这串码不对，检查一下有没有复制全");
    }
  };

  const wipe = async () => {
    const r = await Taro.showModal({
      title: "清空所有记录？",
      content: "体重、饮食记录都会删掉，这个操作不能撤销。",
      confirmText: "清空",
      confirmColor: "#b23c2c",
      cancelText: "算了",
    });
    if (!r.confirm) return;
    resetState();
    void clearPhotos();
    // 清空后没有资料了，回引导页重新开始
    Taro.reLaunch({ url: "/pages/setup/index" });
  };

  return (
    <View className="page set">
      <View className="sec">
        <View className="card">
          <InfoRow label="每日预算" value={`${plan.dailyBudgetKcal} 大卡`} />
          <InfoRow label="基础代谢" value={`${plan.bmr} 大卡`} />
          <InfoRow label="当前体重" value={`${weight} 公斤`} />
          <InfoRow label="目标体重" value={`${profile.targetWeightKg} 公斤`} />
          <InfoRow
            label="健康状况"
            value={
              profile.diseases.length
                ? profile.diseases.map((d) => DISEASE_LABEL[d]).join("、")
                : "未填写"
            }
          />
        </View>
      </View>

      <View className="sec mt3">
        <View
          className="btn-ghost"
          hoverClass="tap"
          onClick={() => Taro.navigateTo({ url: "/pages/setup/index" })}
        >
          <Text className="btn-ghost-text">重新设置身高体重</Text>
        </View>
      </View>

      {/*
        换手机、清缓存 —— 本地数据会全没，而且用户不知道为什么。
        照片在手机文件里搬不走，文字和数字能搬，这点必须说清楚，
        不能让人以为"备份过了照片就还在"。
      */}
      <View className="sec mt3">
        <View className="card move">
          <View className="move-head">
            <Text className="move-title">搬家</Text>
            <Text className="move-sub">换手机用这个</Text>
          </View>
          <View className="move-btns">
            <View className="move-btn" hoverClass="tap" onClick={exportCode}>
              <Text className="move-btn-text">备份一串码</Text>
            </View>
            <View className="move-btn" hoverClass="tap" onClick={importCode}>
              <Text className="move-btn-text">粘回来</Text>
            </View>
          </View>
          <Text className="move-hint">只带记录和体重，照片带不走。换手机后照片会没有，数字都在。</Text>
        </View>
      </View>

      {panel && (
        <View className="sec mt3">
          <View className="card">
            <Text className="panel-title">
              {panel === "export" ? "全选复制，存到微信收藏或备忘录里" : "把之前存下的那串码粘进下面"}
            </Text>
            <Textarea
              className="panel-area"
              value={dump}
              maxlength={-1}
              disabled={panel === "export"}
              onInput={(e) => setDump(e.detail.value)}
            />
            <View className="panel-btns">
              {panel === "export" ? (
                <View className="panel-btn primary" hoverClass="tap" onClick={copy}>
                  <Text className="panel-btn-text primary">复制</Text>
                </View>
              ) : (
                <View className="panel-btn primary" hoverClass="tap" onClick={restore}>
                  <Text className="panel-btn-text primary">恢复</Text>
                </View>
              )}
              <View className="panel-btn" hoverClass="tap" onClick={() => setPanel(null)}>
                <Text className="panel-btn-text">关掉</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {!!notice && <Text className="notice">{notice}</Text>}

      <View className="sec mt3">
        <View className="btn-ghost danger" hoverClass="tap" onClick={wipe}>
          <Text className="btn-ghost-text danger">清空所有记录</Text>
        </View>
      </View>

      <View className="foot">
        <Text className="foot-text">餐谋 v0.1 · 数据只存在这台手机上</Text>
        <Text className="foot-text">本产品不构成医疗建议，如有疾病请遵医嘱</Text>
      </View>

      <View className="safe-bottom" />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="info-row">
      <Text className="info-label">{label}</Text>
      <Text className="info-value">{value}</Text>
    </View>
  );
}
