import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BundleModulePreview, BundlePreview } from './discovery';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// #70b (#70/#71 SPEC §4): 束プレビュー。完成形 (全モジュール) を見せつつ、
// スターターを前面・追加は折りたたみ (アコーディオン・同時1件・インライン)。
// 採用で入るのは既定で starter×defaultOn のみだが、全リンクをトグル可能にする
// (採用前トグル編集)。「これで進む」で採用確認へ。
export type BundlePreviewScreenProps = {
  preview: BundlePreview;
  selectedLinkIds: Set<string>;
  selectedCount: number;
  onToggleLink: (linkId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export const BundlePreviewScreen = ({
  preview,
  selectedLinkIds,
  selectedCount,
  onToggleLink,
  onBack,
  onNext,
}: BundlePreviewScreenProps) => {
  // アコーディオン: 追加モジュールは同時 1 件のみ展開。
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>戻る</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {preview.title}の束
        </Text>
        <View style={styles.topbarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* スターター — 前面・常時展開 */}
        {preview.starterModules.map((mp) => (
          <ModuleCard
            key={mp.module.id}
            preview={mp}
            selectedLinkIds={selectedLinkIds}
            onToggleLink={onToggleLink}
            expanded
          />
        ))}

        {/* 追加おすすめ — 折りたたみ・タップで展開 (同時 1 件) */}
        {preview.additionalModules.length > 0 && (
          <Text style={styles.additionalLabel}>追加できるモジュール</Text>
        )}
        {preview.additionalModules.map((mp) => (
          <ModuleCard
            key={mp.module.id}
            preview={mp}
            selectedLinkIds={selectedLinkIds}
            onToggleLink={onToggleLink}
            expanded={expandedModuleId === mp.module.id}
            onToggleExpand={() =>
              setExpandedModuleId((cur) =>
                cur === mp.module.id ? null : mp.module.id,
              )
            }
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="採用確認へ進む"
          disabled={selectedCount === 0}
          style={[styles.nextBtn, selectedCount === 0 && styles.nextBtnDisabled]}
        >
          <Text style={styles.nextBtnText}>
            {selectedCount} 個でチェーンを作る
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const ModuleCard = ({
  preview,
  selectedLinkIds,
  onToggleLink,
  expanded,
  onToggleExpand,
}: {
  preview: BundleModulePreview;
  selectedLinkIds: Set<string>;
  onToggleLink: (linkId: string) => void;
  expanded: boolean;
  onToggleExpand?: () => void;
}) => {
  const selectedInModule = preview.links.filter((l) =>
    selectedLinkIds.has(l.id),
  ).length;
  const collapsible = !!onToggleExpand;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggleExpand}
        disabled={!collapsible}
        accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel={
          collapsible
            ? `モジュール「${preview.module.name}」を${expanded ? '閉じる' : '開く'}`
            : undefined
        }
        style={styles.cardHeader}
      >
        {/* モジュール色ストライプ (a11y: 名前ラベル併用で色のみ依存を避ける、#74 で仕上げ) */}
        <View style={[styles.stripe, { backgroundColor: preview.module.color }]} />
        <Text style={styles.cardTitle}>{preview.module.name}</Text>
        <Text style={styles.cardCount}>
          {selectedInModule}/{preview.links.length}
        </Text>
        {collapsible && (
          <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
        )}
      </Pressable>

      {expanded &&
        preview.links.map((l) => {
          const checked = selectedLinkIds.has(l.id);
          return (
            <Pressable
              key={l.id}
              onPress={() => onToggleLink(l.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={l.title}
              style={styles.linkRow}
            >
              <Text style={[styles.marker, checked && styles.markerOn]}>
                {checked ? '●' : '○'}
              </Text>
              <Text style={[styles.linkTitle, !checked && styles.linkTitleOff]}>
                {l.title}
              </Text>
            </Pressable>
          );
        })}
    </View>
  );
};

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
  additionalLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  stripe: { width: 4, height: 20, borderRadius: 2 },
  cardTitle: { color: COLOR_FG, fontSize: 15, fontWeight: '700', flex: 1 },
  cardCount: { color: COLOR_FG_FAINT, fontSize: 12, fontVariant: ['tabular-nums'] },
  chevron: { color: COLOR_FG_SOFT, fontSize: 18, width: 20, textAlign: 'center' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingLeft: 14,
  },
  marker: { color: COLOR_FG_FAINT, fontSize: 14, width: 16, textAlign: 'center' },
  markerOn: { color: COLOR_GROW },
  linkTitle: { color: COLOR_FG, fontSize: 15 },
  linkTitleOff: { color: COLOR_FG_SOFT },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_LINE_BG,
  },
  nextBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
});
