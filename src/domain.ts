export type IsoDate = string;

export type ChainStatus = 'active' | 'stocked';

export type AnchorKind = 'time' | 'place' | 'behavior';

export type Anchor = {
  id: string;
  title: string;
  kind: AnchorKind;
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
};

export type Action = {
  id: string;
  title: string;
  variants: VariantMap | null;
};

export type VariantMap = {
  [key: string]: { title: string };
};

export type NodeKind = 'action';

export type Node = {
  id: string;
  chainId: string;
  orderIndex: number;
  kind: NodeKind;
  actionId: string;
};

export type Chain = {
  id: string;
  title: string;
  anchorId: string;
  status: ChainStatus;
  createdAt: IsoDate;
};

export type Achievement = {
  nodeId: string;
  date: IsoDate;
  achieved: boolean;
};

export const isNodeAchievedOn = (
  achievements: readonly Achievement[],
  nodeId: string,
  date: IsoDate,
): boolean => {
  const record = achievements.find(
    (a) => a.nodeId === nodeId && a.date === date,
  );
  return record?.achieved ?? false;
};

export const countAchievedNodesOn = (
  achievements: readonly Achievement[],
  nodeIds: readonly string[],
  date: IsoDate,
): number =>
  nodeIds.reduce(
    (acc, id) => acc + (isNodeAchievedOn(achievements, id, date) ? 1 : 0),
    0,
  );

export const shouldSeed = (existingChains: readonly Chain[]): boolean =>
  existingChains.length === 0;

export type AchievementMap = Readonly<Record<string, boolean>>;

export const toAchievementMap = (
  achievements: readonly Achievement[],
  date: IsoDate,
): AchievementMap => {
  const map: Record<string, boolean> = {};
  for (const a of achievements) {
    if (a.date === date) map[a.nodeId] = a.achieved;
  }
  return map;
};

export const toggleAchievementInMap = (
  map: AchievementMap,
  nodeId: string,
): AchievementMap => ({ ...map, [nodeId]: !(map[nodeId] ?? false) });

export const todayIsoDate = (now: Date): IsoDate => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 線（スパイン）の --grow 範囲を派生する関数。
// 「達成済みノード範囲モデル」(ADR-0010) — アンカーから最後に達成済みのノードまで
// を --grow で繋ぐ。途中に未達ノードがあっても両端が達成済みなら線は繋がる扱い。
// 返り値: 最後に達成済みのノードのインデックス。全ノード未達なら -1。
export const lastAchievedNodeIndex = (
  nodes: readonly Node[],
  achievements: AchievementMap,
): number => {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (achievements[nodes[i]!.id] === true) return i;
  }
  return -1;
};

export const groupAchievementsByDate = (
  achievements: readonly Achievement[],
): Readonly<Record<IsoDate, AchievementMap>> => {
  const grouped: Record<IsoDate, Record<string, boolean>> = {};
  for (const a of achievements) {
    const day = (grouped[a.date] ??= {});
    day[a.nodeId] = a.achieved;
  }
  return grouped;
};
