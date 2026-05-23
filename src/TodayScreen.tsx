import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import type {
  AchievementMap,
  Action,
  Anchor,
  Chain,
  Node,
} from './domain';
import { lastAchievedNodeIndex } from './domain';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
} from './tokens';

// Phase 2 variant: TodayNode は当日表示用に解決済みの label を持つ。
// useTodayData 側で resolveActionForDate(action, today) を計算し、
// kind='fire' のノードのみここに残る (kind='skip' はそもそも Today に出ない)。
// label は通常 action.title だが、 variant が設定されていれば曜日別 variant 文字列。
export type TodayNode = { node: Node; action: Action; label: string };

export type TodayScreenProps = {
  chain: Chain;
  anchor: Anchor;
  nodes: readonly TodayNode[];
  achievements: AchievementMap;
  onToggleNode: (nodeId: string) => void;
  // ADR-0012: アンカー発火イベントモデル。今日 anchor_firings に record が
  // あるかどうか (時刻/場所共通)。true のとき起点アンカー横に accent ピル
  // を出す。発火後は範囲を出る・時刻を巻き戻るなどしてもその日中は true。
  // Today に出るかどうか自体とは独立 (ADR-0003 §自動発火は便利化レイヤー)。
  anchorFiredToday?: boolean;
};

// SPINE_X は SVG viewport 内の縦線中心 x 座標。MARKER_RADIUS=7 + strokeWidth=1.5
// のとき、左端は (SPINE_X - 7 - 0.75) で計算される。viewport の左端を割らないよう
// SPINE_X >= MARKER_RADIUS + strokeWidth/2 + safety を満たすこと (K-013)。
// MARKER_RADIUS か strokeWidth を変更したらこの式の整合を再確認。
const SPINE_X = 9;
const SPINE_COLUMN_WIDTH = 28;
const ANCHOR_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 44;
const MARKER_RADIUS = 7;
const ANCHOR_DOT_RADIUS = 4;
const SPINE_STROKE = 2;

// セレブレーション (PR-1.9): DESIGN-SYSTEM §4.3 達成ジェスチャ 1 セットを実装。
// 構成: (a) ノック線伸び (cubic-bezier(.22, 1, .36, 1)) + (b) マーカーバウンス
// + (c) テキストバウンス。(b) と (c) は同じ achieved 遷移トリガー / 同じ
// イージング / 同じ duration で同期発火させる。
// 達成解除 (true→false) では bounce しない (祝福主、マイナスを指差さない)。
const KNOCK_DURATION_MS = 320;
const KNOCK_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const MARKER_BOUNCE_PEAK = 1.25;
const TEXT_BOUNCE_PEAK = 1.08;
const BOUNCE_UP_MS = 80;
// マーカーは spring で戻り (弾む感じ)、テキストは withTiming で素直に戻す
// (読み物なので揺り戻しがあると視認性が下がる、ユーザーフィードバック)。
const MARKER_SPRING = { damping: 8, stiffness: 200 } as const;
// テキストはマーカーより 1.5 倍ゆっくりで穏やかに伸縮 (PR-1.9 ユーザー判断)。
// up/down を独立持ち、マーカーとの up 同期は意図的に崩している。
const TEXT_BOUNCE_UP_MS = 120;
const TEXT_BOUNCE_DOWN_MS = 240;

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const TodayScreen = ({
  chain,
  anchor,
  nodes,
  achievements,
  onToggleNode,
  anchorFiredToday = false,
}: TodayScreenProps) => {
  const domainNodes = nodes.map((n) => n.node);
  const lastAchievedIdx = lastAchievedNodeIndex(domainNodes, achievements);
  const anchorCenterY = ANCHOR_ROW_HEIGHT / 2;
  const nodeMarkerCenterY = (idx: number) =>
    ANCHOR_ROW_HEIGHT + idx * NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2;
  // nodes 0 件のとき lastNodeY と filledEndY はともに anchorCenterY となり、Line は
  // ゼロ長で描画レス相当。Phase 1 は seed 1 本前提なので実際には到達しない経路だが、
  // Phase 2 で CRUD が入ると瞬間的に発生し得るため安全側に倒している。
  const lastNodeY =
    nodes.length > 0 ? nodeMarkerCenterY(nodes.length - 1) : anchorCenterY;
  // ADR-0010: 達成済みノード範囲モデル — 線は anchor → 最後に達成済みのノード
  // まで --grow。途中に未達ノードがあっても、両端が達成済みなら線は繋がる扱い。
  const filledEndY =
    lastAchievedIdx < 0 ? anchorCenterY : nodeMarkerCenterY(lastAchievedIdx);

  const svgHeight = ANCHOR_ROW_HEIGHT + nodes.length * NODE_ROW_HEIGHT;

  // ノックモーション: filledEndY (明色線の終端) を SharedValue で持ち、変化を
  // cubic-bezier(.22, 1, .36, 1) でアニメ。lastAchievedIdx < 0 のとき
  // (達成 0 件) は anchorCenterY で開始 → 達成が増えると下に伸びる。
  const filledEndYShared = useSharedValue(filledEndY);
  useEffect(() => {
    filledEndYShared.value = withTiming(filledEndY, {
      duration: KNOCK_DURATION_MS,
      easing: KNOCK_EASING,
    });
  }, [filledEndY, filledEndYShared]);

  const animatedGrowLineProps = useAnimatedProps(() => ({
    y2: filledEndYShared.value,
  }));
  const animatedBgLineProps = useAnimatedProps(() => ({
    y1: filledEndYShared.value,
  }));

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Today</Text>
      <View style={styles.anchorRow}>
        {anchorFiredToday && anchor.kind === 'time' && anchor.time && (
          <View style={styles.firingPill} accessibilityLabel="発火中">
            <View style={styles.firingDot} />
            <Text style={styles.firingPillText}>{anchor.time} 発火中</Text>
          </View>
        )}
        {anchorFiredToday && anchor.kind === 'place' && (
          <View style={styles.firingPill} accessibilityLabel="発火中">
            <View style={styles.firingDot} />
            <Text style={styles.firingPillText}>範囲内 発火中</Text>
          </View>
        )}
        <Text style={styles.anchorText}>{anchor.title}</Text>
        {/* 発火中ピルが情報を兼ねるので、ピル非表示時のみ控えめに併記する */}
        {!anchorFiredToday && anchor.kind === 'time' && anchor.time && (
          <>
            <Text style={styles.anchorDivider}>·</Text>
            <Text style={styles.anchorTimeText}>{anchor.time}</Text>
          </>
        )}
        {!anchorFiredToday &&
          anchor.kind === 'place' &&
          anchor.radiusMeters != null && (
            <>
              <Text style={styles.anchorDivider}>·</Text>
              <Text style={styles.anchorTimeText}>{anchor.radiusMeters}m</Text>
            </>
          )}
      </View>
      <Text style={styles.chainTitle}>{chain.title}</Text>

      <View style={[styles.spineContainer, { height: svgHeight }]}>
        <Svg
          width={SPINE_COLUMN_WIDTH}
          height={svgHeight}
          style={styles.svg}
          pointerEvents="none"
        >
          {/*
            明色線 (--grow): y2 が filledEndY に向かってアニメで伸びる。
            達成 0 件のときは y1=y2=anchorCenterY でゼロ長 (描画レス相当)。
            旧コードは lastAchievedIdx<0 で条件描画していたが、アニメ前提では
            常に描画して y2 の値変化に乗せる。
          */}
          <AnimatedLine
            x1={SPINE_X}
            y1={anchorCenterY}
            x2={SPINE_X}
            animatedProps={animatedGrowLineProps}
            stroke={COLOR_GROW}
            strokeWidth={SPINE_STROKE}
          />
          <AnimatedLine
            x1={SPINE_X}
            x2={SPINE_X}
            y2={lastNodeY}
            animatedProps={animatedBgLineProps}
            stroke={COLOR_LINE_BG}
            strokeWidth={SPINE_STROKE}
          />
          <Circle
            cx={SPINE_X}
            cy={anchorCenterY}
            r={ANCHOR_DOT_RADIUS}
            fill={COLOR_GROW}
          />
          {nodes.map(({ node }, idx) => (
            <MarkerCircle
              key={node.id}
              cy={nodeMarkerCenterY(idx)}
              achieved={achievements[node.id] ?? false}
            />
          ))}
        </Svg>

        <View
          style={[styles.contentRow, { height: ANCHOR_ROW_HEIGHT }]}
          testID="anchor-row"
        >
          <Text style={styles.anchorRowLabel}>起点アンカー</Text>
        </View>
        {nodes.map(({ node, label }) => (
          <NodeRow
            key={node.id}
            actionTitle={label}
            achieved={achievements[node.id] ?? false}
            onPress={() => onToggleNode(node.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
};

// 個別ノードマーカー。achieved の false→true 遷移時のみ scale 1→1.25→1 で
// バウンス (Celebrate 主)。true→false (達成解除) では bounce しない。
// SVG Circle の r を scale で乗じる形でアニメ化する (transform=scale より
// 中心からの拡縮が安定)。
const MarkerCircle = ({
  cy,
  achieved,
}: {
  cy: number;
  achieved: boolean;
}) => {
  const scale = useSharedValue(1);
  const prevAchievedRef = useRef(achieved);

  useEffect(() => {
    if (!prevAchievedRef.current && achieved) {
      scale.value = withSequence(
        withTiming(MARKER_BOUNCE_PEAK, {
          duration: BOUNCE_UP_MS,
          easing: KNOCK_EASING,
        }),
        withSpring(1, MARKER_SPRING),
      );
    }
    prevAchievedRef.current = achieved;
  }, [achieved, scale]);

  const animatedProps = useAnimatedProps(() => ({
    r: MARKER_RADIUS * scale.value,
  }));

  return (
    <AnimatedCircle
      cx={SPINE_X}
      cy={cy}
      animatedProps={animatedProps}
      fill={achieved ? COLOR_GROW : COLOR_BG}
      stroke={achieved ? COLOR_GROW : COLOR_FG_FAINT}
      strokeWidth={1.5}
    />
  );
};

// ノード行のテキスト。マーカーと同じ false→true 遷移で同期バウンス。
// 倍率はマーカーより控えめ (1.08) — 文字本来の可読性を優先しつつ、
// 達成タップの中央視野フィードバックを補強する役割。
const NodeRow = ({
  actionTitle,
  achieved,
  onPress,
}: {
  actionTitle: string;
  achieved: boolean;
  onPress: () => void;
}) => {
  const scale = useSharedValue(1);
  const prevAchievedRef = useRef(achieved);

  useEffect(() => {
    if (!prevAchievedRef.current && achieved) {
      // 文字は read 対象なので withSpring (揺り戻し) を使わず、 withTiming で
      // 素直に scale up → down のみ。マーカーより 1.5 倍ゆっくりで穏やかに
      // 伸縮させる (PR-1.9 ユーザー判断)。
      scale.value = withSequence(
        withTiming(TEXT_BOUNCE_PEAK, {
          duration: TEXT_BOUNCE_UP_MS,
          easing: KNOCK_EASING,
        }),
        withTiming(1, {
          duration: TEXT_BOUNCE_DOWN_MS,
          easing: KNOCK_EASING,
        }),
      );
    }
    prevAchievedRef.current = achieved;
  }, [achieved, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: achieved }}
      accessibilityLabel={actionTitle}
      style={[styles.contentRow, { height: NODE_ROW_HEIGHT }]}
    >
      <Animated.View style={[styles.nodeTextWrap, animatedStyle]}>
        <Text style={styles.nodeText}>{actionTitle}</Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
  },
  heading: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  anchorText: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
  anchorDivider: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
  },
  anchorTimeText: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  firingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  firingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_ACCENT,
  },
  firingPillText: {
    color: COLOR_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  chainTitle: {
    color: COLOR_FG,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  spineContainer: {
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  contentRow: {
    paddingLeft: SPINE_COLUMN_WIDTH + 12,
    justifyContent: 'center',
  },
  anchorRowLabel: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
  },
  // テキストバウンスの transform 基点。alignSelf:'flex-start' で左端を
  // アンカーにして scale すると、伸縮が右側に向かい行のレイアウトが揺れない。
  nodeTextWrap: { alignSelf: 'flex-start' },
  nodeText: {
    color: COLOR_FG,
    fontSize: 16,
  },
});
