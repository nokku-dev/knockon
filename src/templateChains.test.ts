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
});
