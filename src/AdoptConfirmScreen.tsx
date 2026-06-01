import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// #70b (#70/#71 SPEC §4): 採用確認。position に基づき整列したチェーンをプレビュー。
// 採用時の並べ替えはさせない (自動整列のみ)。「これで始める」で live 化。
export type AdoptConfirmScreenProps = {
  title: string;
  actionTitles: string[]; // position 昇順
  adopting: boolean;
  onBack: () => void;
  onAdopt: () => void;
};

export const AdoptConfirmScreen = ({
  title,
  actionTitles,
  adopting,
  onBack,
  onAdopt,
}: AdoptConfirmScreenProps) => (
  <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.topbar}>
      <Pressable onPress={onBack} accessibilityRole="button" disabled={adopting}>
        <Text style={styles.back}>戻る</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        この内容で始める?
      </Text>
      <View style={styles.topbarSpacer} />
    </View>

    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.chainTitle}>{title}</Text>
      <View style={styles.card}>
        {actionTitles.map((t, i) => (
          <View key={`${i}-${t}`} style={styles.nodeRow}>
            <Text style={styles.nodeIndex}>{i + 1}</Text>
            <Text style={styles.nodeTitle}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>
        起点アンカーは「行動」で作成されます。時刻・場所への変更は採用後に編集できます。
      </Text>
    </ScrollView>

    <View style={styles.footer}>
      <Pressable
        onPress={onAdopt}
        accessibilityRole="button"
        accessibilityLabel="このチェーンで始める"
        disabled={adopting || actionTitles.length === 0}
        style={[
          styles.adoptBtn,
          (adopting || actionTitles.length === 0) && styles.adoptBtnDisabled,
        ]}
      >
        <Text style={styles.adoptBtnText}>
          {adopting ? '作成中…' : 'これで始める'}
        </Text>
      </Pressable>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  back: { color: COLOR_FG_SOFT, fontSize: 14 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  topbarSpacer: { width: 40 },
  body: { padding: 16, gap: 12 },
  chainTitle: { color: COLOR_FG, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  nodeIndex: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    width: 20,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  nodeTitle: { color: COLOR_FG, fontSize: 15 },
  hint: { color: COLOR_FG_FAINT, fontSize: 12, lineHeight: 18 },
  footer: { padding: 16, borderTopWidth: 0.5, borderTopColor: COLOR_LINE_BG },
  adoptBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  adoptBtnDisabled: { opacity: 0.4 },
  adoptBtnText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
});
