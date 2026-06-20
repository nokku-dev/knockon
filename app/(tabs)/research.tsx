import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ResearchScreen } from '../../src/ResearchScreen';
import { COLOR_BG } from '../../src/tokens';

// #175 (PR-A): 研究タブの空スケルトン。 中身は src/ResearchScreen に分離。
// PR-B / PR-C で卒業候補・試行中の表示を順次足す。

export default function ResearchTab() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ResearchScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
});
