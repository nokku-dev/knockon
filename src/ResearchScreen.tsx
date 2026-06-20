import { StyleSheet, Text, View } from 'react-native';

import { COLOR_BG, COLOR_FG_FAINT } from './tokens';

// #175 (PR-A): 研究タブの空スケルトン。 後続 PR-B (卒業候補) / PR-C (試行中) で
// 中身を充実させる。 現時点では固定文言のみ。 反 streak / Celebrate 主と整合する
// 控えめなトーン (COLOR_FG_FAINT) で「インサイトはまだありません」とだけ表示。

export function ResearchScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.empty}>インサイトはまだありません</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  empty: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
  },
});
