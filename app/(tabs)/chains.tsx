import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChainListScreen } from '../../src/ChainListScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_GROW,
} from '../../src/tokens';
import { useChainListData } from '../../src/useChainListData';

export default function ChainsTab() {
  const { items, error, loading } = useChainListData();
  const router = useRouter();

  // チェーンカードタップ → 編集画面 (`/chain/[chainId]`)。
  // 起点アンカー編集は編集画面内の AnchorEditor (inline) で完結する
  // (旧 /anchor/[chainId] route は PR #20 で削除済、ADR-0014 経由)。
  const handleSelectChain = (chainId: string) => {
    router.push(`/chain/${chainId}`);
  };

  const handleCreateNew = () => {
    router.push('/chain/new');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.body}>
          <ChainListScreen items={items} onSelectChain={handleSelectChain} />
          <Pressable
            onPress={handleCreateNew}
            accessibilityRole="button"
            accessibilityLabel="チェーンを新規作成"
            style={styles.fab}
          >
            <Text style={styles.fabText}>+ 新規作成</Text>
          </Pressable>
        </View>
      )}
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
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  fabText: {
    color: COLOR_BG,
    fontSize: 14,
    fontWeight: '700',
  },
});
