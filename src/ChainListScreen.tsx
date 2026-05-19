import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_SURFACE,
} from './tokens';
import type { ChainListItem } from './useChainListData';

export type ChainListScreenProps = {
  items: readonly ChainListItem[];
  onSelectChain?: (chainId: string) => void;
};

export const ChainListScreen = ({
  items,
  onSelectChain,
}: ChainListScreenProps) => (
  <ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.heading}>チェーン</Text>
    {items.length === 0 ? (
      <Text style={styles.empty}>active チェーンがありません</Text>
    ) : (
      <View style={styles.list}>
        {items.map(({ chain, anchor, nodeCount }) => (
          <Pressable
            key={chain.id}
            onPress={() => onSelectChain?.(chain.id)}
            accessibilityLabel={chain.title}
            style={styles.card}
          >
            <View style={styles.meta}>
              <Text style={styles.anchor}>{anchor.title}</Text>
              <Text style={styles.divider}>·</Text>
              <Text style={styles.nodeCount}>{nodeCount} ノード</Text>
            </View>
            <Text style={styles.title}>{chain.title}</Text>
          </Pressable>
        ))}
      </View>
    )}
  </ScrollView>
);

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
  },
  heading: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  list: {
    gap: 12,
  },
  card: {
    padding: 16,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    gap: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  anchor: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
  },
  divider: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
  },
  nodeCount: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
  },
  title: {
    color: COLOR_FG,
    fontSize: 18,
    fontWeight: '600',
  },
  empty: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
});
