import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalyticsScreen } from '../../src/AnalyticsScreen';
import { DateMatrixSection } from '../../src/DateMatrixSection';
import { DayDetailSection } from '../../src/DayDetailSection';
import { MetricKindsEditor } from '../../src/MetricKindsEditor';
import { SettingsLauncher } from '../../src/SettingsLauncher';
import { recentDateRange } from '../../src/domain';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useAnalyticsData } from '../../src/useAnalyticsData';
import { useDateMatrix } from '../../src/useDateMatrix';
import { useDayDetail } from '../../src/useDayDetail';
import { useMetricsData } from '../../src/useMetricsData';

// PR-Z2 (ADR-0024 §3b) + PR-Z3a (§3c) + PR-CC (ADR-0026): 分析タブ。
// - active チェーンの 14D 達成率カード (Z2)
// - メトリクス手入力セクション (Z3a、 任意入力)
// - メトリクス種別の編集モーダル (CC、 ADR-0026)
// 派生計算のみで動く (永続化は metrics + metric_kinds の観測値のみ、 ADR-0001 維持)。

export default function AnalyticsTab() {
  const { data, error, loading } = useAnalyticsData();
  const metrics = useMetricsData();
  // #115 (ADR-0037): 達成マトリクス (60 日窓)。 日選択は dayDetail と共有 (セルタップで日を選ぶ)。
  const matrix = useDateMatrix();
  // #63: 日々の詳細。全体 loading には含めない (日付切替で画面全体が再 loading しないため)。
  // #115: 単独のチップ列は廃止。 マトリクスのセルタップで selectDate し、 1 日詳細を下に出す。
  const dayDetail = useDayDetail();
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
          chains={data.chains}
          windowDays={data.windowDays}
          metricsSeries={metrics.data?.series}
          onAddMetric={metrics.addMetric}
          onEditKinds={() => setKindsEditorOpen(true)}
          metricsTrendDates={
            metrics.data
              ? recentDateRange(metrics.data.today, metrics.data.windowDays)
              : undefined
          }
          footer={
            <>
              <DateMatrixSection
                rows={matrix.rows}
                dates={matrix.dates}
                today={matrix.today}
                selectedDate={dayDetail.selectedDate}
                onSelectCell={dayDetail.selectDate}
              />
              <DayDetailSection
                dates={dayDetail.dates}
                selectedDate={dayDetail.selectedDate}
                today={dayDetail.today}
                detail={dayDetail.detail}
                onSelectDate={dayDetail.selectDate}
                showDateSelector={false}
              />
            </>
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
