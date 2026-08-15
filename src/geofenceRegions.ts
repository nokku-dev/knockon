import type { Anchor, Chain } from './domain';

// #301 (Phase 1.6b): 場所アンカーを OS の region monitoring に渡す形へ変換する純関数。
//
// DB / expo-location / TaskManager に依存しない (K-007)。副作用のある登録処理は
// `geofencing.ts` が担い、本ファイルは「何を登録すべきか」の決定だけを持つ。
// これにより上限・除外条件・重複排除が ts-jest (node env) で検証できる。

// iOS の region monitoring は 1 アプリあたり同時 20 件まで (Apple の制約)。
// 超過分のキューイングは PLAN で Phase 2。ここでは切り捨てた数を返すに留める。
export const IOS_REGION_LIMIT = 20;

export type GeofenceSource = { chain: Chain; anchor: Anchor };

// expo-location の LocationRegion と同形 (依存を持たないため型は自前で持つ)。
export type GeofenceRegion = {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
};

export type GeofencePlan = {
  regions: GeofenceRegion[];
  // 上限に当たって載らなかった件数。0 以外なら「登録できていない場所がある」。
  // ⚠ 呼び出し側はこれを握り潰さない (ADR-0073: 「登録できなかった」を
  // 「登録した」に潰さない)。Phase 2 でキューイングを入れるときの入口でもある。
  droppedForLimit: number;
};

// 場所アンカーとして OS に渡せるか。
// 座標か半径が欠けている / 半径が非正 のアンカーは OS に渡さない
// (不正な region を登録すると挙動が不定になる。UI 側のバリデーションが
// 正常系を保証する前提だが、DB から壊れた値が来ても落ちない側に倒す)。
const isRegisterablePlaceAnchor = (anchor: Anchor): boolean =>
  anchor.kind === 'place' &&
  anchor.latitude != null &&
  anchor.longitude != null &&
  anchor.radiusMeters != null &&
  anchor.radiusMeters > 0;

export const planGeofences = (
  items: readonly GeofenceSource[],
): GeofencePlan => {
  const seen = new Set<string>();
  const all: GeofenceRegion[] = [];
  for (const { chain, anchor } of items) {
    // stocked は Today にも通知にも出さない方針と揃える (休止中は発火させない)。
    if (chain.status !== 'active') continue;
    if (!isRegisterablePlaceAnchor(anchor)) continue;
    // chains.anchor_id の 1-1 は SQL レベルでは未強制 (src/db.ts §CASCADE 設計) なので、
    // 同じアンカーを複数チェーンが共有していても region は 1 つに畳む。
    if (seen.has(anchor.id)) continue;
    seen.add(anchor.id);
    all.push({
      identifier: anchor.id,
      latitude: anchor.latitude!,
      longitude: anchor.longitude!,
      radius: anchor.radiusMeters!,
      // 到達のみを見る。ADR-0012 の発火は「1 日 1 回の不可逆事実」で、
      // 範囲を出たことは記録しない (出入りを繰り返しても発火は 1 回)。
      notifyOnEnter: true,
      notifyOnExit: false,
    });
  }
  return {
    regions: all.slice(0, IOS_REGION_LIMIT),
    droppedForLimit: Math.max(0, all.length - IOS_REGION_LIMIT),
  };
};
