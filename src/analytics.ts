import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

import { isSafeProps } from './analyticsEvents';
import type { AnalyticsEvent, SafeProps } from './analyticsEvents';

// ADR-0053: 分析基盤 (PostHog) の唯一の窓口。
//
// **画面 / hook / repository から posthog を直接呼ばない。** ここを 1 枚挟むことで、
// (1) 乗り換えコストがこのファイルの書き換えだけになり、(2) 「送ってよい値」の検証を
// 一箇所に集約できる (CLAUDE.md のドメイン層隔離と同型)。
//
// 送信できるのは AnalyticsEvent に定義済みのイベント名と、number | boolean のみ。
// チェーン名 / アクション名 / メモ本文 / メトリクス値 (体重等) / 位置座標は
// **型レベルで送れない** (ADR-0053 §1 / §3)。

type PostHogConfig = { apiKey: string; host: string };

const readConfig = (): PostHogConfig | null => {
  const raw = (
    Constants.expoConfig?.extra as { posthog?: Partial<PostHogConfig> } | undefined
  )?.posthog;
  const apiKey = typeof raw?.apiKey === 'string' ? raw.apiKey : '';
  const host = typeof raw?.host === 'string' ? raw.host : '';
  if (!apiKey || !host) return null;
  return { apiKey, host };
};

let client: PostHog | null = null;
let warnedUnconfigured = false;

// アプリ起動時に 1 度だけ呼ぶ (app/_layout.tsx)。
// 設定が無ければ null を返し、以降 track() は no-op になる。
export const initAnalytics = (): PostHog | null => {
  if (client) return client;
  const config = readConfig();
  if (!config) {
    if (__DEV__ && !warnedUnconfigured) {
      warnedUnconfigured = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[analytics] app.json の extra.posthog.apiKey が未設定のため計測は無効です',
      );
    }
    return null;
  }
  client = new PostHog(config.apiKey, {
    host: config.host,
    // ADR-0053 §5: session replay は使わない。習慣アプリの画面は個人の生活記録
    // そのものなので、録画は「記録内容を送らない」線と正面から衝突する。
    // SDK の既定も false だが、既定値の変更に巻き込まれないよう明示する。
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        // ⚠️ **console は必ず false**。有効にすると console.log / console.error に
        // 渡された文字列がそのまま送信される。アプリ内のログにはチェーン名や
        // アクション名が載り得るため、ADR-0053 §1 の「記録内容を送らない」に違反する。
        console: false,
        // ネイティブクラッシュの捕捉は別パッケージ (@posthog/react-native-plugin) と
        // デバッグシンボルのアップロードが必要。config plugin が増えて K-040 の
        // リスク帯に入るため、本 PR では入れない。JS 例外は上の 2 つで捕捉できる。
        nativeCrashes: false,
      },
    },
  });
  return client;
};

export const getAnalyticsClient = (): PostHog | null => client;

export const isAnalyticsEnabled = (): boolean => client !== null;

// イベント送信。設定が無い / 値が不正なときは黙って捨てる (計測のために
// アプリの動作を止めない)。K-024 の silently fallback と同型。
export const track = (event: AnalyticsEvent, props?: SafeProps): void => {
  if (!client) return;
  // 型 (SafeValue) が第一の防御線。ここは `as never` 等での迂回に対する実行時の砦。
  if (!isSafeProps(props)) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error(
        `[analytics] ${event}: number | boolean 以外の値が渡されたため送信を中止しました`,
      );
    }
    return;
  }
  try {
    client.capture(event, props);
  } catch {
    // 送信失敗でアプリを落とさない。
  }
};
