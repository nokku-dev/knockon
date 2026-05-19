import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  AchievementMap,
  Action,
  Anchor,
  Chain,
  Node,
} from './domain';

export type TodayNode = { node: Node; action: Action };

export type TodayScreenProps = {
  chain: Chain;
  anchor: Anchor;
  nodes: readonly TodayNode[];
  achievements: AchievementMap;
  onToggleNode: (nodeId: string) => void;
};

export const TodayScreen = ({
  chain,
  anchor,
  nodes,
  achievements,
  onToggleNode,
}: TodayScreenProps) => (
  <ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.heading}>Today</Text>
    <View style={styles.chain}>
      <Text style={styles.anchor}>{anchor.title}</Text>
      <Text style={styles.chainTitle}>{chain.title}</Text>
      {nodes.map(({ node, action }) => {
        const achieved = achievements[node.id] ?? false;
        return (
          <Pressable
            key={node.id}
            onPress={() => onToggleNode(node.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: achieved }}
            accessibilityLabel={action.title}
            style={styles.row}
          >
            <View
              style={[
                styles.marker,
                achieved ? styles.markerFilled : styles.markerOutline,
              ]}
            />
            <Text style={styles.nodeText}>{action.title}</Text>
          </Pressable>
        );
      })}
    </View>
  </ScrollView>
);

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
  chain: {
    gap: 4,
  },
  anchor: {
    color: '#F4F4F2',
    opacity: 0.52,
    fontSize: 14,
  },
  chainTitle: {
    color: '#F4F4F2',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 16,
  },
  marker: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  markerFilled: {
    backgroundColor: '#EAEAE8',
  },
  markerOutline: {
    borderWidth: 1.5,
    borderColor: '#5A5A60',
  },
  nodeText: {
    color: '#F4F4F2',
    fontSize: 16,
  },
});
