import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import type {
  AchievementMap,
  Action,
  Anchor,
  Chain,
  Node,
} from './domain';
import { lastAchievedNodeIndex } from './domain';

export type TodayNode = { node: Node; action: Action };

export type TodayScreenProps = {
  chain: Chain;
  anchor: Anchor;
  nodes: readonly TodayNode[];
  achievements: AchievementMap;
  onToggleNode: (nodeId: string) => void;
};

const SPINE_X = 9;
const SPINE_COLUMN_WIDTH = 28;
const ANCHOR_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 44;
const MARKER_RADIUS = 7;
const ANCHOR_DOT_RADIUS = 4;
const SPINE_STROKE = 2;

const COLOR_GROW = '#EAEAE8';
const COLOR_LINE_BG = '#2A2A32';
const COLOR_BG = '#16161A';
const COLOR_FAINT = '#5A5A60';

export const TodayScreen = ({
  chain,
  anchor,
  nodes,
  achievements,
  onToggleNode,
}: TodayScreenProps) => {
  const domainNodes = nodes.map((n) => n.node);
  const lastAchievedIdx = lastAchievedNodeIndex(domainNodes, achievements);
  const anchorCenterY = ANCHOR_ROW_HEIGHT / 2;
  const nodeMarkerCenterY = (idx: number) =>
    ANCHOR_ROW_HEIGHT + idx * NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2;
  const lastNodeY =
    nodes.length > 0 ? nodeMarkerCenterY(nodes.length - 1) : anchorCenterY;
  // ADR-0010: 達成済みノード範囲モデル — 線は anchor → 最後に達成済みのノード
  // まで --grow。途中に未達ノードがあっても、両端が達成済みなら線は繋がる扱い。
  const filledEndY =
    lastAchievedIdx < 0 ? anchorCenterY : nodeMarkerCenterY(lastAchievedIdx);

  const svgHeight = ANCHOR_ROW_HEIGHT + nodes.length * NODE_ROW_HEIGHT;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Today</Text>
      <Text style={styles.anchorText}>{anchor.title}</Text>
      <Text style={styles.chainTitle}>{chain.title}</Text>

      <View style={[styles.spineContainer, { height: svgHeight }]}>
        <Svg
          width={SPINE_COLUMN_WIDTH}
          height={svgHeight}
          style={styles.svg}
          pointerEvents="none"
        >
          {lastAchievedIdx >= 0 && (
            <Line
              x1={SPINE_X}
              y1={anchorCenterY}
              x2={SPINE_X}
              y2={filledEndY}
              stroke={COLOR_GROW}
              strokeWidth={SPINE_STROKE}
            />
          )}
          <Line
            x1={SPINE_X}
            y1={filledEndY}
            x2={SPINE_X}
            y2={lastNodeY}
            stroke={COLOR_LINE_BG}
            strokeWidth={SPINE_STROKE}
          />
          <Circle
            cx={SPINE_X}
            cy={anchorCenterY}
            r={ANCHOR_DOT_RADIUS}
            fill={COLOR_GROW}
          />
          {nodes.map(({ node }, idx) => {
            const achieved = achievements[node.id] ?? false;
            return (
              <Circle
                key={node.id}
                cx={SPINE_X}
                cy={nodeMarkerCenterY(idx)}
                r={MARKER_RADIUS}
                fill={achieved ? COLOR_GROW : COLOR_BG}
                stroke={achieved ? COLOR_GROW : COLOR_FAINT}
                strokeWidth={1.5}
              />
            );
          })}
        </Svg>

        <View
          style={[styles.contentRow, { height: ANCHOR_ROW_HEIGHT }]}
          testID="anchor-row"
        >
          <Text style={styles.anchorRowLabel}>起点アンカー</Text>
        </View>
        {nodes.map(({ node, action }) => {
          const achieved = achievements[node.id] ?? false;
          return (
            <Pressable
              key={node.id}
              onPress={() => onToggleNode(node.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: achieved }}
              accessibilityLabel={action.title}
              style={[styles.contentRow, { height: NODE_ROW_HEIGHT }]}
            >
              <Text style={styles.nodeText}>{action.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
  },
  heading: {
    color: '#F4F4F2',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  anchorText: {
    color: '#F4F4F2',
    opacity: 0.52,
    fontSize: 14,
  },
  chainTitle: {
    color: '#F4F4F2',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  spineContainer: {
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  contentRow: {
    paddingLeft: SPINE_COLUMN_WIDTH + 12,
    justifyContent: 'center',
  },
  anchorRowLabel: {
    color: COLOR_FAINT,
    fontSize: 12,
  },
  nodeText: {
    color: '#F4F4F2',
    fontSize: 16,
  },
});
