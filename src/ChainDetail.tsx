import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

import type { DateMatrixCell } from './analyticsDerivation';
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
  COLOR_OK,
  COLOR_STAR,
} from './tokens';

// Phase 2 variant: TodayNode は当日表示用に解決済みの label + kind を持つ。
// useTodayData 側で resolveActionForDate(action, today) を計算し、 kind を保持。
// - kind='fire': 通常のノード、 マーカー描画 + タップで達成可
// - kind='skip': variant null の曜日、 マーカー描画なし + グレー表示 + タップ無効
export type TodayNode = {
  node: Node;
  action: Action;
  label: string;
  kind: 'fire' | 'skip';
};

// PR-X (ADR-0021): Bottom Sheet 内に表示する 1 チェーン分の詳細ビュー。
// 旧 TodayScreen の中身 (アンカー行 + チェーンタイトル + スパイン + ノードリスト)
// を切り出した。 「Today」見出しと scroll wrap は呼び出し側 (TodayScreen) が担当。
//
// PR-Z1 (ADR-0024 §3a): 定着済み (14D 中 10 日以上達成) のノードは円→塗り星に切替。
// 定着判定は親 (TodayScreen / useTodayData) で派生計算し、 nodeIdsEstablished として
// 渡す (= ChainDetail は判定責務を持たず view 専念、 純粋関数結果の表示係)。
export type ChainDetailProps = {
  chain: Chain;
  anchor: Anchor;
  nodes: readonly TodayNode[];
  achievements: AchievementMap;
  onToggleNode: (nodeId: string) => void;
  anchorFiredToday?: boolean;
  nodeIdsEstablished?: ReadonlySet<string>;
  // PR-BB (ADR-0025): タイマー設定済みノードでタップされたとき呼ぶ。
  // 親 (TodayScreen) が TimerScreen Modal を制御する責務。 onStartTimer 未指定 → ボタン非表示。
  onStartTimer?: (nodeId: string, durationSeconds: number, actionTitle: string) => void;
  // #125: 各ノード行右端に直近 7 日間の達成グリフマトリクスを描画する。
  // 渡されない / 該当 nodeId 不在のノードはマトリクス非表示 (既存挙動互換)。 派生値の
  // 計算は useTodayData が担当 (純粋関数 nodeDateMatrixCells、 ChainDetail は表示係)。
  nodeRecentCells?: ReadonlyMap<string, readonly DateMatrixCell[]>;
};

const SPINE_X = 9;
const SPINE_COLUMN_WIDTH = 28;
const ANCHOR_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 44;
const MARKER_RADIUS = 7;
const ANCHOR_DOT_RADIUS = 4;
const SPINE_STROKE = 2;

// セレブレーション (PR-1.9): DESIGN-SYSTEM §4.3 達成ジェスチャ 1 セット。
const KNOCK_DURATION_MS = 320;
const KNOCK_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const MARKER_BOUNCE_PEAK = 1.25;
const TEXT_BOUNCE_PEAK = 1.08;
const BOUNCE_UP_MS = 80;
const MARKER_SPRING = { damping: 8, stiffness: 200 } as const;
const TEXT_BOUNCE_UP_MS = 120;
const TEXT_BOUNCE_DOWN_MS = 240;

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const ChainDetail = ({
  chain,
  anchor,
  nodes,
  achievements,
  onToggleNode,
  anchorFiredToday = false,
  nodeIdsEstablished,
  onStartTimer,
  nodeRecentCells,
}: ChainDetailProps) => {
  const domainNodes = nodes.map((n) => n.node);
  const lastAchievedIdx = lastAchievedNodeIndex(domainNodes, achievements);
  const anchorCenterY = ANCHOR_ROW_HEIGHT / 2;
  const nodeMarkerCenterY = (idx: number) =>
    ANCHOR_ROW_HEIGHT + idx * NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2;
  const lastNodeY =
    nodes.length > 0 ? nodeMarkerCenterY(nodes.length - 1) : anchorCenterY;
  const filledEndY =
    lastAchievedIdx < 0 ? anchorCenterY : nodeMarkerCenterY(lastAchievedIdx);
  const svgHeight = ANCHOR_ROW_HEIGHT + nodes.length * NODE_ROW_HEIGHT;

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
    <View style={styles.root}>
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

      {/* #74 (SPEC §8): 全ノード一時停止 (= active な node が 0) の空状態。
          active チェーンは必ず 1 ノード以上保存されているため、表示 0 = 全休止。
          マイナスを指差さず穏やかに再開を促す (Augmentation 原則)。 */}
      {nodes.length === 0 ? (
        <Text style={styles.allPausedHint} accessibilityLabel="すべて一時停止中">
          すべて一時停止中 · 編集で再開できます
        </Text>
      ) : (
      <View style={[styles.spineContainer, { height: svgHeight }]}>
        <Svg
          width={SPINE_COLUMN_WIDTH}
          height={svgHeight}
          style={styles.svg}
          pointerEvents="none"
        >
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
          {nodes.map(({ node, kind }, idx) =>
            kind === 'skip' ? null : (
              <NodeMarker
                key={node.id}
                nodeId={node.id}
                cy={nodeMarkerCenterY(idx)}
                achieved={achievements[node.id] ?? false}
              />
            ),
          )}
        </Svg>

        <View
          style={[styles.contentRow, { height: ANCHOR_ROW_HEIGHT }]}
          testID="anchor-row"
        >
          <Text style={styles.anchorRowLabel}>起点アンカー</Text>
        </View>
        {nodes.map(({ node, action, label, kind }) =>
          kind === 'skip' ? (
            <SkipNodeRow
              key={node.id}
              nodeId={node.id}
              actionTitle={label}
              recentCells={nodeRecentCells?.get(node.id)}
            />
          ) : (
            <NodeRow
              key={node.id}
              nodeId={node.id}
              actionTitle={label}
              achieved={achievements[node.id] ?? false}
              established={nodeIdsEstablished?.has(node.id) ?? false}
              onPress={() => onToggleNode(node.id)}
              timerSeconds={action.timerSeconds}
              onStartTimer={
                onStartTimer &&
                action.timerSeconds != null &&
                action.timerSeconds > 0
                  ? () =>
                      onStartTimer(node.id, action.timerSeconds!, label)
                  : undefined
              }
              recentCells={nodeRecentCells?.get(node.id)}
            />
          ),
        )}
      </View>
      )}
    </View>
  );
};

// Issue #118: 左マーカーは定着済みでも常に円のまま (星マークはアクション名の右に
// 小さく表示)。 達成 false→true 遷移時のバウンスは従来どおり円形で発火する
// (達成ジェスチャの一部、 DESIGN-SYSTEM §4.3)。
const NodeMarker = ({
  nodeId,
  cy,
  achieved,
}: {
  nodeId: string;
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

  const circleAnimatedProps = useAnimatedProps(() => ({
    r: MARKER_RADIUS * scale.value,
  }));

  return (
    <AnimatedCircle
      testID={`node-marker-circle-${nodeId}`}
      cx={SPINE_X}
      cy={cy}
      animatedProps={circleAnimatedProps}
      fill={achieved ? COLOR_GROW : COLOR_BG}
      stroke={achieved ? COLOR_GROW : COLOR_FG_FAINT}
      strokeWidth={1.5}
    />
  );
};

const SkipNodeRow = ({
  nodeId,
  actionTitle,
  recentCells,
}: {
  nodeId: string;
  actionTitle: string;
  recentCells?: readonly DateMatrixCell[];
}) => (
  <View
    style={[styles.contentRow, styles.nodeRowContainer, { height: NODE_ROW_HEIGHT }]}
    accessibilityLabel={`${actionTitle} (今日は休む日)`}
  >
    <Text style={styles.skipMark}>—</Text>
    <Text style={[styles.skipNodeText, styles.skipNodeTextFlex]}>{actionTitle}</Text>
    {recentCells && <NodeRecentCellsMatrix nodeId={nodeId} cells={recentCells} />}
  </View>
);

const NodeRow = ({
  nodeId,
  actionTitle,
  achieved,
  established,
  onPress,
  timerSeconds,
  onStartTimer,
  recentCells,
}: {
  nodeId: string;
  actionTitle: string;
  achieved: boolean;
  established: boolean;
  onPress: () => void;
  timerSeconds: number | null;
  onStartTimer?: () => void;
  recentCells?: readonly DateMatrixCell[];
}) => {
  const scale = useSharedValue(1);
  const prevAchievedRef = useRef(achieved);

  useEffect(() => {
    if (!prevAchievedRef.current && achieved) {
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

  const minutes = timerSeconds != null ? Math.round(timerSeconds / 60) : null;

  return (
    <View style={[styles.contentRow, styles.nodeRowContainer, { height: NODE_ROW_HEIGHT }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: achieved }}
        accessibilityLabel={actionTitle}
        style={styles.nodePressArea}
      >
        <Animated.View style={[styles.nodeTextWrap, animatedStyle]}>
          <Text style={styles.nodeText}>{actionTitle}</Text>
        </Animated.View>
        {/* Issue #118: 定着済みノードはアクション名の右に小さく星を表示。
            #118 追補 (Taku 2026-06-16): 今日の達成状態に関わらず常に塗り (★) で
            表示する。 Issue #113 の「達成=★ / 未達=☆」塗り分けセマンティクスは
            撤回 (= マイナス側 (☆) を指差さない / Celebrate 主、 DESIGN-SYSTEM §0)。
            定着自体が祝福なので、 その日の達成状態で表現を薄めない。 */}
        {established && (
          <Text
            testID={`node-row-star-${nodeId}`}
            style={styles.nodeRowStar}
            accessibilityLabel="定着済み"
          >
            ★
          </Text>
        )}
      </Pressable>
      {onStartTimer && minutes != null && (
        <Pressable
          onPress={onStartTimer}
          accessibilityRole="button"
          accessibilityLabel={`${actionTitle} ${minutes} 分のタイマー開始`}
          style={styles.timerBtn}
        >
          <Text style={styles.timerBtnText}>⏱ {minutes} 分</Text>
        </Pressable>
      )}
      {recentCells && <NodeRecentCellsMatrix nodeId={nodeId} cells={recentCells} />}
    </View>
  );
};

// #125: アクション行右端に置く直近 7 日間の達成グリフマトリクス。
// セル語彙は分析タブの DateMatrixSection (#115 / ADR-0037) と同じ:
// - 達成 = COLOR_OK の塗り四角 (Celebrate 主)
// - 未達 = COLOR_FG_FAINT のアウトライン四角 (赤や塗りは使わない = マイナスを指差さない)
// - 休む日 (variant null) = 空セル (対象外なので何も置かない)
// 表示専用 (tap detail なし、 ChainDetail のノード行タップで toggle するため)。
// #145: 実機で横幅占有が大きすぎたため (旧 8px セル + 10px slot で 7 セル = 70px)
// セル幅・高さおよび slot を縦横半分に縮小 (4px セル + 5px slot、 7 セルで 35px 幅)。
const RECENT_CELL_SIZE = 4;
const RECENT_CELL_SLOT = 5;

const cellStateLabel = (cell: DateMatrixCell): '達成' | '休む日' | '未達' =>
  cell.achieved ? '達成' : cell.skipped ? '休む日' : '未達';

const monthDayLabel = (date: string): string => {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
};

const NodeRecentCellsMatrix = ({
  nodeId,
  cells,
}: {
  nodeId: string;
  cells: readonly DateMatrixCell[];
}) => (
  <View style={styles.recentCellsRow}>
    {cells.map((cell) => (
      <View
        key={cell.date}
        testID={`node-recent-cell-${nodeId}-${cell.date}`}
        accessible
        accessibilityLabel={`${monthDayLabel(cell.date)} ${cellStateLabel(cell)}`}
        style={styles.recentCellSlot}
      >
        <View
          style={[
            styles.recentCell,
            cell.achieved
              ? styles.recentCellAchieved
              : cell.skipped
                ? styles.recentCellSkip
                : styles.recentCellMiss,
          ]}
        />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  root: { padding: 24 },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  anchorText: { color: COLOR_FG_SOFT, fontSize: 14 },
  anchorDivider: { color: COLOR_FG_FAINT, fontSize: 14 },
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
  firingPillText: { color: COLOR_ACCENT, fontSize: 11, fontWeight: '600' },
  chainTitle: {
    color: COLOR_FG,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  allPausedHint: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    paddingVertical: 8,
  },
  spineContainer: { position: 'relative' },
  svg: { position: 'absolute', top: 0, left: 0 },
  contentRow: {
    paddingLeft: SPINE_COLUMN_WIDTH + 12,
    justifyContent: 'center',
  },
  anchorRowLabel: { color: COLOR_FG_FAINT, fontSize: 12 },
  nodeRowContainer: { flexDirection: 'row', alignItems: 'center' },
  nodePressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nodeTextWrap: { alignSelf: 'center' },
  nodeText: { color: COLOR_FG, fontSize: 16 },
  // Issue #118: アクション名の右に置く小さな定着星。 控えめなサイズ・トーン。
  // 色は COLOR_STAR (定着のセレブレーション色) を維持。
  nodeRowStar: {
    color: COLOR_STAR,
    fontSize: 12,
    fontWeight: '600',
  },
  timerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR_GROW,
    marginRight: 8,
  },
  timerBtnText: {
    color: COLOR_GROW,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  skipMark: {
    position: 'absolute',
    left: 0,
    width: SPINE_COLUMN_WIDTH,
    textAlign: 'center',
    color: COLOR_FG_FAINT,
    fontSize: 14,
    fontWeight: '600',
  },
  skipNodeText: { color: COLOR_FG_FAINT, fontSize: 16 },
  // SkipNodeRow に flex 行レイアウトを追加した際 (#125)、 タイトルが残り幅を占める
  // ことでマトリクスが右端に押し出されるようにする。 abs 配置の skipMark は影響しない。
  skipNodeTextFlex: { flex: 1 },
  // #125: 直近 7 日間達成グリフマトリクス。 分析タブ DateMatrixSection と同じ語彙
  // (達成 = COLOR_OK 塗り / 未達 = アウトライン / 休む日 = 空) の縮小版。
  recentCellsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  recentCellSlot: {
    width: RECENT_CELL_SLOT,
    height: NODE_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCell: {
    width: RECENT_CELL_SIZE,
    height: RECENT_CELL_SIZE,
    borderRadius: 1,
  },
  recentCellAchieved: { backgroundColor: COLOR_OK },
  recentCellMiss: { borderWidth: 1, borderColor: COLOR_FG_FAINT },
  recentCellSkip: {},
});
