import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChainListScreen } from '../../src/ChainListScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
} from '../../src/tokens';
import { useChainListData } from '../../src/useChainListData';

export default function ChainsTab() {
  const { items, error, loading } = useChainListData();
  const router = useRouter();

  const handleSelectChain = (chainId: string) => {
    router.push(`/anchor/${chainId}`);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ChainListScreen items={items} onSelectChain={handleSelectChain} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    color: COLOR_ACCENT,
    padding: 24,
  },
});
