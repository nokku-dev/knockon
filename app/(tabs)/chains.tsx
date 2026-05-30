import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChainListScreen } from '../../src/ChainListScreen';
import { SettingsModal } from '../../src/SettingsModal';
import type { ChainStatus } from '../../src/domain';
import { DEFAULT_RESET_TIME } from '../../src/settingsRepository';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_GROW,
  COLOR_LINE_BG,
} from '../../src/tokens';
import { useChainListData } from '../../src/useChainListData';
import { useSettings } from '../../src/useSettings';

export default function ChainsTab() {
  const [status, setStatus] = useState<ChainStatus>('active');
  const { items, activeCount, stockedCount, error, loading } =
    useChainListData(status);
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <View style={styles.statusTabs}>
        <Pressable
          onPress={() => setStatus('active')}
          accessibilityRole="button"
          accessibilityLabel="アクティブなチェーン"
          accessibilityState={{ selected: status === 'active' }}
          style={[styles.statusTab, status === 'active' && styles.statusTabActive]}
        >
          <Text
            style={[
              styles.statusTabText,
              status === 'active' && styles.statusTabTextActive,
            ]}
          >
            アクティブ ({activeCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setStatus('stocked')}
          accessibilityRole="button"
          accessibilityLabel="休止中のチェーン"
          accessibilityState={{ selected: status === 'stocked' }}
          style={[styles.statusTab, status === 'stocked' && styles.statusTabActive]}
        >
          <Text
            style={[
              styles.statusTabText,
              status === 'stocked' && styles.statusTabTextActive,
            ]}
          >
            休止中 ({stockedCount})
          </Text>
        </Pressable>
        <View style={styles.statusTabsSpacer} />
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="設定を開く"
          style={styles.settingsBtn}
        >
          <Ionicons name="settings-outline" size={20} color={COLOR_FG} />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.body}>
          <ChainListScreen items={items} onSelectChain={handleSelectChain} />
          {status === 'active' && (
            <Pressable
              onPress={handleCreateNew}
              accessibilityRole="button"
              accessibilityLabel="チェーンを新規作成"
              style={styles.fab}
            >
              <Text style={styles.fabText}>+ 新規作成</Text>
            </Pressable>
          )}
        </View>
      )}
      <SettingsModal
        open={settingsOpen}
        resetTime={settings.settings?.resetTime ?? DEFAULT_RESET_TIME}
        onClose={() => setSettingsOpen(false)}
        onSave={settings.updateResetTime}
      />
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
  statusTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  statusTabsSpacer: { flex: 1 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  statusTabActive: {
    backgroundColor: COLOR_FG,
  },
  statusTabText: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    fontWeight: '600',
  },
  statusTabTextActive: {
    color: COLOR_BG,
  },
});
