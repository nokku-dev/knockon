import { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DateMatrixCell, DateMatrixChainGroup } from './analyticsDerivation';
import type { IsoDate } from './domain';
import {
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
} from './tokens';

// #115 (ADR-0037): 分析タブの達成マトリクス。 縦 = チェーン/ノード、 横 = 日付 (過去 60 日)。
// 反 streak / Celebrate 主 (DESIGN-SYSTEM §0) を守るため、 セルは **塗り四角の二値**:
// - 達成 = COLOR_GROW で塗った四角 (■、 ここだけが目立つ = Celebrate 主)
// - 未達 (対象日) = 極淡のアウトライン四角 (□、 赤は使わない = マイナスを指差さない)
// - 休む日 (variant null) = 空セル (対象外なので何も置かない)
// 段階塗り率 (濃淡) も連続日数の数字/色強調も持たない。 左ラベル列は固定、 右の日付列のみ
// 横スクロール (初期位置 = 右端 = 最新日)。 セルタップで 1 日詳細を親が開く。

const CELL_SIZE = 16; // セル四角の一辺
const CELL_SLOT = 24; // 1 列の幅 (四角 + 左右余白)
const NODE_ROW_HEIGHT = 28;
const CHAIN_HEADER_HEIGHT = 30;
const DATE_HEADER_HEIGHT = 20;
const LABEL_WIDTH = 88; // 左固定ラベル列の幅
const WEEK = 7;

// 'YYYY-MM-DD' → 'M/D'
const monthDay = (date: IsoDate): string => {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
};

// 横軸ラベルは密集を避け、 今日 + 7 日ごと (右端基準) にだけ M/D を出す。
const headerLabel = (
  date: IsoDate,
  index: number,
  total: number,
  today: IsoDate | null,
): string => {
  if (date === today) return '今';
  return (total - 1 - index) % WEEK === 0 ? monthDay(date) : '';
};

const cellState = (cell: DateMatrixCell): '達成' | '休む日' | '未達' =>
  cell.achieved ? '達成' : cell.skipped ? '休む日' : '未達';

export type DateMatrixSectionProps = {
  rows: readonly DateMatrixChainGroup[];
  dates: readonly IsoDate[]; // 昇順 (最新が末尾)
  today: IsoDate | null;
  selectedDate?: IsoDate | null;
  onSelectCell: (date: IsoDate) => void;
};

export const DateMatrixSection = ({
  rows,
  dates,
  today,
  selectedDate,
  onSelectCell,
}: DateMatrixSectionProps) => {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>日々の記録</Text>

      {rows.length === 0 ? (
        <Text style={styles.empty}>
          アクティブなチェーンがありません。
        </Text>
      ) : (
        <View style={styles.matrixRow}>
          {/* 左: 固定ラベル列 (チェーン名 + ノード名)。 横スクロールしない。 */}
          <View style={{ width: LABEL_WIDTH }}>
            <View style={{ height: DATE_HEADER_HEIGHT }} />
            {rows.map((chain) => (
              <View key={chain.chainId}>
                <View style={styles.chainHeaderCell}>
                  <Text style={styles.chainTitle} numberOfLines={1}>
                    {chain.chainTitle}
                  </Text>
                </View>
                {chain.nodes.map((node) => (
                  <View key={node.nodeId} style={styles.labelCell}>
                    <Text style={styles.nodeLabel} numberOfLines={1}>
                      {node.label}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* 右: 日付列 (横スクロール、 初期位置 = 右端 = 最新)。 */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd?.({ animated: false })
            }
          >
            <View>
              {/* 日付ヘッダー (今日 + 7 日ごとに M/D)。 */}
              <View style={[styles.dateHeaderRow, { height: DATE_HEADER_HEIGHT }]}>
                {dates.map((date, i) => (
                  <View key={date} style={styles.slot}>
                    <Text
                      style={[
                        styles.dateLabel,
                        date === today && styles.dateLabelToday,
                      ]}
                    >
                      {headerLabel(date, i, dates.length, today)}
                    </Text>
                  </View>
                ))}
              </View>

              {rows.map((chain) => (
                <View key={chain.chainId}>
                  {/* チェーンヘッダー行ぶんのスペーサ (左の chainHeaderCell と高さを揃える)。 */}
                  <View style={{ height: CHAIN_HEADER_HEIGHT }} />
                  {chain.nodes.map((node) => (
                    <View key={node.nodeId} style={styles.cellRow}>
                      {node.cells.map((cell) => {
                        const selected = cell.date === selectedDate;
                        return (
                          <Pressable
                            key={cell.date}
                            onPress={() => onSelectCell(cell.date)}
                            accessibilityRole="button"
                            accessibilityLabel={`${node.label} ${monthDay(cell.date)} ${cellState(cell)}`}
                            style={styles.slot}
                          >
                            <View
                              style={[
                                styles.cell,
                                cell.achieved
                                  ? styles.cellAchieved
                                  : cell.skipped
                                    ? styles.cellSkip
                                    : styles.cellMiss,
                                selected && styles.cellSelected,
                              ]}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 10, paddingTop: 8 },
  sectionTitle: {
    color: COLOR_FG,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  empty: { color: COLOR_FG_FAINT, fontSize: 13, paddingHorizontal: 4 },
  matrixRow: { flexDirection: 'row' },
  chainHeaderCell: {
    height: CHAIN_HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingBottom: 4,
    paddingRight: 8,
  },
  chainTitle: { color: COLOR_FG, fontSize: 13, fontWeight: '700' },
  labelCell: {
    height: NODE_ROW_HEIGHT,
    justifyContent: 'center',
    paddingRight: 8,
  },
  nodeLabel: { color: COLOR_FG_SOFT, fontSize: 12 },
  dateHeaderRow: { flexDirection: 'row', alignItems: 'flex-end' },
  slot: {
    width: CELL_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    color: COLOR_FG_FAINT,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  dateLabelToday: { color: COLOR_GROW, fontWeight: '700' },
  cellRow: { flexDirection: 'row', height: NODE_ROW_HEIGHT, alignItems: 'center' },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
  },
  // 達成: 唯一の「塗り」。 ここだけ目立たせる (Celebrate 主)。
  cellAchieved: { backgroundColor: COLOR_GROW },
  // 未達 (対象日): 極淡のアウトラインのみ。 赤や濃色を使わない (マイナスを指差さない)。
  cellMiss: { borderWidth: 1, borderColor: COLOR_LINE_BG },
  // 休む日 (variant null): 対象外なので空セル (何も置かない)。
  cellSkip: {},
  // 選択中 (= 詳細を開いている日) の弱いリング。
  cellSelected: { borderWidth: 1, borderColor: COLOR_FG_FAINT },
});
