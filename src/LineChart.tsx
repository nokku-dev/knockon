import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { DailyChainPoint } from './analyticsDerivation';
import { COLOR_GROW, COLOR_LINE_BG } from './tokens';

// PR-Z2 (ADR-0024 §3b): 14D 達成率の折れ線グラフ。 SVG 自作 (chart library 不使用)。
// - X 軸: 14 日分 (左→右、 古い→新しい)
// - Y 軸: 達成率 (0.0 - 1.0)、 上端=100% 下端=0%
// - applicableNodes=0 (休む日 / variant null) の日: **何も描画しない** (line も dot もスキップ)。
//   理由: 「対象外日」を 0% ラインに dot で示すと「達成 0% の日」と視覚的に混同 ([K-016 派生
//   パターン] / Augmentation 原則「マイナスを指差さない」)。 線が途切れる = ユーザーに察してもらう。
// - 警告色 (赤) は使わない、 線は --grow、 軸は --line-bg、 背景なし
//   反 streak / Celebrate 主の核 (DESIGN-SYSTEM §0) を維持

export type LineChartProps = {
  series: readonly DailyChainPoint[];
  width?: number;
  height?: number;
};

const PADDING_X = 8;
const PADDING_Y = 8;

export const LineChart = ({
  series,
  width = 320,
  height = 80,
}: LineChartProps) => {
  if (series.length === 0) return null;
  const plotW = width - PADDING_X * 2;
  const plotH = height - PADDING_Y * 2;
  const stepX = series.length > 1 ? plotW / (series.length - 1) : 0;

  // 各点の (x, y) を計算。 applicableNodes=0 なら y は null (= 描画しない)。
  const points = series.map((p, i) => {
    const x = PADDING_X + i * stepX;
    if (p.applicableNodes === 0) return { x, y: null as number | null };
    const rate = p.achievedNodes / p.applicableNodes;
    const y = PADDING_Y + (1 - rate) * plotH;
    return { x, y };
  });

  // 折れ線: 連続する有効 (y != null) 点だけ繋ぐ、 null 点で line を切る。
  // SVG path は M で move、 L で line。
  let pathD = '';
  let inSegment = false;
  for (const pt of points) {
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
    <View style={{ width, height }} testID="line-chart">
      <Svg width={width} height={height}>
        {/* 軸 (0%, 50%, 100% の水平ガイド線) */}
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
          y1={PADDING_Y + plotH / 2}
          y2={PADDING_Y + plotH / 2}
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
        {/* 各データ点 (休む日 = applicableNodes=0 は描画しない、 line も切れる) */}
        {points.map((pt, i) =>
          pt.y === null ? null : (
            <Circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={2.5}
              fill={COLOR_GROW}
            />
          ),
        )}
      </Svg>
    </View>
  );
};
