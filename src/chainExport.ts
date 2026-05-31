import type { Action, Anchor, Chain, Node } from './domain';

// Issue #66: チェーンをエクスポートしてテンプレ案を考える参考にする機能。
// 出力形式は JSON。 OS Share Sheet 経由で任意の宛先 (メモアプリ / Slack / メール 等)
// に渡せる文字列を返す純粋関数として実装し、 UI / DB から完全に切り離す (K-007)。
//
// 設計判断:
// - ID / createdAt / anchorId は出力に含めない (再 import を前提とせず、 テンプレ参考
//   用途のため DB 固有値はノイズ)。
// - actions[] は nodes の orderIndex 昇順に並べる (= ノードの順序情報を「配列の順序」
//   そのもので表現)。 nodes 自体は出力しない (1 ノード = 1 アクション参照しか持たない
//   v1 構造では冗長)。
// - anchor / action が DB 不整合で見つからない場合は silent skip (= deleteChain 等の
//   no-op パターンと同型)。 export を「絶対落ちないツール」として扱う。
//
// 将来 import 機能を作る場合は version を bump して別形式 (= ID 付き) を併存させる。

export const CHAIN_EXPORT_VERSION = 1;

export type ExportableAnchor = {
  kind: Anchor['kind'];
  title: string;
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
};

export type ExportableAction = {
  title: string;
  variants: Action['variants'];
  timerSeconds: number | null;
};

export type ExportableChain = {
  title: string;
  status: Chain['status'];
  anchor: ExportableAnchor;
  actions: ExportableAction[];
};

export type ChainExportPayload = {
  exportedAt: string; // ISO 8601
  version: number;
  chains: ExportableChain[];
};

export type ExportChainsInput = {
  chains: readonly Chain[];
  anchors: readonly Anchor[];
  nodes: readonly Node[];
  actions: readonly Action[];
  now: Date;
};

const toExportableAnchor = (a: Anchor): ExportableAnchor => ({
  kind: a.kind,
  title: a.title,
  time: a.time,
  latitude: a.latitude,
  longitude: a.longitude,
  radiusMeters: a.radiusMeters,
});

const toExportableAction = (a: Action): ExportableAction => ({
  title: a.title,
  variants: a.variants,
  timerSeconds: a.timerSeconds,
});

const buildPayload = (input: ExportChainsInput): ChainExportPayload => {
  const anchorById = new Map(input.anchors.map((a) => [a.id, a]));
  const actionById = new Map(input.actions.map((a) => [a.id, a]));
  const nodesByChain = new Map<string, Node[]>();
  for (const node of input.nodes) {
    const arr = nodesByChain.get(node.chainId) ?? [];
    arr.push(node);
    nodesByChain.set(node.chainId, arr);
  }

  const chains: ExportableChain[] = [];
  for (const chain of input.chains) {
    const anchor = anchorById.get(chain.anchorId);
    if (!anchor) continue; // DB 不整合は silent skip
    const orderedNodes = [...(nodesByChain.get(chain.id) ?? [])].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const actions: ExportableAction[] = [];
    for (const node of orderedNodes) {
      const action = actionById.get(node.actionId);
      if (!action) continue; // 不整合 action も silent skip
      actions.push(toExportableAction(action));
    }
    chains.push({
      title: chain.title,
      status: chain.status,
      anchor: toExportableAnchor(anchor),
      actions,
    });
  }

  return {
    exportedAt: input.now.toISOString(),
    version: CHAIN_EXPORT_VERSION,
    chains,
  };
};

export const exportChainsAsJson = (input: ExportChainsInput): string =>
  JSON.stringify(buildPayload(input), null, 2);
