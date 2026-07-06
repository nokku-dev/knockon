import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalyticsScreen } from '../../src/AnalyticsScreen';
import { DateMatrixSection } from '../../src/DateMatrixSection';
import { MetricKindsEditor } from '../../src/MetricKindsEditor';
import { SettingsLauncher } from '../../src/SettingsLauncher';
import { recentDateRange } from '../../src/domain';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useAnalyticsData } from '../../src/useAnalyticsData';
import { useDateMatrix } from '../../src/useDateMatrix';
import { useMetricsData } from '../../src/useMetricsData';

// ADR-0047: ログタブ = 定着ポートフォリオ。
// - active チェーンのノードを「これから / 育成中 / 定着」でグルーピング表示 (率グラフは撤去)
// - メトリクス手入力セクション (Z3a、 任意入力) / 種別編集モーダル (CC、 ADR-0026)
// - 60D 達成マトリクス (footer、 #115 / ADR-0037) は存置
// 派生計算のみで動く (永続化は metrics + metric_kinds + 定着取り下げの観測値のみ、 ADR-0001 維持)。

export default function AnalyticsTab() {
  // 定着ポートフォリオ + 「定着を取り下げる」(自前の楽観更新 retract を持つ。 Today の重い
  // load を巻き込まないためログ側で完結させる)。
  const { data, error, loading, retract } = useAnalyticsData();
  const metrics = useMetricsData();
  // #115 (ADR-0037): 達成マトリクス (60 日窓)。 ノード × 日付の俯瞰を表示専用で出す。
  // #128: 旧「日々の詳細」(チップ列 + 1 日スナップショット) はマトリクスと重複するため廃止。
  const matrix = useDateMatrix();
  const [kindsEditorOpen, setKindsEditorOpen] = useState(false);

  // どちらかが loading なら全体 loading 表示 (簡略化、 体感問題なし)。
  const isLoading = loading || metrics.loading;
  const errorMessage = error ?? metrics.error;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Issue #58: 各画面に設定への入口を置く (chains tab と同じ位置感)。 */}
      <View style={styles.topbar}>
        <SettingsLauncher />
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : errorMessage ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : data ? (
        <AnalyticsScreen
          today={data.today}
          counts={data.counts}
          nodes={data.nodes}
          onRetractSettlement={(_chainId, nodeId) => retract(nodeId)}
          metricsSeries={metrics.data?.series}
          onAddMetric={metrics.addMetric}
          onEditKinds={() => setKindsEditorOpen(true)}
          metricsTrendDates={
            metrics.data
              ? recentDateRange(metrics.data.today, metrics.data.windowDays)
              : undefined
          }
          footer={
            <DateMatrixSection
              rows={matrix.rows}
              dates={matrix.dates}
              today={matrix.today}
            />
          }
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
  topbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
});
