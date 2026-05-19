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
  // 未指定のとき各カードは非インタラクティブ View としてレンダリングされる。
  // Phase 1 では発火動線 UI を配線していない (全シードチェーンは Today に自動表示
  // される前提) ため未指定運用。タップしても何も起きない Pressable を出すと
  // Augmentation 原則 (期待を作って空振りしない) に反するので構造的に分岐する。
  onSelectChain?: (chainId: string) => void;
};

type ChainCardProps = {
  item: ChainListItem;
  onPress?: (chainId: string) => void;
};

const ChainCard = ({ item: { chain, anchor, nodeCount }, onPress }: ChainCardProps) => {
  const content = (
    <>
      <View style={styles.meta}>
        <Text style={styles.anchor}>{anchor.title}</Text>
        {anchor.kind === 'time' && anchor.time && (
          <>
            <Text style={styles.divider}>·</Text>
            <Text style={styles.anchorTime}>{anchor.time}</Text>
          </>
        )}
        <Text style={styles.divider}>·</Text>
        <Text style={styles.nodeCount}>{nodeCount} ノード</Text>
      </View>
      <Text style={styles.title}>{chain.title}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.card} accessibilityLabel={chain.title}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(chain.id)}
      accessibilityRole="button"
      accessibilityLabel={chain.title}
      style={styles.card}
    >
      {content}
    </Pressable>
  );
};

export const ChainListScreen = ({
  items,
  onSelectChain,
}: ChainListScreenProps) => (
  <ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.heading}>チェーン</Text>
    {items.length === 0 ? (
      <Text style={styles.empty}>チェーンがまだありません</Text>
    ) : (
      <View style={styles.list}>
        {items.map((item) => (
          <ChainCard key={item.chain.id} item={item} onPress={onSelectChain} />
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
  anchorTime: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
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
