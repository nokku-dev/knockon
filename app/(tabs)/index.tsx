import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsLauncher } from '../../src/SettingsLauncher';
import { TodayScreen } from '../../src/TodayScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
} from '../../src/tokens';
import { useTodayData } from '../../src/useTodayData';

export default function TodayTab() {
  const {
    data,
    error,
    loading,
    handleToggle,
    markNodeAchieved,
    dismissChecklist,
    retractSettlement,
  } = useTodayData();
  // ADR-0054: Today アクション長押しからのメモ作成を無効化した。
  // ADR-0049 で研究タブ (メモ一覧) を非表示にした結果「書けるが読めない」状態になり、
  // 長押しでメモが書けること自体が混乱の原因になっていた (実機確認でユーザー判断)。
  //
  // 非破壊: TodayScreen / ChainDetail は onAddNote が未指定なら長押しメモ動線と
  // NoteComposeModal を描画しないスイッチ式なので、**この prop を渡さないだけ**で無効化される。
  // notes データモデル・NoteComposeModal・ResearchScreen・useNotesData は残置。
  // 研究タブを再有効化するときは onAddNote={handleAddNote} を戻す 1 行で復帰できる
  // (ADR-0045 / 0049 の `href: null` と同型)。
  //
  // 定着ノードの長押しメニューは残る (ADR-0047 の「定着を取り下げる」)。長押し自体を
  // 殺したのではなく、メニューからメモの選択肢が消えて取り下げ専用になる。
  const router = useRouter();
  // 通知タップで遷移してきたときの chainId を URL params から拾う (PR-1.5b-3)。
  // TodayScreen に渡したらすぐ undefined に戻す (リロード等で再 open しないため)。
  const { openChainId } = useLocalSearchParams<{ openChainId?: string }>();
  const [initialOpen, setInitialOpen] = useState<string | null>(null);
  useEffect(() => {
    if (openChainId) {
      setInitialOpen(openChainId);
      router.setParams({ openChainId: undefined });
    }
  }, [openChainId, router]);
  // initialOpen を 1 tick 後に null に戻す (consume)。 TodayScreen の
  // useEffect + rAF が動き切る時間を確保した上で親の state をクリア。
  // これでタブ切替 → Today 再 focus 時に initialOpen=null になっているので
  // Sheet が誤って再 open しない (PR-1.5b-3 実機検証で観測した問題への対応)。
  useEffect(() => {
    if (!initialOpen) return;
    const timer = setTimeout(() => setInitialOpen(null), 300);
    return () => clearTimeout(timer);
  }, [initialOpen]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Issue #58: 各画面に設定への入口を置く。 Today にはタブ独自の header が
          無いので、 右上に最小限の topbar を追加して SettingsLauncher を載せる。 */}
      <View style={styles.topbar}>
        <SettingsLauncher />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !data || data.chains.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Today</Text>
          <Text style={styles.emptyBody}>
            まだチェーンがありません。「チェーン」タブから新規作成してください。
          </Text>
          <Pressable
            onPress={() => router.push('/chain/new')}
            accessibilityRole="button"
            accessibilityLabel="チェーンを新規作成"
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>+ チェーンを新規作成</Text>
          </Pressable>
        </View>
      ) : (
        <TodayScreen
          chains={data.chains}
          settledCount={data.settledCount}
          achievedBeforeToday={data.achievedBeforeToday}
          onToggleNode={handleToggle}
          initialOpenChainId={initialOpen}
          onEditChain={(chainId) => router.push(`/chain/${chainId}`)}
          onMarkNodeAchieved={markNodeAchieved}
          onboardingCompleted={data.onboardingCompleted}
          checklistDismissedAt={data.checklistDismissedAt}
          checklistAddedAction={data.checklistAddedAction}
          onDismissChecklist={dismissChecklist}
          onRetractSettlement={retractSettlement}
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
  topbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
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
  empty: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  emptyTitle: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  emptyBody: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  emptyBtnText: {
    color: COLOR_BG,
    fontSize: 14,
    fontWeight: '700',
  },
});
