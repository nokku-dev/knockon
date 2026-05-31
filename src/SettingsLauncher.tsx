import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  Pressable,
  Share,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

import { exportChainsAsJson } from './chainExport';
import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Node } from './domain';
import { SettingsModal } from './SettingsModal';
import { DEFAULT_RESET_TIME } from './settingsRepository';
import {
  getAnchor,
  listActions,
  listChains,
  listNodes,
} from './repository';
import { useTheme } from './themeContext';
import { COLOR_FG, COLOR_LINE_BG } from './tokens';
import { useSettings } from './useSettings';

// Issue #58: 設定モーダルを開くための共通ボタン + モーダル + hooks 統合コンテナ。
// 各タブ (Today / Chains / Analytics) から 1 行で配置できるようにし、
// 「設定への入口がタブごとに散らばる」「同じ inline 実装を複数箇所に書く」を避ける。
//
// 内部で useSettings / useTheme を呼ぶため、 ThemeProvider 配下で使う前提
// (= app/_layout.tsx の階層下で OK)。 props はボタンスタイル微調整用のみ。
//
// Issue #66: チェーンエクスポート。 DB から chains / anchors / nodes / actions を集めて
// 純粋関数 exportChainsAsJson で JSON 化 → React Native built-in の Share.share に渡す。
// Share API は OS の共有シートを出すので、 任意の宛先 (メモ / Slack / メール / ファイル)
// にユーザーが選べる。 失敗しても (ユーザー dismiss / 共有先なし) 例外を握り潰し
// モーダルを開いたままにする (= K-024 同型の silent fallback)。

export type SettingsLauncherProps = {
  style?: StyleProp<ViewStyle>;
};

export const SettingsLauncher = ({ style }: SettingsLauncherProps) => {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const theme = useTheme();

  const handleExportChains = useCallback(async () => {
    try {
      const db = await getExpoSqliteClient();
      const chains = await listChains(db);
      const actions = await listActions(db);
      // listAnchors / 全 nodes 一括取得する API は未提供のため、 export 用途は
      // chain ごとに anchor / nodes を取得する。 N=1 規模 (チェーン数十件程度) で
      // 性能問題なし。
      const anchors: Anchor[] = [];
      const nodes: Node[] = [];
      for (const chain of chains) {
        const anchor = await getAnchor(db, chain.anchorId);
        if (anchor) anchors.push(anchor);
        const chainNodes = await listNodes(db, chain.id);
        nodes.push(...chainNodes);
      }
      const json = exportChainsAsJson({
        chains,
        anchors,
        nodes,
        actions,
        now: new Date(),
      });
      await Share.share({ message: json });
    } catch {
      // 共有失敗 / ユーザー dismiss は無視 (モーダルは開いたまま、 再試行可能)。
    }
  }, []);

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
        onExportChains={handleExportChains}
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
