import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalyticsScreen } from '../../src/AnalyticsScreen';
import { MetricKindsEditor } from '../../src/MetricKindsEditor';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useAnalyticsData } from '../../src/useAnalyticsData';
import { useMetricsData } from '../../src/useMetricsData';

// PR-Z2 (ADR-0024 §3b) + PR-Z3a (§3c) + PR-CC (ADR-0026): 分析タブ。
// - active チェーンの 14D 達成率カード (Z2)
// - メトリクス手入力セクション (Z3a、 任意入力)
// - メトリクス種別の編集モーダル (CC、 ADR-0026)
// 派生計算のみで動く (永続化は metrics + metric_kinds の観測値のみ、 ADR-0001 維持)。

export default function AnalyticsTab() {
  const { data, error, loading } = useAnalyticsData();
  const metrics = useMetricsData();
  const [kindsEditorOpen, setKindsEditorOpen] = useState(false);

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
          onEditKinds={() => setKindsEditorOpen(true)}
        />
      ) : null}
      <MetricKindsEditor
        open={kindsEditorOpen}
        kinds={metrics.data?.series.map((s) => s.kind) ?? []}
        onClose={() => setKindsEditorOpen(false)}
        onAdd={metrics.addKind}
        onUpdate={metrics.updateKind}
        onDelete={metrics.removeKind}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
});
