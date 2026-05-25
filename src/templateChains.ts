// PR-Y1 (ADR-0023): builtin テンプレートチェーン。
// 「チェーン作成が面倒」シグナル (検証期間) への対応。
// パターン 1: テンプレ選択 → 各アクションを新規 INSERT + ノードを末尾にフラット追加。
//
// DB 永続化やユーザー追加は Phase 2 後半で判断 (ADR-0023 §将来の覆すコスト)。
// 現状はコード内定数で固定、 builtin リストの編集は本ファイルで完結。
export type TemplateChain = {
  id: string;
  title: string;
  // アクション名のリスト (順序が末尾追加順)。 既存 actions テーブルへの ID 参照は持たず、
  // 取り込み時に新規 action として INSERT する設計 (= テンプレの 1 タップが新規アクション
  // を量産する。 重複名を防ぐ責務はユーザー側、 必要なら Phase 2 で名寄せ機能を追加)。
  actions: ReadonlyArray<string>;
};

export const BUILTIN_TEMPLATE_CHAINS: ReadonlyArray<TemplateChain> = [
  {
    id: 'morning-routine',
    title: '朝のルーティン',
    actions: [
      '水を飲む',
      '朝食器を浸け置き',
      '筋トレ',
      'シャワー時に洗濯スタート',
      'ロボ掃除機を起動',
      'ウォーキング',
    ],
  },
  {
    id: 'workout',
    title: '筋トレ',
    actions: [
      'ウォームアップ',
      'スキルワーク (聖域)',
      'メイン種目',
      'クールダウン',
      'プロテイン',
    ],
  },
  {
    id: 'study',
    title: '学習',
    actions: ['机を整える', 'タイマー開始', '休憩を 1 回はさむ', '振り返り'],
  },
  {
    id: 'sleep',
    title: '就寝前',
    actions: ['歯磨き', 'スマホを置く', 'ストレッチ', '読書'],
  },
  {
    id: 'laundry',
    title: '洗濯',
    actions: [
      '服を洗濯機に入れる',
      '洗濯機を ON',
      '乾燥済みを取り出す',
      'たたむ',
      'しまう',
    ],
  },
  {
    id: 'bath',
    title: 'お風呂',
    actions: [
      '風呂掃除',
      '風呂を沸かす',
      '入浴',
      '鏡にクエン酸スプレー',
      '髪を乾かす',
    ],
  },
];
