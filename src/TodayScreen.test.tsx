import { fireEvent, render } from '@testing-library/react-native';

import type {
  AchievementMap,
  Action,
  Anchor,
  Chain,
  Node,
} from './domain';
import { TodayScreen } from './TodayScreen';
import type { TodayNode } from './TodayScreen';

const anchor: Anchor = {
  id: 'a1',
  title: '起床',
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const chain: Chain = {
  id: 'c1',
  title: '朝のルーティン',
  anchorId: anchor.id,
  status: 'active',
  createdAt: '2026-05-18T00:00:00Z',
};

const buildNode = (id: string, orderIndex: number, actionId: string): Node => ({
  id,
  chainId: chain.id,
  orderIndex,
  kind: 'action',
  actionId,
});

const buildAction = (id: string, title: string): Action => ({
  id,
  title,
  variants: null,
});

const todayNodes: readonly TodayNode[] = [
  { node: buildNode('n1', 0, 'act-water'), action: buildAction('act-water', '水を飲む') },
  { node: buildNode('n2', 1, 'act-stretch'), action: buildAction('act-stretch', 'ストレッチ') },
  { node: buildNode('n3', 2, 'act-desk'), action: buildAction('act-desk', '机に向かう') },
];

const renderScreen = (
  achievements: AchievementMap = {},
  onToggleNode: (id: string) => void = () => {},
) =>
  render(
    <TodayScreen
      chain={chain}
      anchor={anchor}
      nodes={todayNodes}
      achievements={achievements}
      onToggleNode={onToggleNode}
    />,
  );

const timeAnchor: Anchor = {
  id: 'a1',
  title: '起床',
  kind: 'time',
  time: '07:30',
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

describe('TodayScreen', () => {
  test('起点アンカー・チェーンタイトル・ノード列が表示される', () => {
    const { getByText } = renderScreen();
    expect(getByText('起床')).toBeTruthy();
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('水を飲む')).toBeTruthy();
    expect(getByText('ストレッチ')).toBeTruthy();
    expect(getByText('机に向かう')).toBeTruthy();
  });

  test('ノードをタップすると onToggleNode が該当 nodeId で呼ばれる', () => {
    const onToggleNode = jest.fn();
    const { getByLabelText } = renderScreen({}, onToggleNode);
    fireEvent.press(getByLabelText('水を飲む'));
    expect(onToggleNode).toHaveBeenCalledTimes(1);
    expect(onToggleNode).toHaveBeenCalledWith('n1');
  });

  test('未達ノードは accessibilityState.checked が false', () => {
    const { getByLabelText } = renderScreen({});
    expect(getByLabelText('水を飲む').props.accessibilityState).toEqual({
      checked: false,
    });
  });

  test('達成済みノードは accessibilityState.checked が true', () => {
    const { getByLabelText } = renderScreen({ n1: true });
    expect(getByLabelText('水を飲む').props.accessibilityState).toEqual({
      checked: true,
    });
  });

  test('飛ばし達成 (n1 と n3 のみ) でも各ノード独立にチェック状態を持つ (ゆるい連鎖判定)', () => {
    const { getByLabelText } = renderScreen({ n1: true, n3: true });
    expect(getByLabelText('水を飲む').props.accessibilityState.checked).toBe(true);
    expect(getByLabelText('ストレッチ').props.accessibilityState.checked).toBe(false);
    expect(getByLabelText('机に向かう').props.accessibilityState.checked).toBe(true);
  });

  test('timeAnchorFiringNow=true + 時刻アンカー → 発火中ピル表示', () => {
    const { getByText } = render(
      <TodayScreen
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        timeAnchorFiringNow={true}
      />,
    );
    expect(getByText('07:30 発火中')).toBeTruthy();
  });

  test('timeAnchorFiringNow=false → 発火中ピルなし', () => {
    const { queryByText } = render(
      <TodayScreen
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        timeAnchorFiringNow={false}
      />,
    );
    expect(queryByText('07:30 発火中')).toBeNull();
  });

  test('timeAnchorFiringNow=true でも anchor.kind=behavior なら発火中ピルなし', () => {
    const { queryByText } = render(
      <TodayScreen
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        timeAnchorFiringNow={true}
      />,
    );
    expect(queryByText(/発火中/)).toBeNull();
  });

  test('anchor.kind=time のとき設定時刻が控えめに表示される (発火していなくても)', () => {
    const { getByText } = render(
      <TodayScreen
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        timeAnchorFiringNow={false}
      />,
    );
    expect(getByText('07:30')).toBeTruthy();
  });

  test('anchor.kind=behavior のとき時刻表示は出ない', () => {
    const { queryByText } = render(
      <TodayScreen
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
      />,
    );
    expect(queryByText('07:30')).toBeNull();
  });
});
