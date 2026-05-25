import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalyticsScreen } from '../../src/AnalyticsScreen';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useAnalyticsData } from '../../src/useAnalyticsData';

// PR-Z2 (ADR-0024 §3b): 分析タブ。 active な全チェーンの 14D 達成率を
// カード一覧で表示。 派生計算のみで動く (永続化なし、 ADR-0001 維持)。

export default function AnalyticsTab() {
  const { data, error, loading } = useAnalyticsData();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : data ? (
        <AnalyticsScreen chains={data.chains} windowDays={data.windowDays} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
});
