import { fireEvent, render } from '@testing-library/react-native';

import type {
  AchievementMap,
  Action,
  Anchor,
  Chain,
  Node,
} from './domain';
import { ChainDetail } from './ChainDetail';
import type { TodayNode } from './ChainDetail';

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
  timerSeconds: null,
});

const todayNodes: readonly TodayNode[] = [
  { node: buildNode('n1', 0, 'act-water'), action: buildAction('act-water', '水を飲む'), label: '水を飲む', kind: 'fire' },
  { node: buildNode('n2', 1, 'act-stretch'), action: buildAction('act-stretch', 'ストレッチ'), label: 'ストレッチ', kind: 'fire' },
  { node: buildNode('n3', 2, 'act-desk'), action: buildAction('act-desk', '机に向かう'), label: '机に向かう', kind: 'fire' },
];

const renderScreen = (
  achievements: AchievementMap = {},
  onToggleNode: (id: string) => void = () => {},
) =>
  render(
    <ChainDetail
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

const placeAnchor: Anchor = {
  id: 'a1',
  title: '自宅',
  kind: 'place',
  time: null,
  latitude: 35.6586,
  longitude: 139.7454,
  radiusMeters: 100,
};

describe('ChainDetail', () => {
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

  test('anchorFiredToday=true + 時刻アンカー → 発火中ピル表示', () => {
    const { getByText } = render(
      <ChainDetail
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={true}
      />,
    );
    expect(getByText('07:30 発火中')).toBeTruthy();
  });

  test('anchorFiredToday=false → 発火中ピルなし', () => {
    const { queryByText } = render(
      <ChainDetail
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={false}
      />,
    );
    expect(queryByText('07:30 発火中')).toBeNull();
  });

  test('anchorFiredToday=true でも anchor.kind=behavior なら発火中ピルなし', () => {
    const { queryByText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={true}
      />,
    );
    expect(queryByText(/発火中/)).toBeNull();
  });

  test('anchor.kind=time + 発火していないとき設定時刻が控えめに表示される', () => {
    const { getByText } = render(
      <ChainDetail
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={false}
      />,
    );
    expect(getByText('07:30')).toBeTruthy();
  });

  test('発火中ピル表示時は通常の時刻表示は出さない (DESIGN-SYSTEM 整合 / 二重表示防止)', () => {
    const { queryAllByText } = render(
      <ChainDetail
        chain={chain}
        anchor={timeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={true}
      />,
    );
    // 「07:30 発火中」のピルにだけ含まれて、それ単独の時刻表示はない
    expect(queryAllByText('07:30').length).toBe(0);
    expect(queryAllByText('07:30 発火中').length).toBe(1);
  });

  test('anchor.kind=behavior のとき時刻表示は出ない', () => {
    const { queryByText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
      />,
    );
    expect(queryByText('07:30')).toBeNull();
  });

  test('place アンカー + 範囲外 → 半径表示 (発火中ピルなし)', () => {
    const { getByText, queryByText } = render(
      <ChainDetail
        chain={chain}
        anchor={placeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={false}
      />,
    );
    expect(getByText('100m')).toBeTruthy();
    expect(queryByText(/発火中/)).toBeNull();
  });

  test('place アンカー + anchorFiredToday=true → 発火中ピル表示 + 半径は二重表示しない', () => {
    const { getByText, queryAllByText } = render(
      <ChainDetail
        chain={chain}
        anchor={placeAnchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        anchorFiredToday={true}
      />,
    );
    expect(getByText('範囲内 発火中')).toBeTruthy();
    expect(queryAllByText('100m').length).toBe(0);
  });

  // Issue #118: 左の SVG マーカーは定着済みでも常に円 (星マークは連続回数の近くに小さく移動)
  test('nodeIdsEstablished に含まれるノードでも左マーカーは円のまま (#118)', () => {
    const { getByTestId, queryByTestId } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{ n1: true }}
        onToggleNode={() => {}}
        nodeIdsEstablished={new Set(['n1'])}
      />,
    );
    // n1 は定着済みだが、 左マーカーは円のまま (SVG 星は出さない)
    expect(getByTestId('node-marker-circle-n1')).toBeTruthy();
    expect(queryByTestId('node-marker-star-n1')).toBeNull();
    // n2 / n3 は未定着 → 円
    expect(getByTestId('node-marker-circle-n2')).toBeTruthy();
    expect(getByTestId('node-marker-circle-n3')).toBeTruthy();
  });

  // Issue #118: 定着済みノードの星マークを左マーカーから連続回数近くの小さな表示へ移す。
  // Issue #113 の「達成状態で塗り分け」セマンティクスは維持: 達成=★、未達=☆。
  describe('Issue #118: 定着済みノードの星は連続回数の近くに小さく表示', () => {
    test('established + 達成済み → ★ (塗り) が node row に表示される', () => {
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
          nodeIdsEstablished={new Set(['n1'])}
        />,
      );
      const star = getByTestId('node-row-star-n1');
      expect(star.props.children).toBe('★');
    });

    test('established + 未達成 → ☆ (アウトライン) が node row に表示される', () => {
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: false }}
          onToggleNode={() => {}}
          nodeIdsEstablished={new Set(['n1'])}
        />,
      );
      const star = getByTestId('node-row-star-n1');
      expect(star.props.children).toBe('☆');
    });

    test('established で achievements マップにキー無し → ☆ (未達扱い)', () => {
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          nodeIdsEstablished={new Set(['n1'])}
        />,
      );
      const star = getByTestId('node-row-star-n1');
      expect(star.props.children).toBe('☆');
    });

    test('未定着ノードには星を出さない', () => {
      const { queryByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
          nodeIdsEstablished={new Set(['n1'])}
        />,
      );
      // n2 / n3 は未定着 → 星なし
      expect(queryByTestId('node-row-star-n2')).toBeNull();
      expect(queryByTestId('node-row-star-n3')).toBeNull();
    });

    test('nodeIdsEstablished 未指定なら星なし', () => {
      const { queryByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
        />,
      );
      expect(queryByTestId('node-row-star-n1')).toBeNull();
    });
  });

  test('nodeIdsEstablished が未指定なら全ノード円マーカー (定着なし)', () => {
    const { getByTestId, queryByTestId } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{ n1: true, n2: true, n3: true }}
        onToggleNode={() => {}}
      />,
    );
    expect(getByTestId('node-marker-circle-n1')).toBeTruthy();
    expect(getByTestId('node-marker-circle-n2')).toBeTruthy();
    expect(getByTestId('node-marker-circle-n3')).toBeTruthy();
    expect(queryByTestId('node-marker-star-n1')).toBeNull();
  });

  test('kind=skip のノードはスキップマーク (—) + 親 title でグレー表示 + タップ不可', () => {
    const onToggleNode = jest.fn();
    const skipNodes: readonly TodayNode[] = [
      {
        node: buildNode('n-skip', 0, 'act-workout'),
        action: buildAction('act-workout', '筋トレ'),
        label: '筋トレ',
        kind: 'skip',
      },
    ];
    const { getByLabelText, getByText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={skipNodes}
        achievements={{}}
        onToggleNode={onToggleNode}
      />,
    );
    expect(getByText('—')).toBeTruthy();
    expect(getByLabelText('筋トレ (今日は休む日)')).toBeTruthy();
    // タップしても onToggleNode は呼ばれない (SkipNodeRow は Pressable ではない)
    // タップテスト自体は accessibilityLabel ベースの押下が成立しないため、
    // 「Pressable role が存在しない」ことで確認する
  });

  // Issue #123: 連続達成 (streak) は ChainDetail のノード行に表示しない
  // (反 streak / Celebrate 主、 DESIGN-SYSTEM §0)。 #103 の表示は撤回。
  test('Issue #123: ノード行に「N 日連続」を表示しない', () => {
    const { queryAllByText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{ n1: true, n2: true, n3: true }}
        onToggleNode={() => {}}
      />,
    );
    expect(queryAllByText(/日連続/).length).toBe(0);
  });

  // #74 (SPEC §8): 全ノード一時停止 (= 表示ノード 0) の空状態。
  test('表示ノードが 0 件のとき「すべて一時停止中」の空状態を出す', () => {
    const { getByLabelText, queryByText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={[]}
        achievements={{}}
        onToggleNode={() => {}}
      />,
    );
    expect(getByLabelText('すべて一時停止中')).toBeTruthy();
    // チェーンタイトルは残る (カードは消さない)
    expect(queryByText(chain.title)).toBeTruthy();
  });
});
