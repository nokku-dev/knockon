import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MetricInputModal } from './MetricInputModal';
import type { MetricSeries } from './useMetricsData';
import {
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// PR-Z3a (ADR-0024 §3c): メトリクスセクション。 分析タブ内のチェーン達成率
// カードの下に表示する。 体重 / 運動 / 睡眠 の 3 種別を 3 行で並べる。
//
// UX:
// - 各行: ラベル + 最新値 (大きい数字) + 単位 + 14D 件数 + [+記録] ボタン
// - 14D 件数 = 何回記録があったか (= 「使ったか」の最低ライン可視化、 折れ線は Z3b で)
// - [+記録] でモーダルが開く (初期 kind = その行)
// - 未入力 (latest=null) なら大きい数字を「—」表示。 Celebrate 主の核 (= 「使っていない」
//   を責めない、 マイナス指差し UI なし)、 ANT 違反回避 (使わなくても困らない設計、
//   ADR-0024 構造的策)

export type MetricsSectionProps = {
  series: readonly MetricSeries[];
  onAddMetric: (metricKey: string, value: number) => Promise<void> | void;
  // PR-CC (ADR-0026): 「種別を編集」ボタンの動線。 未指定なら非表示 (発見性は親が制御)。
  onEditKinds?: () => void;
};

export const MetricsSection = ({
  series,
  onAddMetric,
  onEditKinds,
}: MetricsSectionProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<string | undefined>(undefined);

  const handleOpenModal = (metricKey: string) => {
    setInitialKind(metricKey);
    setModalOpen(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>メトリクス</Text>
        {onEditKinds && (
          <Pressable
            onPress={onEditKinds}
            accessibilityRole="button"
            accessibilityLabel="メトリクス種別を編集"
            style={styles.editKindsBtn}
          >
            <Text style={styles.editKindsBtnText}>種別を編集</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sectionSub}>
        任意の記録 (使わなくても困らない)。 種別はカスタマイズ可能 (ADR-0026)。
      </Text>
      {series.length === 0 && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>
            メトリクス種別がありません。「種別を編集」から追加してください。
          </Text>
        </View>
      )}
      {series.map((s) => (
        <View
          key={s.kind.key}
          style={styles.row}
          accessibilityLabel={`${s.kind.label} 最新値`}
        >
          <View style={styles.rowText}>
            <Text style={styles.label}>{s.kind.label}</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>
                {s.latest ? formatValue(s.latest.value) : '—'}
              </Text>
              <Text style={styles.unit}>{s.kind.unit}</Text>
            </View>
            <Text style={styles.meta}>
              14 日で {s.records14d.length} 件記録
            </Text>
          </View>
          <Pressable
            onPress={() => handleOpenModal(s.kind.key)}
            accessibilityRole="button"
            accessibilityLabel={`${s.kind.label} を記録`}
            style={styles.recordBtn}
          >
            <Text style={styles.recordText}>+ 記録</Text>
          </Pressable>
        </View>
      ))}
      <MetricInputModal
        open={modalOpen}
        kinds={series.map((s) => s.kind)}
        initialKind={initialKind}
        onCancel={() => setModalOpen(false)}
        onSubmit={async (key, value) => {
          await onAddMetric(key, value);
        }}
      />
    </View>
  );
};

// 体重などの小数 1 桁、 整数値ならそのまま整数表記。 表示時派生 (DB は数値そのまま保存)。
const formatValue = (v: number): string => {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
};

const styles = StyleSheet.create({
  root: {
    gap: 8,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionTitle: {
    color: COLOR_FG,
    fontSize: 18,
    fontWeight: '700',
  },
  editKindsBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  editKindsBtnText: {
    color: COLOR_FG_SOFT,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyRow: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
  },
  emptyText: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionSub: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    marginBottom: 8,
  },
  row: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
  },
  meta: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
  },
  recordBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR_GROW,
  },
  recordText: {
    color: COLOR_GROW,
    fontSize: 13,
    fontWeight: '700',
  },
});
