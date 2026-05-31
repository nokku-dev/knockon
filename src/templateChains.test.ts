import { BUILTIN_TEMPLATE_CHAINS } from './templateChains';

describe('BUILTIN_TEMPLATE_CHAINS', () => {
  test('id は全 template でユニーク', () => {
    const ids = BUILTIN_TEMPLATE_CHAINS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('各 template にタイトルと 1 つ以上のアクションがある', () => {
    for (const t of BUILTIN_TEMPLATE_CHAINS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.actions.length).toBeGreaterThan(0);
    }
  });

  test('各アクション名は空文字でない', () => {
    for (const t of BUILTIN_TEMPLATE_CHAINS) {
      for (const action of t.actions) {
        expect(action.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Notion Habit Categories 反映: 洗濯 / お風呂 テンプレが含まれる', () => {
    const ids = BUILTIN_TEMPLATE_CHAINS.map((t) => t.id);
    expect(ids).toContain('laundry');
    expect(ids).toContain('bath');
  });

  test('morning-routine は Notion 起床ルーティン動線 (筋トレ / 洗濯スタート / ロボ掃除機 / ウォーキング) を含む', () => {
    const morning = BUILTIN_TEMPLATE_CHAINS.find(
      (t) => t.id === 'morning-routine',
    );
    expect(morning).toBeTruthy();
    const actions = morning!.actions;
    expect(actions).toContain('筋トレ');
    expect(actions).toContain('シャワー時に洗濯スタート');
    expect(actions).toContain('ロボ掃除機を起動');
    expect(actions).toContain('ウォーキング');
  });

  test('workout は Notion 筋トレ聖域構造 (スキルワーク聖域) を含む', () => {
    const workout = BUILTIN_TEMPLATE_CHAINS.find((t) => t.id === 'workout');
    expect(workout).toBeTruthy();
    expect(workout!.actions).toContain('スキルワーク (聖域)');
  });

  // Issue #62: テンプレ充実 — 既存 6 件に加えて common な If-Then 系列を追加。
  // 検証期間中の「一つのチェーンを作るのが面倒」シグナル (ADR-0023) への上積み対応。

  test('追加テンプレ (帰宅 / 外出前 / キッチンリセット / 仕事開始 / 仕事終了 / 振り返り) が含まれる', () => {
    const ids = BUILTIN_TEMPLATE_CHAINS.map((t) => t.id);
    expect(ids).toContain('return-home');
    expect(ids).toContain('before-leaving');
    expect(ids).toContain('kitchen-reset');
    expect(ids).toContain('work-start');
    expect(ids).toContain('work-end');
    expect(ids).toContain('journaling');
  });

  test('return-home は帰宅後の定番動線 (手洗い / 着替え) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'return-home');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('手を洗う');
    expect(t!.actions).toContain('部屋着に着替える');
  });

  test('before-leaving は外出前チェック (戸締まり / 持ち物) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'before-leaving');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('鍵・財布・スマホを確認');
    expect(t!.actions).toContain('戸締まり');
  });

  test('kitchen-reset は食後のキッチン片付け (食器を洗う / シンクを拭く) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'kitchen-reset');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('食器を洗う');
    expect(t!.actions).toContain('シンクを拭く');
  });

  test('work-start は仕事開始リチュアル (机を整える / 今日のタスクを決める) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'work-start');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('机を整える');
    expect(t!.actions).toContain('今日のタスクを 1 つ決める');
  });

  test('work-end はシャットダウンリチュアル (進捗を書く / 明日のタスクを決める) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'work-end');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('今日の進捗を書く');
    expect(t!.actions).toContain('明日のタスクを 1 つ決める');
  });

  test('journaling は振り返り (良かったこと 3 つ / 学んだこと) を含む', () => {
    const t = BUILTIN_TEMPLATE_CHAINS.find((x) => x.id === 'journaling');
    expect(t).toBeTruthy();
    expect(t!.actions).toContain('良かったことを 3 つ書く');
    expect(t!.actions).toContain('学んだことを 1 つ書く');
  });
});
