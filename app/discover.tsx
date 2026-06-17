import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AdoptConfirmScreen } from '../src/AdoptConfirmScreen';
import { BundlePreviewScreen } from '../src/BundlePreviewScreen';
import { DiscoveryIndexScreen } from '../src/DiscoveryIndexScreen';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';
import { useDiscovery } from '../src/useDiscovery';

// #70b (#70/#71): discovery フロー (索引 → 束プレビュー → 採用確認)。
// 状態は useDiscovery が保持し、ステップは door 有無 + confirming で導出する。
export default function DiscoverRoute() {
  const router = useRouter();
  const {
    loading,
    error,
    recommendedCategories,
    genreCategories,
    door,
    preview,
    selectedKeys,
    selectedCount,
    openCategory,
    closeCategory,
    toggleItem,
    selectedActionTitles,
    adopt,
    adopting,
  } = useDiscovery();

  const [confirming, setConfirming] = useState(false);

  const handleAdopt = async () => {
    // 現地時刻 ISO を採用時刻にする (createdAt)。発火判定はリセット時刻基準で別途派生。
    const now = new Date().toISOString();
    const chainId = await adopt(now);
    if (chainId) {
      // 採用後はフローを抜けてチェーン一覧へ戻る (作成したチェーンは active で並ぶ)。
      router.back();
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error && !door ? (
        <Text style={styles.error}>{error}</Text>
      ) : !door || !preview ? (
        <DiscoveryIndexScreen
          recommendedCategories={recommendedCategories}
          genreCategories={genreCategories}
          onOpenCategory={openCategory}
          onCancel={() => router.back()}
        />
      ) : !confirming ? (
        <BundlePreviewScreen
          preview={preview}
          selectedKeys={selectedKeys}
          selectedCount={selectedCount}
          onToggleItem={toggleItem}
          onBack={closeCategory}
          onNext={() => setConfirming(true)}
        />
      ) : (
        <AdoptConfirmScreen
          title={preview.category.name}
          actionTitles={selectedActionTitles}
          adopting={adopting}
          onBack={() => setConfirming(false)}
          onAdopt={handleAdopt}
        />
      )}
      {error && door ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
  banner: {
    backgroundColor: COLOR_BG,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_ACCENT,
  },
  bannerText: { color: COLOR_ACCENT, fontSize: 12 },
});
