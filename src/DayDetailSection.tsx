import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getWeekdayKey } from './domain';
import type { IsoDate, WeekdayKey } from './domain';
import type { DayDetail } from './useDayDetail';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// #63: 分析タブの「日々の詳細」セクション。日付チップ列 (横 1 行・格子ではない) で日を選び、
// その日の各チェーンのノード達成スナップショット + メトリクスを表示する。
// 集計 (達成率) ではなく「その日に何が起きたか」。streak は出さず、未達は淡色 (赤にしない)。

export type DayDetailSectionProps = {
  dates: readonly IsoDate[]; // 昇順 14D
  selectedDate: IsoDate | null;
  today: IsoDate | null;
  detail: DayDetail | null;
  onSelectDate: (date: IsoDate) => void;
  // #115 (ADR-0037): 達成マトリクスからセルタップで開くときは false。 日付選択チップ列を
  // 隠し、 選択日の見出しだけ出す (日選択はマトリクス側が担う)。 既定 true (単独利用時)。
  showDateSelector?: boolean;
};

const WEEKDAY_JP: Record<WeekdayKey, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

// 'YYYY-MM-DD' → 'M/D'
const monthDay = (date: IsoDate): string => {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export const DayDetailSection = ({
  dates,
  selectedDate,
  today,
  detail,
  onSelectDate,
  showDateSelector = true,
}: DayDetailSectionProps) => (
  <View style={styles.root}>
    {showDateSelector ? (
      <Text style={styles.sectionTitle}>日々の記録</Text>
    ) : (
      selectedDate && (
        <Text style={styles.sectionTitle}>
          {monthDay(selectedDate)} ({WEEKDAY_JP[getWeekdayKey(selectedDate)]})
          {selectedDate === today ? ' · 今日' : ''} の記録
        </Text>
      )
    )}

    {/* 日付チップ列 (横 1 行・最新が右)。格子/ヒートマップではない単純なセレクタ。
        #115: マトリクスからの 1 日詳細では日選択はマトリクス側が担うため非表示。 */}
    {showDateSelector && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateRow}
      >
        {dates.map((date) => {
          const selected = date === selectedDate;
          const isToday = date === today;
          return (
            <Pressable
              key={date}
              onPress={() => onSelectDate(date)}
              accessibilityRole="button"
              accessibilityLabel={`${monthDay(date)} の記録を見る`}
              accessibilityState={{ selected }}
              style={[styles.dateChip, selected && styles.dateChipSelected]}
            >
              <Text
                style={[styles.dateWeekday, selected && styles.dateTextSelected]}
              >
                {isToday ? '今日' : WEEKDAY_JP[getWeekdayKey(date)]}
              </Text>
              <Text style={[styles.dateMd, selected && styles.dateTextSelected]}>
                {monthDay(date)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    )}

    {detail && detail.chains.length === 0 && (
      <Text style={styles.empty}>この日のチェーンはありません</Text>
    )}

    {detail?.chains.map((chain) => (
      <View key={chain.chainId} style={styles.chainCard}>
        <View style={styles.chainHeader}>
          <Text style={styles.chainTitle} numberOfLines={1}>
            {chain.chainTitle}
          </Text>
          {chain.anchorFired && (
            <View style={styles.firedPill} accessibilityLabel="発火済み">
              <Text style={styles.firedPillText}>発火</Text>
            </View>
          )}
        </View>
        {chain.nodes.map((n) => {
          const glyph = n.skipped ? '—' : n.achieved ? '✓' : '○';
          const a11y = n.skipped
            ? `${n.label} は休む日`
            : n.achieved
              ? `${n.label} 達成`
              : `${n.label} 未達`;
          return (
            <View key={n.nodeId} style={styles.nodeRow} accessibilityLabel={a11y}>
              <Text
                style={[
                  styles.nodeGlyph,
                  n.achieved && !n.skipped && styles.nodeGlyphAchieved,
                ]}
              >
                {glyph}
              </Text>
              <Text
                style={[
                  styles.nodeLabel,
                  (n.skipped || !n.achieved) && styles.nodeLabelMuted,
                ]}
              >
                {n.label}
              </Text>
            </View>
          );
        })}
      </View>
    ))}

    {detail && detail.metrics.length > 0 && (
      <View style={styles.metricsCard}>
        <Text style={styles.metricsLabel}>この日のメトリクス</Text>
        {detail.metrics.map((m) => (
          <View key={`${m.key}-${m.value}`} style={styles.metricRow}>
            <Text style={styles.metricName}>{m.label}</Text>
            <Text style={styles.metricValue}>
              {m.value}
              {m.unit ? ` ${m.unit}` : ''}
            </Text>
          </View>
        ))}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  root: { gap: 10, paddingTop: 8 },
  sectionTitle: {
    color: COLOR_FG,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  dateRow: { gap: 8, paddingHorizontal: 4, paddingVertical: 4 },
  dateChip: {
    minWidth: 48,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: COLOR_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dateChipSelected: { backgroundColor: COLOR_GROW },
  dateWeekday: { color: COLOR_FG_SOFT, fontSize: 11, fontWeight: '600' },
  dateMd: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dateTextSelected: { color: COLOR_BG },
  empty: { color: COLOR_FG_FAINT, fontSize: 13, paddingHorizontal: 4 },
  chainCard: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  chainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chainTitle: { color: COLOR_FG, fontSize: 15, fontWeight: '700', flex: 1 },
  firedPill: {
    backgroundColor: COLOR_LINE_BG,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  firedPillText: { color: COLOR_FG_SOFT, fontSize: 10, fontWeight: '700' },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nodeGlyph: {
    color: COLOR_FG_FAINT,
    fontSize: 15,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  nodeGlyphAchieved: { color: COLOR_GROW },
  nodeLabel: { color: COLOR_FG, fontSize: 14, flex: 1 },
  nodeLabelMuted: { color: COLOR_FG_SOFT },
  metricsCard: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  metricsLabel: { color: COLOR_FG_SOFT, fontSize: 12, fontWeight: '600' },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricName: { color: COLOR_FG, fontSize: 14 },
  metricValue: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
