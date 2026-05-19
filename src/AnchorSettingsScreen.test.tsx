import { fireEvent, render } from '@testing-library/react-native';

import { AnchorSettingsScreen } from './AnchorSettingsScreen';
import type { Anchor, Chain } from './domain';

const chain: Chain = {
  id: 'c1',
  title: '朝のルーティン',
  anchorId: 'a1',
  status: 'active',
  createdAt: '2026-05-19T00:00:00Z',
};

const behaviorAnchor: Anchor = {
  id: 'a1',
  title: '起床',
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const timeAnchor: Anchor = {
  ...behaviorAnchor,
  kind: 'time',
  time: '08:15',
};

const placeAnchor: Anchor = {
  ...behaviorAnchor,
  kind: 'place',
  latitude: 35.6586,
  longitude: 139.7454,
  radiusMeters: 100,
};

const defaults = {
  saving: false,
  locationPermission: 'undetermined' as const,
  locating: false,
  onCancel: () => {},
  onSaveTime: () => {},
  onSavePlace: () => {},
  onFetchLocation: async () => null,
};

describe('AnchorSettingsScreen — time kind', () => {
  test('既存の時刻アンカーから開くと time モード + 値が初期値に入る', () => {
    const { getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={timeAnchor} {...defaults} />,
    );
    expect(getByLabelText('時').props.value).toBe('08');
    expect(getByLabelText('分').props.value).toBe('15');
  });

  test('behavior アンカーから開くと time モードで 07:30 デフォルト', () => {
    const { getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={behaviorAnchor} {...defaults} />,
    );
    expect(getByLabelText('時').props.value).toBe('07');
    expect(getByLabelText('分').props.value).toBe('30');
  });

  test('保存ボタンタップで onSaveTime が HH:MM 形式で呼ばれる', () => {
    const onSaveTime = jest.fn();
    const { getByText, getByLabelText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        onSaveTime={onSaveTime}
      />,
    );
    fireEvent.changeText(getByLabelText('時'), '6');
    fireEvent(getByLabelText('時'), 'blur');
    fireEvent.changeText(getByLabelText('分'), '5');
    fireEvent(getByLabelText('分'), 'blur');
    fireEvent.press(getByText('保存'));
    expect(onSaveTime).toHaveBeenCalledWith('06:05');
  });

  test('キャンセルタップで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('saving=true のとき保存ボタンは「保存中…」表示', () => {
    const { getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        saving={true}
      />,
    );
    expect(getByText('保存中…')).toBeTruthy();
  });
});

describe('AnchorSettingsScreen — place kind', () => {
  test('既存の場所アンカーから開くと place モード + 値が初期値に入る', () => {
    const { getByText, getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={placeAnchor} {...defaults} />,
    );
    expect(getByText('起点アンカーを場所に設定')).toBeTruthy();
    // 半径 100m が選択されている
    expect(getByLabelText('100m').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  test('time → place トグルでタイトルが切り替わる', () => {
    const { getByText, getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={behaviorAnchor} {...defaults} />,
    );
    expect(getByText('起点アンカーを時刻に設定')).toBeTruthy();
    fireEvent.press(getByLabelText('場所'));
    expect(getByText('起点アンカーを場所に設定')).toBeTruthy();
  });

  test('place モード + 現在地未取得のとき保存ボタンが disabled', () => {
    const { getByText, getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={behaviorAnchor} {...defaults} />,
    );
    fireEvent.press(getByLabelText('場所'));
    // 起床 (behavior) から place に切り替えただけでは座標がない
    expect(getByText('未取得')).toBeTruthy();
    expect(getByText('保存').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#5A5A60' })]),
    );
  });

  test('現在地取得 → 保存で onSavePlace が呼ばれる', async () => {
    const onSavePlace = jest.fn();
    const onFetchLocation = jest.fn(async () => ({
      latitude: 35.6586,
      longitude: 139.7454,
      accuracyMeters: 10,
    }));
    const { getByLabelText, getByText, findByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        onSavePlace={onSavePlace}
        onFetchLocation={onFetchLocation}
      />,
    );
    fireEvent.press(getByLabelText('場所'));
    fireEvent.press(getByLabelText('現在地を取得'));
    await findByText(/35\.6586/);
    fireEvent.press(getByText('保存'));
    expect(onSavePlace).toHaveBeenCalledWith({
      latitude: 35.6586,
      longitude: 139.7454,
      radiusMeters: 100,
    });
  });

  test('半径選択チップ (50/100/200) で radius が切り替わる', async () => {
    const onSavePlace = jest.fn();
    const onFetchLocation = jest.fn(async () => ({
      latitude: 35.6586,
      longitude: 139.7454,
      accuracyMeters: 10,
    }));
    const { getByLabelText, getByText, findByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        onSavePlace={onSavePlace}
        onFetchLocation={onFetchLocation}
      />,
    );
    fireEvent.press(getByLabelText('場所'));
    fireEvent.press(getByLabelText('現在地を取得'));
    await findByText(/35\.6586/);
    fireEvent.press(getByLabelText('200m'));
    fireEvent.press(getByText('保存'));
    expect(onSavePlace).toHaveBeenCalledWith(
      expect.objectContaining({ radiusMeters: 200 }),
    );
  });

  test('位置情報拒否時にフォールバック文言が表示される', () => {
    const { getByLabelText, getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        {...defaults}
        locationPermission="denied"
      />,
    );
    fireEvent.press(getByLabelText('場所'));
    expect(
      getByText(/位置情報の権限が拒否されています/),
    ).toBeTruthy();
  });
});

describe('AnchorSettingsScreen — kind 切替時に前回値を保持', () => {
  // 時刻と場所両方の値が DB に残っている状況 (kind=place / time も保持)
  const placeWithTime: Anchor = {
    id: 'a1',
    title: '起床',
    kind: 'place',
    time: '08:15', // 前回 time モードで保存した値
    latitude: 35.6586,
    longitude: 139.7454,
    radiusMeters: 200,
  };

  test('現在 kind=place でも time モードに切り替えると前回時刻が初期値', () => {
    const { getByLabelText } = render(
      <AnchorSettingsScreen chain={chain} anchor={placeWithTime} {...defaults} />,
    );
    fireEvent.press(getByLabelText('時刻'));
    expect(getByLabelText('時').props.value).toBe('08');
    expect(getByLabelText('分').props.value).toBe('15');
  });

  test('現在 kind=time でも place モードに切り替えると前回座標 + 半径が初期値', () => {
    const timeWithPlace: Anchor = {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '08:15',
      latitude: 35.6586,
      longitude: 139.7454,
      radiusMeters: 200,
    };
    const { getByLabelText, getByText } = render(
      <AnchorSettingsScreen chain={chain} anchor={timeWithPlace} {...defaults} />,
    );
    fireEvent.press(getByLabelText('場所'));
    // 緯度経度が表示される (未取得ではない)
    expect(getByText(/35\.6586/)).toBeTruthy();
    // 200m が選択されている
    expect(getByLabelText('200m').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
