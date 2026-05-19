import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnchorSettingsScreen } from '../../src/AnchorSettingsScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_SOFT,
} from '../../src/tokens';
import { useAnchorSettings } from '../../src/useAnchorSettings';

export default function AnchorRoute() {
  const { chainId } = useLocalSearchParams<{ chainId: string }>();
  const router = useRouter();
  const { data, error, loading, saving, saveTimeAnchor } = useAnchorSettings(
    chainId ?? '',
  );

  const handleSave = async (time: string) => {
    await saveTimeAnchor(time);
    router.back();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !data ? (
        <Text style={styles.soft}>チェーンが見つかりません</Text>
      ) : (
        <AnchorSettingsScreen
          chain={data.chain}
          anchor={data.anchor}
          saving={saving}
          onCancel={() => router.back()}
          onSave={handleSave}
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
