import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalyticsScreen } from '../../src/AnalyticsScreen';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useAnalyticsData } from '../../src/useAnalyticsData';
import { useMetricsData } from '../../src/useMetricsData';

// PR-Z2 (ADR-0024 §3b) + PR-Z3a (§3c): 分析タブ。
// - active チェーンの 14D 達成率カード (Z2)
// - メトリクス手入力セクション (Z3a、 任意入力)
// 派生計算のみで動く (永続化は metrics の観測値のみ、 ADR-0001 維持)。

export default function AnalyticsTab() {
  const { data, error, loading } = useAnalyticsData();
  const metrics = useMetricsData();

  // どちらかが loading なら全体 loading 表示 (簡略化、 体感問題なし)。
  const isLoading = loading || metrics.loading;
  const errorMessage = error ?? metrics.error;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : errorMessage ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : data ? (
        <AnalyticsScreen
          chains={data.chains}
          windowDays={data.windowDays}
          metricsSeries={metrics.data?.series}
          onAddMetric={metrics.addMetric}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
});
