import { AppState } from 'react-native';

import { syncGeofences } from './geofencing';

// #301 follow-up: 前面復帰でジオフェンスを取り直す。
//
// 背景 (Simulator QA で見つかった経路): `syncGeofences` は **起動時とチェーン保存時**
// にしか走らない。そのため常時権限を**後から iOS の設定アプリで許可**しても、
// アプリを再起動するかチェーンを保存するまで region が登録されない。
// 実世界だと「一度 Always を拒否 → 後から設定で許可 → でも通知が来ない」になる。
//
// ⚠ 権限をここで**要求しない**のは起動時の `syncGeofences` と同じ理由
// (ADR-0003 §決定 第 5 項: Always の再要求ループ / 許可誘導 UI の禁止)。
// 読み直すだけ。ユーザーが設定アプリで許可して戻ってきたときに効く。
//
// 再登録は安全: `startGeofencingAsync` は同じタスク名で呼ぶと region 集合を
// 置き換えるだけで、既に中に居る region に Enter を再配信することはない
// (= 前面に戻すたびに通知が飛ぶことはない)。
export const startGeofenceResyncOnForeground = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    // 失敗しても復帰時に落とさない。次の復帰か次の起動で取り直す。
    void syncGeofences().catch(() => undefined);
  });
  return () => subscription.remove();
};
