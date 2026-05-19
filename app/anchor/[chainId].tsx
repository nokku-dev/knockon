import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnchorSettingsScreen } from '../../src/AnchorSettingsScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_SOFT,
  COLOR_SURFACE,
} from '../../src/tokens';
import { useAnchorSettings } from '../../src/useAnchorSettings';

export default function AnchorRoute() {
  const { chainId } = useLocalSearchParams<{ chainId: string }>();
  const router = useRouter();
  const {
    data,
    error,
    loading,
    saving,
    saveTimeAnchor,
    savePlaceAnchor,
    locationPermission,
    locating,
    fetchCurrentLocation,
  } = useAnchorSettings(chainId ?? '');

  const handleSaveTime = async (time: string) => {
    const ok = await saveTimeAnchor(time);
    if (ok) router.back();
    // ok=false ならエラーバナーを画面下部に表示してモーダルを閉じない (沈黙の
    // 失敗を避ける)。ユーザーは再試行できる。
  };

  const handleSavePlace = async (payload: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }) => {
    const ok = await savePlaceAnchor(payload);
    if (ok) router.back();
  };

  // 初期ロード失敗 (チェーン / アンカーが見つからない) はそのまま全画面エラー扱い。
  // 保存後エラーは AnchorSettingsScreen を保持したまま下部バナーで通知する。
  const isInitialLoadFailure = !loading && (!data || (!!error && !data));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : isInitialLoadFailure ? (
        <Text style={error ? styles.error : styles.soft}>
          {error ?? 'チェーンが見つかりません'}
        </Text>
      ) : data ? (
        <View style={styles.body}>
          <AnchorSettingsScreen
            chain={data.chain}
            anchor={data.anchor}
            saving={saving}
            locationPermission={locationPermission}
            locating={locating}
            onCancel={() => router.back()}
            onSaveTime={handleSaveTime}
            onSavePlace={handleSavePlace}
            onFetchLocation={fetchCurrentLocation}
          />
          {error && (
            <View style={styles.saveErrorBanner}>
              <Text style={styles.saveErrorText}>保存に失敗しました: {error}</Text>
            </View>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  body: {
    flex: 1,
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
  saveErrorBanner: {
    backgroundColor: COLOR_SURFACE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_ACCENT,
  },
  saveErrorText: {
    color: COLOR_ACCENT,
    fontSize: 12,
  },
});
