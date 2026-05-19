import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TodayScreen } from '../../src/TodayScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_SOFT,
} from '../../src/tokens';
import { useTodayData } from '../../src/useTodayData';

export default function TodayTab() {
  const { data, error, loading, handleToggle } = useTodayData();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !data ? (
        <Text style={styles.soft}>チェーンがありません</Text>
      ) : (
        <TodayScreen
          chain={data.chain}
          anchor={data.anchor}
          nodes={data.nodes}
          achievements={data.achievements}
          onToggleNode={handleToggle}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    color: COLOR_ACCENT,
    padding: 24,
  },
  soft: {
    color: COLOR_FG_SOFT,
    padding: 24,
  },
});
