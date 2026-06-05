import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { momentLabel } from './discoveryLabels';
import { ONBOARDING_STEPS, stepProgress } from './onboarding';
import type { OnboardingMoment, OnboardingStep } from './onboarding';
import type { OnboardingPreviewModule } from './useOnboarding';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_STAR,
  COLOR_SURFACE,
} from './tokens';

// #72 (SPEC docs/template-modules-spec.md §5): onboarding (初回ルート) の presentation。
// 状態ゴール扉だけを通る 1 画面 1 決定の連続。props 駆動で hook 非依存 = RTL でテスト可能。
// ステップ進行・採用・通知許可の副作用は useOnboarding / app/onboarding.tsx の責務。

export type OnboardingScreenProps = {
  step: OnboardingStep;
  firstMoment: OnboardingMoment | null;
  time: string; // 1 本目アンカー時刻 'HH:MM'
  // #106: 1 本目で選べる starter モジュールのアクション + 選択集合。
  previewModules: OnboardingPreviewModule[];
  selectedLinkIds: Set<string>;
  onToggleLink: (linkId: string) => void;
  secondMoment: OnboardingMoment | null; // もう一方の moment (= otherMoment(first))
  adoptedTimes: string[]; // 採用したチェーンの起動時刻 (done のサマリ用、1 or 2 件)
  notifyDecided: 'granted' | 'denied' | null;
  adopting: boolean;
  onBack: () => void;
  onStart: () => void; // welcome → moment
  onSelectMoment: (m: OnboardingMoment) => void; // moment → anchorTime
  onChangeTime: (time: string) => void;
  onConfirmTime: () => void; // anchorTime → preview
  onAdoptFirst: () => void; // preview → second (1 本目を採用)
  onAddSecond: () => void; // second → notify (2 本目を採用)
  onSkipSecond: () => void; // second → notify (1 本で始める)
  onRequestNotify: () => void; // notify → done (許可をリクエスト)
  onSkipNotify: () => void; // notify → done (あとで)
  onFinish: () => void; // done → Today
  onTryNow: () => void; // done → Today (1 本目を開く)
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const parseHM = (s: string): { hour: number; minute: number } | null => {
  const parts = s.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0]!, 10);
  const minute = parseInt(parts[1]!, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};
const clampHour = (raw: string): string => {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '00' : pad2(Math.min(23, Math.max(0, n)));
};
const clampMinute = (raw: string): string => {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '00' : pad2(Math.min(59, Math.max(0, n)));
};

// 進捗ドット。現在ステップまでを塗る (積み上がりの可視化、Celebrate 主と整合)。
const ProgressDots = ({ step }: { step: OnboardingStep }) => {
  const { current, total } = stepProgress(step);
  return (
    <View style={styles.dots} accessibilityLabel={`ステップ ${current} / ${total}`}>
      {ONBOARDING_STEPS.map((s, i) => (
        <View
          key={s}
          style={[styles.dot, i < current ? styles.dotFilled : styles.dotEmpty]}
        />
      ))}
    </View>
  );
};

const TimeField = ({
  time,
  onChangeTime,
}: {
  time: string;
  onChangeTime: (t: string) => void;
}) => {
  const init = parseHM(time) ?? { hour: 7, minute: 0 };
  const [hour, setHour] = useState(pad2(init.hour));
  const [minute, setMinute] = useState(pad2(init.minute));

  useEffect(() => {
    const p = parseHM(time);
    if (p) {
      setHour(pad2(p.hour));
      setMinute(pad2(p.minute));
    }
  }, [time]);

  const commit = (h: string, m: string) => {
    const p = parseHM(`${h}:${m}`);
    if (p) onChangeTime(`${pad2(p.hour)}:${pad2(p.minute)}`);
  };

  return (
    <View style={styles.timeRow}>
      <TextInput
        value={hour}
        onChangeText={setHour}
        onBlur={() => {
          const c = clampHour(hour);
          setHour(c);
          commit(c, minute);
        }}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.timeInput}
        accessibilityLabel="時"
        selectTextOnFocus
      />
      <Text style={styles.timeColon}>:</Text>
      <TextInput
        value={minute}
        onChangeText={setMinute}
        onBlur={() => {
          const c = clampMinute(minute);
          setMinute(c);
          commit(hour, c);
        }}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.timeInput}
        accessibilityLabel="分"
        selectTextOnFocus
      />
    </View>
  );
};

const PrimaryButton = ({
  label,
  onPress,
  disabled,
  busy,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || busy}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: disabled || busy }}
    style={[styles.primaryBtn, (disabled || busy) && styles.btnDisabled]}
  >
    {busy ? (
      <ActivityIndicator color={COLOR_BG} />
    ) : (
      <Text style={styles.primaryBtnText}>{label}</Text>
    )}
  </Pressable>
);

const SecondaryButton = ({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={styles.secondaryBtn}
  >
    <Text style={styles.secondaryBtnText}>{label}</Text>
  </Pressable>
);

export const OnboardingScreen = (props: OnboardingScreenProps) => {
  const { step } = props;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topbar}>
        {step !== 'welcome' ? (
          <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel="戻る">
            <Text style={styles.back}>‹ 戻る</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <ProgressDots step={step} />
        <View style={styles.backSpacer} />
      </View>
      <View style={styles.body}>{renderStep(props)}</View>
    </SafeAreaView>
  );
};

const renderStep = (props: OnboardingScreenProps) => {
  switch (props.step) {
    case 'welcome':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>続けるを、積み上げる。</Text>
          <Text style={styles.lead}>
            起点を 1 つ決めて、行動を繋げていくだけ。今日から始めましょう。
          </Text>
          <View style={styles.grow} />
          <PrimaryButton label="はじめる" onPress={props.onStart} />
        </View>
      );

    case 'moment':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>いつを良くしたい?</Text>
          <Text style={styles.lead}>朝か夜、始めやすい方を選んでください。</Text>
          <View style={styles.momentRow}>
            {(['morning', 'night'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => props.onSelectMoment(m)}
                accessibilityRole="button"
                accessibilityLabel={`${momentLabel(m)}から始める`}
                accessibilityState={{ selected: props.firstMoment === m }}
                style={[
                  styles.momentCard,
                  props.firstMoment === m && styles.momentCardActive,
                ]}
              >
                <Text style={styles.momentCardText}>{momentLabel(m)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.grow} />
        </View>
      );

    case 'anchorTime':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>
            {props.firstMoment ? momentLabel(props.firstMoment) : ''}は何時に始める?
          </Text>
          <Text style={styles.lead}>毎日この時刻に通知でそっと知らせます。</Text>
          <View style={styles.timeWrap}>
            <TimeField time={props.time} onChangeTime={props.onChangeTime} />
          </View>
          <View style={styles.grow} />
          <PrimaryButton label="次へ" onPress={props.onConfirmTime} />
        </View>
      );

    case 'preview':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>やることを選びましょう</Text>
          <Text style={styles.lead}>
            まずは小さく。要らないものは外して OK。あとから足せます。
          </Text>
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
          >
            {props.previewModules.map((m) => (
              <View key={m.moduleId} style={styles.previewModule}>
                <View style={styles.previewModuleHead}>
                  <View
                    style={[styles.previewModuleDot, { backgroundColor: m.moduleColor }]}
                  />
                  <Text style={styles.previewModuleName}>{m.moduleName}</Text>
                </View>
                {m.links.map((l) => {
                  const checked = props.selectedLinkIds.has(l.id);
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => props.onToggleLink(l.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={l.title}
                      style={styles.previewLinkRow}
                    >
                      <View
                        style={[
                          styles.previewCheckbox,
                          checked && styles.previewCheckboxChecked,
                        ]}
                      >
                        {checked && <Text style={styles.previewCheckmark}>✓</Text>}
                      </View>
                      <Text
                        style={[
                          styles.previewLinkText,
                          !checked && styles.previewLinkTextMuted,
                        ]}
                      >
                        {l.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <PrimaryButton
            label={`これで始める (${props.selectedLinkIds.size})`}
            onPress={props.onAdoptFirst}
            busy={props.adopting}
            disabled={props.selectedLinkIds.size === 0}
          />
        </View>
      );

    case 'second':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>もう一方も始めますか?</Text>
          <Text style={styles.lead}>
            {props.secondMoment ? momentLabel(props.secondMoment) : ''}
            の習慣も追加できます。1 本だけでも大丈夫です。
          </Text>
          <View style={styles.grow} />
          <PrimaryButton
            label={`${props.secondMoment ? momentLabel(props.secondMoment) : ''}も追加する`}
            accessibilityLabel={`${props.secondMoment ? momentLabel(props.secondMoment) : ''}の習慣も追加する`}
            onPress={props.onAddSecond}
            busy={props.adopting}
          />
          <SecondaryButton label="1本で始める" onPress={props.onSkipSecond} />
        </View>
      );

    case 'notify':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.h1}>通知で背中を押す</Text>
          <Text style={styles.lead}>
            設定した時刻にそっと知らせます。続けやすくなります。
          </Text>
          {props.notifyDecided === 'denied' && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>
                通知が無くても大丈夫。Today を開けば、その日のチェーンが並んでいます。タップで実行できます。
              </Text>
            </View>
          )}
          <View style={styles.grow} />
          <PrimaryButton label="通知を許可" onPress={props.onRequestNotify} />
          <SecondaryButton label="あとで" onPress={props.onSkipNotify} />
        </View>
      );

    case 'done':
      return (
        <View style={styles.stepCol}>
          <Text style={styles.doneMark}>✓</Text>
          <Text style={styles.h1}>準備完了</Text>
          {props.adoptedTimes.map((t) => (
            <Text key={t} style={styles.doneSchedule}>
              明日 {t} に起動します
            </Text>
          ))}
          <View style={styles.grow} />
          <PrimaryButton label="今すぐ1回試す" onPress={props.onTryNow} />
          <SecondaryButton label="完了" onPress={props.onFinish} />
        </View>
      );
  }
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  back: { color: COLOR_FG_SOFT, fontSize: 15 },
  backSpacer: { width: 56 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 999 },
  dotFilled: { backgroundColor: COLOR_GROW },
  dotEmpty: { backgroundColor: COLOR_LINE_BG },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  stepCol: { flex: 1, gap: 12, paddingTop: 24 },
  grow: { flex: 1 },
  h1: {
    color: COLOR_FG,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  lead: { color: COLOR_FG_SOFT, fontSize: 15, lineHeight: 22 },
  momentRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  momentCard: {
    flex: 1,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    paddingVertical: 32,
    alignItems: 'center',
    minHeight: 44,
  },
  momentCardActive: { backgroundColor: COLOR_GROW },
  momentCardText: { color: COLOR_FG, fontSize: 22, fontWeight: '700' },
  timeWrap: { alignItems: 'center', marginTop: 24 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: {
    color: COLOR_FG,
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
    minWidth: 84,
    textAlign: 'center',
    backgroundColor: COLOR_SURFACE,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  timeColon: { color: COLOR_FG_FAINT, fontSize: 56, fontWeight: '700' },
  // #106: 選択リスト
  previewScroll: { flex: 1, marginTop: 8 },
  previewScrollContent: { gap: 16, paddingBottom: 8 },
  previewModule: { gap: 8 },
  previewModuleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewModuleDot: { width: 10, height: 10, borderRadius: 999 },
  previewModuleName: { color: COLOR_FG_SOFT, fontSize: 13, fontWeight: '700' },
  previewLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLOR_SURFACE,
    minHeight: 44,
  },
  previewCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLOR_FG_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCheckboxChecked: { backgroundColor: COLOR_GROW, borderColor: COLOR_GROW },
  previewCheckmark: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  previewLinkText: { color: COLOR_FG, fontSize: 16, flex: 1 },
  previewLinkTextMuted: { color: COLOR_FG_SOFT },
  noticeCard: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  noticeText: { color: COLOR_FG_SOFT, fontSize: 13, lineHeight: 20 },
  doneMark: { color: COLOR_STAR, fontSize: 48, fontWeight: '700' },
  doneSchedule: { color: COLOR_FG_SOFT, fontSize: 15 },
  primaryBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: { color: COLOR_BG, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: COLOR_FG_SOFT, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
