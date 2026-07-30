import { readFileSync } from 'fs';
import { join } from 'path';

// ADR-0054: Today アクション長押しからのメモ作成は無効。
//
// ADR-0049 で研究タブ (メモ一覧) を非表示にした結果「書けるが読めない」状態になり、
// 長押しでメモが書けること自体が混乱の原因になっていた。
//
// 無効化の手段は「`onAddNote` prop を渡さない」だけ (TodayScreen / ChainDetail は
// 未指定なら長押しメモ動線と NoteComposeModal を描画しないスイッチ式)。
// = ADR-0045 / 0049 の `href: null` と同型の非破壊パターン。
//
// このテストは「うっかり prop を戻して復活する」ことを防ぐ (K-006 同型)。
// 研究タブを再有効化する判断をしたときは、ADR を書いてからこのテストを消す。

const todayRouteRaw = readFileSync(
  join(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
  'utf8',
);

// コメント行を除外した実コード。復帰手順の説明で `onAddNote={handleAddNote}` に
// 言及するため、コメントを含めたまま検査すると常に落ちる。
const todayRoute = todayRouteRaw
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

describe('Today の長押しメモ動線が無効であること (ADR-0054)', () => {
  test('Today ルートが TodayScreen に onAddNote を渡していない', () => {
    expect(todayRoute).not.toMatch(/onAddNote=\{/);
  });

  test('Today ルートがメモ永続化関数を import していない', () => {
    expect(todayRoute).not.toContain('persistNewNote');
  });

  test('無効化は prop を渡さない方式であること (import まで消していない)', () => {
    // 削除ではなく「渡さない」で無効化していることを固定する。
    expect(todayRouteRaw).toContain('ADR-0054');
  });
});

describe('非破壊であること (研究タブ再有効化で戻せる)', () => {
  const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

  test('NoteComposeModal / ResearchScreen / useNotesData は残置されている', () => {
    // 削除ではなく「渡さない」で無効化しているので、コードは残っている必要がある。
    expect(() => read('NoteComposeModal.tsx')).not.toThrow();
    expect(() => read('ResearchScreen.tsx')).not.toThrow();
    expect(() => read('useNotesData.ts')).not.toThrow();
  });

  test('TodayScreen / ChainDetail は onAddNote / onNoteLongPress の受け口を保持している', () => {
    // prop を戻すだけで復帰できる状態を固定する。
    expect(read('TodayScreen.tsx')).toContain('onAddNote');
    expect(read('ChainDetail.tsx')).toContain('onNoteLongPress');
  });
});

describe('定着の取り下げ導線は残っていること (ADR-0047)', () => {
  test('ChainDetail に「定着を取り下げる」が残っている', () => {
    // メモを消した副作用で取り下げまで殺していないことを確認する。
    expect(read_chain()).toContain('定着を取り下げる');
  });

  test('Today ルートが onRetractSettlement を渡している', () => {
    expect(todayRoute).toMatch(/onRetractSettlement=\{/);
  });
});

function read_chain(): string {
  return readFileSync(join(__dirname, 'ChainDetail.tsx'), 'utf8');
}
