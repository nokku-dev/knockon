import { fireEvent, render } from '@testing-library/react-native';

import { AnchorEditor } from './AnchorEditor';
import type { EditableAnchorState } from './AnchorEditor';

const behaviorState: EditableAnchorState = {
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const timeState: EditableAnchorState = {
  kind: 'time',
  time: '08:15',
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const placeState: EditableAnchorState = {
  kind: 'place',
  time: null,
  latitude: 35.6586,
  longitude: 139.7454,
  radiusMeters: 100,
};

const defaults = {
  locationPermission: 'undetermined' as const,
  locating: false,
  onSetKind: () => {},
  onSetTime: () => {},
  onSetLocation: () => {},
  onSetRadius: () => {},
  onFetchLocation: async () => null,
};

describe('AnchorEditor — behavior (なし / 手動のみ) mode', () => {
  test('behavior 状態のとき時刻/場所フォームは出ず「手動トリガーのみ」が表示される', () => {
    const { getByText, queryByLabelText } = render(
      <AnchorEditor anchor={behaviorState} {...defaults} />,
    );
    expect(getByText('手動トリガーのみ')).toBeTruthy();
    expect(queryByLabelText('時')).toBeNull();
    expect(queryByLabelText('現在地を取得')).toBeNull();
  });

  test('「なし」トグル選択 → onSetKind("behavior") が呼ばれる', () => {
    const onSetKind = jest.fn();
    const { getByLabelText } = render(
      <AnchorEditor anchor={timeState} {...defaults} onSetKind={onSetKind} />,
    );
    fireEvent.press(getByLabelText('なし'));
    expect(onSetKind).toHaveBeenCalledWith('behavior');
  });
});

describe('AnchorEditor — time mode', () => {
  test('既存の時刻アンカーの値が初期表示される', () => {
    const { getByLabelText } = render(
      <AnchorEditor anchor={timeState} {...defaults} />,
    );
    expect(getByLabelText('時').props.value).toBe('08');
    expect(getByLabelText('分').props.value).toBe('15');
  });

  test('時刻入力 + blur で onSetTime が HH:MM 形式で呼ばれる', () => {
    const onSetTime = jest.fn();
    const { getByLabelText } = render(
      <AnchorEditor anchor={timeState} {...defaults} onSetTime={onSetTime} />,
    );
    fireEvent.changeText(getByLabelText('時'), '6');
    fireEvent(getByLabelText('時'), 'blur');
    expect(onSetTime).toHaveBeenCalledWith('06:15');
    fireEvent.changeText(getByLabelText('分'), '5');
    fireEvent(getByLabelText('分'), 'blur');
    expect(onSetTime).toHaveBeenLastCalledWith('06:05');
  });
});

describe('AnchorEditor — place mode', () => {
  test('place アンカーで現在地と半径が表示される', () => {
    const { getByLabelText, getByText } = render(
      <AnchorEditor anchor={placeState} {...defaults} />,
    );
    expect(getByText(/35\.6586/)).toBeTruthy();
    expect(getByLabelText('100m').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  test('場所モードに切替で kind=place を onSetKind が受け取る', () => {
    const onSetKind = jest.fn();
    const { getByLabelText } = render(
      <AnchorEditor anchor={behaviorState} {...defaults} onSetKind={onSetKind} />,
    );
    fireEvent.press(getByLabelText('場所'));
    expect(onSetKind).toHaveBeenCalledWith('place');
  });

  test('半径チップタップで onSetRadius が呼ばれる', () => {
    const onSetRadius = jest.fn();
    const { getByLabelText } = render(
      <AnchorEditor
        anchor={placeState}
        {...defaults}
        onSetRadius={onSetRadius}
      />,
    );
    fireEvent.press(getByLabelText('200m'));
    expect(onSetRadius).toHaveBeenCalledWith(200);
  });

  test('現在地取得 → onSetLocation が緯度経度で呼ばれる', async () => {
    const onSetLocation = jest.fn();
    const onFetchLocation = jest.fn(async () => ({
      latitude: 35.6586,
      longitude: 139.7454,
      accuracyMeters: 10,
    }));
    // place kind で render すれば現在地ボタンが見える (controlled なので呼出のみで kind 切替不可)
    const { getByLabelText } = render(
      <AnchorEditor
        anchor={{ ...placeState, latitude: null, longitude: null }}
        {...defaults}
        onSetLocation={onSetLocation}
        onFetchLocation={onFetchLocation}
      />,
    );
    fireEvent.press(getByLabelText('現在地を取得'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onSetLocation).toHaveBeenCalledWith(35.6586, 139.7454);
  });

  test('位置情報拒否時にフォールバック文言が表示される (place モード)', () => {
    const { getByText } = render(
      <AnchorEditor
        anchor={placeState}
        {...defaults}
        locationPermission="denied"
      />,
    );
    expect(getByText(/位置情報の権限が拒否されています/)).toBeTruthy();
  });
});
