import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MetricsSection } from './MetricsSection';
import {
  COLOR_ACCENT,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_LINE_BG,
  COLOR_STAR,
  COLOR_SURFACE,
} from './tokens';
import type {
  IsoDate,
  SettlementStage,
  SettlementStageCounts,
  SettlementStageMovements,
} from './domain';
import type { SettlementPortfolioNode } from './useAnalyticsData';
import type { MetricSeries } from './useMetricsData';

// ADR-0047: ログ画面 = 定着ポートフォリオ。 達成率ダッシュボード (= 比率・ADR-0036 の (−)
// 禁則) から組み替え。 上部に「定着 N・育成中 M」カウント (単調増加の Celebrate 主役)、
// 本体はステージ別 (定着 / 育成中 / これから) グルーピング一覧で「どれが定着・どれが未定着か」
// を見せる。 達成率グラフは撤去。 メトリクス節 (身体指標) は別軸で存置。

export type AnalyticsScreenProps = {
  today: IsoDate;
  counts: SettlementStageCounts;
  // ADR-0047 追補: 先週から「定着」「もう少しで定着」へ新たに入った個数 (流入・Celebrate)。
  movements?: SettlementStageMovements;
  nodes: readonly SettlementPortfolioNode[];
  metricsSeries?: readonly MetricSeries[];
  onAddMetric?: (metricKey: string, value: number) => Promise<void> | void;
  // PR-CC (ADR-0026): 「種別を編集」ボタン押下動線。 未指定なら非表示。
  onEditKinds?: () => void;
  // #110: メトリクス日別遷移グラフの x 軸日付配列 (14D)。
  metricsTrendDates?: readonly IsoDate[];
  // ADR-0047: 定着ノードの「定着を取り下げる」導線 (Today 長押しメニューと併置・両導線)。
  onRetractSettlement?: (chainId: string, nodeId: string) => void;
  // 末尾に差し込む追加セクション (60D マトリクス)。同じ ScrollView 内に置く。
  footer?: ReactNode;
};

// 表示順: 定着 (Celebrate) を先頭に、 もう少しで定着、 育成中、 これから。 これから (未着手)
// は指差さないトーンで最後に静かに置く (Celebrate 主 / マイナスを指差さない)。
const STAGE_ORDER: readonly SettlementStage[] = [
  'settled',
  'almost',
  'growing',
  'fresh',
];
const STAGE_LABEL: Record<SettlementStage, string> = {
  settled: '定着',
  almost: 'もう少しで定着',
  growing: '育成中',
  fresh: 'これから',
};

export const AnalyticsScreen = ({
  today: _today,
  counts,
  movements,
  nodes,
  metricsSeries,
  onAddMetric,
  onEditKinds,
  metricsTrendDates,
  onRetractSettlement,
  footer,
}: AnalyticsScreenProps) => {
  // ステージ群は開閉可能 (数が増えても畳める・ユーザー判断)。 初期は全グループ畳む
  // (= 見出し + 件数だけ並ぶコンパクト表示、 見たいステージをタップで開く)。 開閉状態は
  // ローカル state (= app config でも観測データでもない一時的 UI 状態、 永続化しない)。
  const [collapsed, setCollapsed] = useState<Record<SettlementStage, boolean>>({
    settled: true,
    almost: true,
    growing: true,
    fresh: true,
  });
  const toggle = (stage: SettlementStage) =>
    setCollapsed((c) => ({ ...c, [stage]: !c[stage] }));

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>ログ</Text>
      {/* 定着 N・もう少しで定着 P・育成中 M カウント (クロス断面スナップショット・Celebrate
          主役)。 これから (fresh) はカウントに出さない = 未着手を数字で指差さない。 */}
      <Text
        style={styles.counts}
        accessibilityLabel={`定着 ${counts.settled}・もう少しで定着 ${counts.almost}・育成中 ${counts.growing}`}
      >
        <Text style={styles.countSettled}>定着 {counts.settled}</Text>
        <Text style={styles.countSep}>・</Text>
        <Text style={styles.countAlmost}>もう少しで定着 {counts.almost}</Text>
        <Text style={styles.countSep}>・</Text>
        <Text style={styles.countGrowing}>育成中 {counts.growing}</Text>
      </Text>

      {/* ADR-0047 追補: 先週からの流入 (= 上方向に移動した個数・Celebrate フロー)。 増減では
          なく「今週入った数」だけ。 動きが無い週は出さない (0 を指差さない / 静かに保つ)。 */}
      {movements && (movements.intoSettled > 0 || movements.intoAlmost > 0) && (
        <Text
          style={styles.movement}
          accessibilityLabel={`今週 定着入り ${movements.intoSettled}・もう少しで定着入り ${movements.intoAlmost}`}
        >
          今週{' '}
          {movements.intoSettled > 0 && (
            <Text style={styles.movementSettled}>
              定着入り +{movements.intoSettled}
            </Text>
          )}
          {movements.intoSettled > 0 && movements.intoAlmost > 0 && (
            <Text style={styles.countSep}>・</Text>
          )}
          {movements.intoAlmost > 0 && (
            <Text style={styles.movementAlmost}>
              もう少しで定着入り +{movements.intoAlmost}
            </Text>
          )}
        </Text>
      )}

      {nodes.length === 0 ? (
        <Text style={styles.empty}>
          まだ定着ポートフォリオに載るノードがありません。 {'\n'}
          チェーンタブでアクションを作り、 Today で積み上げていくと、 {'\n'}
          ここに「これから / 育成中 / 定着」が並びます。
        </Text>
      ) : (
        STAGE_ORDER.map((stage) => {
          const group = nodes.filter((n) => n.stage === stage);
          if (group.length === 0) return null;
          const isCollapsed = collapsed[stage];
          return (
            <View key={stage} style={styles.group}>
              <Pressable
                testID={`portfolio-group-${stage}`}
                onPress={() => toggle(stage)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !isCollapsed }}
                accessibilityLabel={`${STAGE_LABEL[stage]} ${group.length} 件`}
                style={styles.groupHeadRow}
              >
                <Text style={styles.groupChevron}>
                  {isCollapsed ? '▸' : '▾'}
                </Text>
                <Text style={styles.groupHead}>{STAGE_LABEL[stage]}</Text>
                <Text style={styles.groupCount}>{group.length}</Text>
              </Pressable>
              {!isCollapsed &&
                group.map((n) => (
                  <PortfolioNodeRow
                    key={`${n.chainId}:${n.nodeId}`}
                    node={n}
                    onRetractSettlement={onRetractSettlement}
                  />
                ))}
            </View>
          );
        })
      )}

      {metricsSeries && onAddMetric && (
        <MetricsSection
          series={metricsSeries}
          onAddMetric={onAddMetric}
          onEditKinds={onEditKinds}
          trendDates={metricsTrendDates}
        />
      )}
      {footer}
    </ScrollView>
  );
};

const PortfolioNodeRow = ({
  node,
  onRetractSettlement,
}: {
  node: SettlementPortfolioNode;
  onRetractSettlement?: (chainId: string, nodeId: string) => void;
}) => {
  const settled = node.stage === 'settled';
  const confirmRetract = () => {
    Alert.alert(
      node.actionTitle,
      '定着を取り下げると、 再び実行を積んで定着バーを満たすまで育成中に戻ります。',
      [
        {
          text: '定着を取り下げる',
          style: 'destructive',
          onPress: () => onRetractSettlement?.(node.chainId, node.nodeId),
        },
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  };
  return (
    <View style={styles.nodeRow}>
      <View style={styles.nodeMain}>
        <Text style={styles.nodeTitle} numberOfLines={1}>
          {node.actionTitle}
        </Text>
        <Text style={styles.nodeChain} numberOfLines={1}>
          {node.chainTitle}
        </Text>
      </View>
      {settled && <Text style={styles.nodeStar}>★</Text>}
      {settled && onRetractSettlement && (
        <Pressable
          onPress={confirmRetract}
          accessibilityRole="button"
          accessibilityLabel={`${node.actionTitle} の定着を取り下げる`}
          style={styles.retractBtn}
        >
          <Text style={styles.retractBtnText}>取り下げ</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 64 },
  heading: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  counts: {
    marginBottom: 6,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  countSettled: { color: COLOR_STAR, fontWeight: '700' },
  countSep: { color: COLOR_FG_FAINT },
  countAlmost: { color: COLOR_FG, fontWeight: '700' },
  countGrowing: { color: COLOR_FG_SOFT, fontWeight: '700' },
  movement: {
    marginBottom: 24,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: COLOR_FG_FAINT,
  },
  movementSettled: { color: COLOR_STAR },
  movementAlmost: { color: COLOR_FG_SOFT },
  empty: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
    lineHeight: 22,
  },
  group: { marginBottom: 20 },
  groupHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  groupChevron: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    width: 14,
  },
  groupHead: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '700',
  },
  groupCount: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  nodeRow: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nodeMain: { flex: 1 },
  nodeTitle: {
    color: COLOR_FG,
    fontSize: 15,
    fontWeight: '600',
  },
  nodeChain: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    marginTop: 2,
  },
  nodeStar: {
    color: COLOR_STAR,
    fontSize: 15,
  },
  // 取り下げは destructive: 文字色のみ accent、 背景は LINE_BG に抑える
  // (DESIGN-SYSTEM §1 の destructive action ルール / マイナスを派手にしない)。
  retractBtn: {
    backgroundColor: COLOR_LINE_BG,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  retractBtnText: {
    color: COLOR_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
});
