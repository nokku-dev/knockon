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
});
