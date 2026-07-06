import { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlertButton } from 'react-native';
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
// ADR-0047: 定着済み (settled = latch) のノードはアクション名の右に小さな ★ を表示し、
// Today で **auto-✓ (タップ不要)** 扱いにする (2026-07-07 追補・ユーザー判断: 記録の手間を
// 減らす)。 表示上の達成 (effective) = 実レコード OR 定着。 タップは no-op (達成レコードを
// 書かない = K-002)。 定着判定は親 (useTodayData) で派生し nodeIdsSettled で渡す
// (ChainDetail は判定責務を持たず view 専念)。
export type ChainDetailProps = {
  chain: Chain;
  anchor: Anchor;
  nodes: readonly TodayNode[];
  achievements: AchievementMap;
  onToggleNode: (nodeId: string) => void;
  // ADR-0044 (#181): ノード行の長押しで手動メモを書く導線。 親 (TodayScreen) が
  // NoteComposeModal を制御する責務。 未指定 → 長押しメモ動線は無効 (既存挙動互換)。
  onNoteLongPress?: (nodeId: string) => void;
  anchorFiredToday?: boolean;
  nodeIdsSettled?: ReadonlySet<string>;
  // ADR-0047: 定着ノードの長押しメニューから「定着を取り下げる」導線。 未指定 → 取り下げ無効。
  // 定着済みノードの長押しは「メモを追加 / 定着を取り下げる」の選択メニューを出す (両導線・
  // ユーザー判断)。 未定着ノードの長押しは従来どおり直接メモ作成。
  onRetractSettlement?: (nodeId: string) => void;
  // PR-BB (ADR-0025): タイマー設定済みノードでタップされたとき呼ぶ。
  // 親 (TodayScreen) が TimerScreen Modal を制御する責務。 onStartTimer 未指定 → ボタン非表示。
  onStartTimer?: (nodeId: string, durationSeconds: number, actionTitle: string) => void;
  // #125 / ADR-0038: 各ノード行右端に直近 7 日間の達成グリフマトリクスを描画する。
  // ADR-0038 で SPEC §3「v1 単一窓 14D 固定」を軸別再解釈 (K-015 パターン 2 度目の適用)
  // し、 Today ChainDetail ノード行 = 7D の「実行直前の振り返り窓」として正式化された。
  // 渡されない / 該当 nodeId 不在のノードはマトリクス非表示 (既存挙動互換)。 派生値の
  // 計算は useTodayData が担当 (純粋関数 nodeDateMatrixCells、 ChainDetail は表示係)。
  nodeRecentCells?: ReadonlyMap<string, readonly DateMatrixCell[]>;
};

const SPINE_X = 9;
const SPINE_COLUMN_WIDTH = 28;
const CONTENT_ROW_PADDING_LEFT = SPINE_COLUMN_WIDTH + 12;
const ANCHOR_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 44;
const MARKER_RADIUS = 7;
const ANCHOR_DOT_RADIUS = 4;
const SPINE_STROKE = 2;
// Issue #190: 左の SVG ドットは pointerEvents="none" 越しに描かれるため、
// ドット位置 (cx=SPINE_X≈9) は Pressable の layout box (paddingLeft=40 の内側) から外れ、
// 「見た目のドットを押しても達成トグルが発火しない」死角になっていた。 hitSlop で
// touchable を左に拡張してドット領域までカバーする (layout は変えない = 密度を保つ)。
const NODE_HIT_SLOP_LEFT = CONTENT_ROW_PADDING_LEFT;

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

// ADR-0047: ノード長押しの動作を合成する。 定着済み (settled) + 取り下げ導線ありなら
// 「メモを追加 / 定着を取り下げる」の Alert メニューを出す (両導線・ユーザー判断)。
// 未定着なら従来どおり直接メモ作成。 どちらの導線も無ければ undefined (長押し無効 = 既存互換)。
// 取り下げは latch のリセット (マイナスを指差さず本人だけが取り下げる) なので destructive 表示。
const makeNodeLongPress = (
  nodeId: string,
  actionTitle: string,
  settled: boolean,
  onNoteLongPress?: (nodeId: string) => void,
  onRetractSettlement?: (nodeId: string) => void,
): (() => void) | undefined => {
  if (settled && onRetractSettlement) {
    return () => {
      const buttons: AlertButton[] = [];
      if (onNoteLongPress) {
        buttons.push({ text: 'メモを追加', onPress: () => onNoteLongPress(nodeId) });
      }
      buttons.push({
        text: '定着を取り下げる',
        style: 'destructive',
        onPress: () => onRetractSettlement(nodeId),
      });
      buttons.push({ text: 'キャンセル', style: 'cancel' });
      Alert.alert(
        actionTitle,
        '定着を取り下げると、 再び実行を積んで定着バーを満たすまで育成中に戻ります。',
        buttons,
      );
    };
  }
  if (onNoteLongPress) {
    return () => onNoteLongPress(nodeId);
  }
  return undefined;
};

export const ChainDetail = ({
  chain,
  anchor,
  nodes,
  achievements,
  onToggleNode,
  onNoteLongPress,
  anchorFiredToday = false,
  nodeIdsSettled,
  onRetractSettlement,
  onStartTimer,
  nodeRecentCells,
}: ChainDetailProps) => {
  const domainNodes = nodes.map((n) => n.node);
  // ADR-0047 追補 (2026-07-07): 定着ノードは Today で auto-✓ (タップ不要・達成レコード非書込)。
  // 表示上の達成 (effective) = 実レコード OR 定着 (latch)。 スパインの伸び・マーカーの塗り・
  // ✓ はこの effective 値で描く。 実タップ記録 (achievements) は書き換えない (K-002)。
  const effectiveAchievements: Record<string, boolean> = { ...achievements };
  for (const { node } of nodes) {
    if (nodeIdsSettled?.has(node.id)) effectiveAchievements[node.id] = true;
  }
  const lastAchievedIdx = lastAchievedNodeIndex(domainNodes, effectiveAchievements);
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
                achieved={effectiveAchievements[node.id] ?? false}
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
              achieved={effectiveAchievements[node.id] ?? false}
              settled={nodeIdsSettled?.has(node.id) ?? false}
              // 定着ノードは auto-✓ でタップ不要 → onPress を no-op に (K-002: レコード非書込)。
              onPress={() => {
                if (!nodeIdsSettled?.has(node.id)) onToggleNode(node.id);
              }}
              onLongPress={makeNodeLongPress(
                node.id,
                label,
                nodeIdsSettled?.has(node.id) ?? false,
                onNoteLongPress,
                onRetractSettlement,
              )}
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
  settled,
  onPress,
  onLongPress,
  timerSeconds,
  onStartTimer,
  recentCells,
}: {
  nodeId: string;
  actionTitle: string;
  achieved: boolean;
  settled: boolean;
  onPress: () => void;
  onLongPress?: () => void;
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

  // ADR-0047 追補 (2026-07-07): 定着ノードは auto-✓ でタップ不要。 タップは no-op にする
  // (達成レコードを書かない・K-002)。 長押しメニュー (メモ / 取り下げ) は引き続き有効。
  return (
    <View style={[styles.contentRow, styles.nodeRowContainer, { height: NODE_ROW_HEIGHT }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: achieved, disabled: settled }}
        accessibilityLabel={actionTitle}
        accessibilityHint={
          onLongPress
            ? settled
              ? '長押しでメニュー (メモを追加 / 定着を取り下げる)'
              : '長押しでメモを追加'
            : undefined
        }
        // Issue #190: 左の SVG ドット (cx=SPINE_X) を touchable 範囲に含める。
        hitSlop={{ left: NODE_HIT_SLOP_LEFT }}
        // Issue #188: 長押し中の押下フィードバック (= 長押しメモ動線の発見性向上)。
        // onLongPress が定義されているときのみ opacity を落として「押されている」ことを
        // 視覚化する。 機能が無いノードでフィードバックを出すと「何かある」と誤誘導するため、
        // onLongPress 未指定ならフィードバックも出さない。 Celebrate 主 / マイナスを指差さない
        // (DESIGN-SYSTEM §0) と整合するよう accent/red は使わず opacity のみで控えめに表現。
        style={({ pressed }) => [
          styles.nodePressArea,
          pressed && onLongPress ? styles.nodePressAreaPressed : null,
        ]}
      >
        <Animated.View style={[styles.nodeTextWrap, animatedStyle]}>
          <Text style={styles.nodeText}>{actionTitle}</Text>
        </Animated.View>
        {/* Issue #118: 定着済みノードはアクション名の右に小さく星を表示。
            #118 追補 (Taku 2026-06-16): 今日の達成状態に関わらず常に塗り (★) で
            表示する。 Issue #113 の「達成=★ / 未達=☆」塗り分けセマンティクスは
            撤回 (= マイナス側 (☆) を指差さない / Celebrate 主、 DESIGN-SYSTEM §0)。
            定着自体が祝福なので、 その日の達成状態で表現を薄めない。 */}
        {settled && (
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

// #125 / ADR-0038: アクション行右端に置く直近 7 日間の達成グリフマトリクス。
// ADR-0038 §決定 1「Today ChainDetail ノード行 = 7D」/ §決定 3「目的ごとの固定窓 (= 同じ
// 目的に複数窓を持たない)」の実装側エントリポイント。 横スクロールはしない (7 セル固定)。
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
  // Issue #188: 長押し中の押下フィードバック。 ノード全体を半透明にして
  // 「押されている」ことを伝える。 長押しメモ動線 (onNoteLongPress) の発見性向上が目的。
  nodePressAreaPressed: { opacity: 0.5 },
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
