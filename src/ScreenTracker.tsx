import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { getAnalyticsClient } from './analytics';
import { normalizeScreenPath } from './analyticsEvents';

// ADR-0053: 画面遷移の捕捉。
//
// PostHog の autocapture (`captureScreens`) は **expo-router では動作しない**。
// expo-router は @react-navigation/native を内部で使うが NavigationContainer を
// 露出しないため、SDK の型定義にも「手動で捕捉して captureScreens を無効にせよ」と
// 明記されている。よってここで `usePathname()` を監視して自前で送る。
//
// 送るのは `normalizeScreenPath` で正規化した画面名のみ。生のパスを送ると
// `/chain/<id>` のチェーン ID が混入し、(1) 画面名の cardinality がユーザーの
// チェーン数だけ増えて集計にならず、(2) 送らずに済む ID を送ることになる。
//
// 「Today を開いたが node_completed が無いセッション」= 悪シグナルは、この画面
// イベントと `node_completed` の組み合わせで **PostHog のクエリ側**で定義する
// (ADR-0053 §4: 事実を送り、解釈は後から派生させる)。
export const ScreenTracker = (): null => {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const client = getAnalyticsClient();
    if (!client) return;
    const screen = normalizeScreenPath(pathname);
    // 同じ画面の再レンダリングで重複送信しない (タブ往復は別画面なので送られる)。
    if (lastSent.current === screen) return;
    lastSent.current = screen;
    try {
      client.screen(screen);
    } catch {
      // 計測失敗でアプリを落とさない。
    }
  }, [pathname]);

  return null;
};
