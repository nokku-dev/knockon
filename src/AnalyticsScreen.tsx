import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LineChart } from './LineChart';
import {
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';
import type { AnalyticsChainData } from './useAnalyticsData';

// PR-Z2 (ADR-0024 §3b): 達成率ダッシュボード画面。 active な全チェーンを
// カードで並べ、 各カードに「14D 達成率 (%) + 折れ線グラフ」を表示。
// streak / 警告色 / 赤い未達アラートは使わない (反 streak / Celebrate 主)。

export type AnalyticsScreenProps = {
  chains: readonly AnalyticsChainData[];
  windowDays: number;
};

export const AnalyticsScreen = ({
  chains,
  windowDays,
}: AnalyticsScreenProps) => (
  <ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.heading}>分析</Text>
    <Text style={styles.subheading}>過去 {windowDays} 日の達成率</Text>
    {chains.length === 0 ? (
      <Text style={styles.empty}>
        アクティブなチェーンがありません。 {'\n'}
        チェーンタブから新規作成すると、 ここに達成率と推移が表示されます。
      </Text>
    ) : (
      chains.map((c) => <AnalyticsChainCard key={c.chain.id} data={c} />)
    )}
  </ScrollView>
);

const AnalyticsChainCard = ({ data }: { data: AnalyticsChainData }) => {
  const { chain, anchor, nodeCount, stats, series } = data;
  const rate =
    stats.applicableDays === 0
      ? 0
      : Math.round((stats.achievedDays / stats.applicableDays) * 100);
  return (
    <View style={styles.card} accessibilityLabel={`${chain.title} ${rate}%`}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {chain.title}
        </Text>
        <Text style={styles.cardRate}>{rate}%</Text>
      </View>
      <Text style={styles.cardMeta}>
        {anchor.title} · {nodeCount} ノード · {stats.achievedDays} /{' '}
        {stats.applicableDays} 日
      </Text>
      <LineChart series={series} width={300} height={64} />
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
    marginBottom: 4,
  },
  subheading: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    marginBottom: 20,
  },
  empty: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: {
    color: COLOR_FG,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  cardRate: {
    color: COLOR_GROW,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
  },
});

