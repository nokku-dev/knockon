import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

void SystemUI.setBackgroundColorAsync('#16161A');

import { initSchema } from './src/db';
import { getExpoSqliteClient } from './src/db.expo';
import {
  shouldSeed,
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './src/domain';
import type {
  AchievementMap,
  Anchor,
  Chain,
} from './src/domain';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listChains,
  listNodes,
  recordAchievement,
} from './src/repository';
import { buildPersonalChainSeed, seed } from './src/seed';
import { TodayScreen } from './src/TodayScreen';
import type { TodayNode } from './src/TodayScreen';

type TodayData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  today: string;
};

const loadToday = async (): Promise<TodayData | null> => {
  const db = await getExpoSqliteClient();
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
  const validNodes = withActions.filter((x): x is TodayNode => x !== null);
  const today = todayIsoDate(new Date());
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    today,
    today,
  );

  return {
    chain,
    anchor,
    nodes: validNodes,
    achievements: toAchievementMap(records, today),
    today,
  };
};

export default function App() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadToday()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (nodeId: string) => {
      if (!data) return;
      const nextAchievements = toggleAchievementInMap(
        data.achievements,
        nodeId,
      );
      setData({ ...data, achievements: nextAchievements });
      try {
        const db = await getExpoSqliteClient();
        await recordAchievement(db, {
          nodeId,
          date: data.today,
          achieved: nextAchievements[nodeId] ?? false,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  return (
    <SafeAreaProvider style={styles.root}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        {loading ? (
          <ActivityIndicator color="#F4F4F2" style={styles.center} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !data ? (
          <Text style={styles.soft}>チェーンがありません</Text>
        ) : (
          <TodayScreen
            chain={data.chain}
            anchor={data.anchor}
            nodes={data.nodes}
            achievements={data.achievements}
            onToggleNode={handleToggle}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#16161A',
  },
  center: {
    marginTop: 40,
  },
  error: {
    color: '#E0574C',
    padding: 24,
  },
  soft: {
    color: '#F4F4F2',
    opacity: 0.52,
    padding: 24,
  },
});
