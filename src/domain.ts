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
