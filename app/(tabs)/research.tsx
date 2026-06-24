import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResearchScreen } from '../../src/ResearchScreen';
import { SettingsLauncher } from '../../src/SettingsLauncher';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../../src/tokens';
import { useNotesData } from '../../src/useNotesData';

// #175 (PR-A): 研究タブ。 ADR-0044 (#181): 自動検出 (インサイト) は未実装なので、
// 当面はユーザーの手動メモ一覧 + FAB を出す。 データ取得は useNotesData に集約。

export default function ResearchTab() {
  const { data, error, loading, addNote, editNote, removeNote } = useNotesData();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Issue #58: 各画面に設定への入口を置く (他タブと同じ位置感)。 */}
      <View style={styles.topbar}>
        <SettingsLauncher />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ResearchScreen
          notes={data?.notes ?? []}
          chainOptions={data?.chainOptions ?? []}
          onAddNote={addNote}
          onEditNote={editNote}
          onDeleteNote={removeNote}
        />
      )}
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
