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
