import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { initSchema } from './src/db';
import { createExpoSqliteClient } from './src/db.expo';
import { shouldSeed } from './src/domain';
import type { Action, Anchor, Chain, Node } from './src/domain';
import {
  getAction,
  getAnchor,
  listChains,
  listNodes,
} from './src/repository';
import { buildPersonalChainSeed, seed } from './src/seed';

type TodayNode = { node: Node; action: Action };

type TodayView = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
};

const loadToday = async (): Promise<TodayView | null> => {
  const db = await createExpoSqliteClient();
  await initSchema(db);

  const existing = await listChains(db, 'active');
  if (shouldSeed(existing)) {
    await seed(db, buildPersonalChainSeed());
  }

  const chains = await listChains(db, 'active');
  const chain = chains[0];
  if (!chain) return null;

  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;

  const nodes = await listNodes(db, chain.id);
  const withActions = await Promise.all(
    nodes.map(async (node) => {
      const action = await getAction(db, node.actionId);
      return action ? { node, action } : null;
    }),
  );

  return {
    chain,
    anchor,
    nodes: withActions.filter((x): x is TodayNode => x !== null),
  };
};

export default function App() {
  const [view, setView] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadToday()
      .then((v) => setView(v))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.heading}>Today</Text>

          {loading ? (
            <ActivityIndicator color="#F4F4F2" />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !view ? (
            <Text style={styles.soft}>チェーンがありません</Text>
          ) : (
            <View style={styles.chain}>
              <Text style={styles.anchor}>{view.anchor.title}</Text>
              <Text style={styles.chainTitle}>{view.chain.title}</Text>
              {view.nodes.map(({ node, action }) => (
                <Text key={node.id} style={styles.node}>
                  {action.title}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#16161A',
  },
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
    gap: 12,
  },
  anchor: {
    color: '#F4F4F2',
    fontSize: 14,
    opacity: 0.52,
  },
  chainTitle: {
    color: '#F4F4F2',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  node: {
    color: '#F4F4F2',
    fontSize: 16,
    paddingVertical: 10,
  },
  soft: {
    color: '#F4F4F2',
    opacity: 0.52,
  },
  error: {
    color: '#E0574C',
  },
});
