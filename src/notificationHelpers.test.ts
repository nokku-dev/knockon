import {
  parseTimeString,
  shouldNotifyForChain,
} from './notificationHelpers';

describe('parseTimeString (Phase 1.5b-2)', () => {
  test('正常な HH:MM → { hour, minute }', () => {
    expect(parseTimeString('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseTimeString('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeString('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  test('不正フォーマット → null', () => {
    expect(parseTimeString('7:30')).toBeNull();
    expect(parseTimeString('07:3')).toBeNull();
    expect(parseTimeString('garbage')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });

  test('範囲外 → null', () => {
    expect(parseTimeString('24:00')).toBeNull();
    expect(parseTimeString('99:99')).toBeNull();
    expect(parseTimeString('-1:00')).toBeNull();
  });
});

describe('shouldNotifyForChain (Phase 1.5b-2)', () => {
  test('status=active + kind=time + 有効な time → true', () => {
    expect(
      shouldNotifyForChain(
        { status: 'active' },
        { kind: 'time', time: '07:30' },
      ),
    ).toBe(true);
  });

  test('status=stocked のチェーンは通知出さない', () => {
    expect(
      shouldNotifyForChain(
        { status: 'stocked' },
        { kind: 'time', time: '07:30' },
      ),
    ).toBe(false);
  });

  test('kind=behavior は通知出さない (時刻なし)', () => {
    expect(
      shouldNotifyForChain(
        { status: 'active' },
        { kind: 'behavior', time: null },
      ),
    ).toBe(false);
  });

  test('kind=place は通知出さない (場所アンカーは別軸)', () => {
    expect(
      shouldNotifyForChain(
        { status: 'active' },
        { kind: 'place', time: null },
      ),
    ).toBe(false);
  });

  test('kind=time だが time=null → 通知出さない', () => {
    expect(
      shouldNotifyForChain(
        { status: 'active' },
        { kind: 'time', time: null },
      ),
    ).toBe(false);
  });

  test('kind=time だが time が不正フォーマット → 通知出さない', () => {
    expect(
      shouldNotifyForChain(
        { status: 'active' },
        { kind: 'time', time: 'abc' },
      ),
    ).toBe(false);
  });
});
