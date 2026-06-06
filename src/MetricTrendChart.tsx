import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { DailyMetricPoint } from './metricTrend';
import { COLOR_GROW, COLOR_LINE_BG } from './tokens';

// #110: メトリクス (体重 etc.) の日別遷移グラフ。 SVG 自作 (chart library 不使用、
// LineChart.tsx と同方針)。
//
// LineChart.tsx との違い:
// - y 軸: 値の min/max に動的スケール (体重 70-80kg のような実用レンジに自動 fit)
// - 0% / 50% / 100% ガイド線は無し (= 達成率ではないので意味を持たない)
// - 全点同値の場合は plot 中央の水平線になる (= 0 除算回避)
//
// 共通方針 (反 streak / Celebrate 主、 DESIGN-SYSTEM §0):
// - 警告色なし、 線は --grow、 軸の余白は --line-bg の細線で示すのみ
// - 値が null の日 (= 記録無し) は線を切る (LineChart の applicableNodes=0 と同じ
//   「ギャップを察してもらう」原則)

export type MetricTrendChartProps = {
  points: readonly DailyMetricPoint[];
  width?: number;
  height?: number;
};

const PADDING_X = 8;
const PADDING_Y = 6;

export const MetricTrendChart = ({
  points,
  width = 280,
  height = 48,
}: MetricTrendChartProps) => {
  // 描画可能な点 (value != null) が 2 件未満なら遷移として意味を持たないので非描画
  const validCount = points.filter((p) => p.value !== null).length;
  if (validCount < 2) return null;
  if (points.length === 0) return null;

  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const plotW = width - PADDING_X * 2;
  const plotH = height - PADDING_Y * 2;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  // 各点の (x, y) を計算。 value=null なら y=null (描画スキップ)。
  // 全点同値 (range=0) なら plot 中央に水平表示。
  const projected = points.map((p, i) => {
    const x = PADDING_X + i * stepX;
    if (p.value === null) return { x, y: null as number | null };
    const y =
      range === 0
        ? PADDING_Y + plotH / 2
        : PADDING_Y + (1 - (p.value - min) / range) * plotH;
    return { x, y };
  });

  // 折れ線 path: 連続する有効点だけ繋ぐ、 null 点で line を切る (LineChart と同じ手法)。
  let pathD = '';
  let inSegment = false;
  for (const pt of projected) {
    if (pt.y === null) {
      inSegment = false;
      continue;
    }
    if (!inSegment) {
      pathD += `M ${pt.x} ${pt.y} `;
      inSegment = true;
    } else {
      pathD += `L ${pt.x} ${pt.y} `;
    }
  }

  return (
    <View style={{ width, height }} testID="metric-trend-chart">
      <Svg width={width} height={height}>
        {/* 上下端の細線 (= 値域の上限 / 下限の暗示、 軸ラベルは持たない) */}
        <Line
          x1={PADDING_X}
          x2={width - PADDING_X}
          y1={PADDING_Y}
          y2={PADDING_Y}
          stroke={COLOR_LINE_BG}
          strokeWidth={0.5}
        />
        <Line
          x1={PADDING_X}
          x2={width - PADDING_X}
          y1={PADDING_Y + plotH}
          y2={PADDING_Y + plotH}
          stroke={COLOR_LINE_BG}
          strokeWidth={0.5}
        />
        {/* 折れ線 */}
        {pathD.length > 0 && (
          <Path
            d={pathD.trim()}
            stroke={COLOR_GROW}
            strokeWidth={2}
            fill="none"
          />
        )}
        {/* 各データ点 (記録無し日 = value=null は描画しない) */}
        {projected.map((pt, i) =>
          pt.y === null ? null : (
            <Circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill={COLOR_GROW} />
          ),
        )}
      </Svg>
    </View>
  );
};
