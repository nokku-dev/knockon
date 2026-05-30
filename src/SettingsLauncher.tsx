import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { SettingsModal } from './SettingsModal';
import { DEFAULT_RESET_TIME } from './settingsRepository';
import { useTheme } from './themeContext';
import { COLOR_FG, COLOR_LINE_BG } from './tokens';
import { useSettings } from './useSettings';

// Issue #58: 設定モーダルを開くための共通ボタン + モーダル + hooks 統合コンテナ。
// 各タブ (Today / Chains / Analytics) から 1 行で配置できるようにし、
// 「設定への入口がタブごとに散らばる」「同じ inline 実装を複数箇所に書く」を避ける。
//
// 内部で useSettings / useTheme を呼ぶため、 ThemeProvider 配下で使う前提
// (= app/_layout.tsx の階層下で OK)。 props はボタンスタイル微調整用のみ。

export type SettingsLauncherProps = {
  style?: StyleProp<ViewStyle>;
};

export const SettingsLauncher = ({ style }: SettingsLauncherProps) => {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const theme = useTheme();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="設定を開く"
        style={[styles.btn, style]}
      >
        <Ionicons name="settings-outline" size={20} color={COLOR_FG} />
      </Pressable>
      <SettingsModal
        open={open}
        resetTime={settings.settings?.resetTime ?? DEFAULT_RESET_TIME}
        themeMode={theme.themeMode}
        onClose={() => setOpen(false)}
        onSave={async ({ resetTime, themeMode }) => {
          // ADR-0029: resetTime は useSettings 経由、 themeMode は ThemeProvider
          // 経由で書き込む (= 各々が単一 source of truth)。 chains タブの既存
          // 実装と同じ split (PR #56)。
          await settings.updateResetTime(resetTime);
          await theme.setThemeMode(themeMode);
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
