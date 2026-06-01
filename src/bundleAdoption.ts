import type { DbClient } from './db';
import type { AnchorKind, ChainDraft } from './domain';
import { insertAction, insertAnchor, insertChain, insertNode } from './repository';

// 採用時の ID 生成戦略 (型単位)。テストで決定的 ID に差し替えられるよう注入可能にする
// (CLAUDE.md「時刻取得や乱数も呼び出し側で生成して渡す」)。
//
// idGen は必須引数 = 呼び出し側 (PR-70b の UI/hook 層) が ids.ts (expo-crypto) から
// 注入する。bundleAdoption は domain テスト (ts-jest, node env) で走るため、
// ここで ids.ts を static import すると expo-crypto (ESM) を引き込んで
// `Cannot use import statement outside a module` で落ちる (K-007 / HANDOFF)。
// よって ids.ts への依存を持たず、生成戦略の注入だけを受ける。
export type IdGen = {
  anchor: () => string;
  chain: () => string;
  action: () => string;
  node: () => string;
};

// #70 (ADR-0030): 束採用の永続化。buildChainDraftFromBundle が作った ChainDraft を
// live (anchor + chain + actions + nodes) として書き込む。
//
// 純粋部分 (採用集合の決定) は domain.buildChainDraftFromBundle に分離済み (K-007)。
// 本関数は副作用 (DB 書き込み) を持つが、now / idGen を注入してテスト容易性を確保する。
//
// 既存 createFromTemplate (ADR-0023 builtin チェーン取り込み) と同型だが、
// 採用ノードに module_id を付与する点が異なる (= catalog 由来の所属を live に持ち込む)。
// 採用時の並べ替えはさせない = ChainDraft.nodes の順序をそのまま orderIndex にする (SPEC §4)。
//
// anchorSpec: アンカーの種別/時刻。省略時は discovery と同じ「行動」起点 (時刻/場所は採用後に
// 編集、createFromTemplate と整合)。onboarding (#72) は時刻アンカー (kind='time', time=HH:MM) を
// 渡す = 初回ルートの load-bearing 要件 (アンカー時刻が無いとチェーンが発火しない、SPEC §5)。
export type AdoptAnchorSpec = { kind: AnchorKind; time: string | null };

const DEFAULT_ANCHOR_SPEC: AdoptAnchorSpec = { kind: 'behavior', time: null };

export const adoptChainDraft = async (
  db: DbClient,
  draft: ChainDraft,
  now: string,
  idGen: IdGen,
  anchorSpec: AdoptAnchorSpec = DEFAULT_ANCHOR_SPEC,
): Promise<string> => {
  const anchorId = idGen.anchor();
  const chainId = idGen.chain();

  await insertAnchor(db, {
    id: anchorId,
    title: draft.title,
    kind: anchorSpec.kind,
    time: anchorSpec.time,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  });

  await insertChain(db, {
    id: chainId,
    title: draft.title,
    anchorId,
    status: 'active',
    createdAt: now,
  });

  let orderIndex = 0;
  for (const node of draft.nodes) {
    const actionId = idGen.action();
    await insertAction(db, {
      id: actionId,
      title: node.actionTitle,
      variants: null,
      timerSeconds: node.timerSeconds,
    });
    await insertNode(db, {
      id: idGen.node(),
      chainId,
      orderIndex,
      kind: 'action',
      actionId,
      moduleId: node.moduleId,
    });
    orderIndex += 1;
  }

  return chainId;
};
