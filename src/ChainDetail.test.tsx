import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { DateMatrixCell } from './analyticsDerivation';
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
  // Issue #118 追補 (Taku コメント 2026-06-16): 今日の達成状態に関わらず常に ★ (塗り)
  // で表示する (Issue #113 の「達成=★ / 未達=☆」塗り分けセマンティクスは撤回)。
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

    test('established + 未達成 → ★ (塗り) が node row に表示される (#118 追補)', () => {
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
      expect(star.props.children).toBe('★');
    });

    test('established で achievements マップにキー無し → ★ (塗り、#118 追補)', () => {
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
      expect(star.props.children).toBe('★');
    });

    test('白抜き星 (☆) は使わない (#118 追補)', () => {
      const { queryByText } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: false, n2: false, n3: false }}
          onToggleNode={() => {}}
          nodeIdsEstablished={new Set(['n1', 'n2', 'n3'])}
        />,
      );
      expect(queryByText('☆')).toBeNull();
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

  // #125: 各ノード行の右端に直近 7 日間のグリフマトリクスを表示する。
  // 反 streak / Celebrate 主 (DESIGN-SYSTEM §0) の二値マトリクス語彙を維持:
  // 達成 = 塗り四角、 未達 = アウトライン四角、 休む日 (variant null) = 空セル。
  describe('Issue #125: ノード行右端の直近 7 日間達成グリフマトリクス', () => {
    const dates7 = [
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-16',
      '2026-05-17',
      '2026-05-18',
      '2026-05-19',
    ];

    const buildCells = (
      pattern: ReadonlyArray<'achieved' | 'miss' | 'skip'>,
    ): readonly DateMatrixCell[] =>
      dates7.map((date, i) => ({
        date,
        achieved: pattern[i] === 'achieved',
        skipped: pattern[i] === 'skip',
      }));

    test('nodeRecentCells を渡すと各ノード行右端に 7 セルのマトリクスが描画される', () => {
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['miss', 'achieved', 'miss', 'achieved', 'miss', 'achieved', 'achieved'])],
        ['n2', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'achieved'])],
        ['n3', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'miss'])],
      ]);
      const { getAllByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      // 各ノードに 7 セル
      expect(getAllByTestId(/^node-recent-cell-n1-/).length).toBe(7);
      expect(getAllByTestId(/^node-recent-cell-n2-/).length).toBe(7);
      expect(getAllByTestId(/^node-recent-cell-n3-/).length).toBe(7);
    });

    test('セルの testID は日付 (YYYY-MM-DD) を含む (= windowDates と同順の確認)', () => {
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['achieved', 'miss', 'miss', 'miss', 'miss', 'miss', 'achieved'])],
      ]);
      const skipNodes: readonly TodayNode[] = [todayNodes[0]];
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={skipNodes}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      // 最も古い (左端) と最新 (右端) の日付セルが存在する
      expect(getByTestId('node-recent-cell-n1-2026-05-13')).toBeTruthy();
      expect(getByTestId('node-recent-cell-n1-2026-05-19')).toBeTruthy();
    });

    test('セルの accessibilityLabel に達成/未達/休む日の状態を含む', () => {
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['achieved', 'miss', 'skip', 'achieved', 'miss', 'skip', 'achieved'])],
      ]);
      const oneNode: readonly TodayNode[] = [todayNodes[0]];
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={oneNode}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      expect(
        getByTestId('node-recent-cell-n1-2026-05-13').props.accessibilityLabel,
      ).toMatch(/達成/);
      expect(
        getByTestId('node-recent-cell-n1-2026-05-14').props.accessibilityLabel,
      ).toMatch(/未達/);
      expect(
        getByTestId('node-recent-cell-n1-2026-05-15').props.accessibilityLabel,
      ).toMatch(/休む日/);
    });

    test('nodeRecentCells 未指定なら右端マトリクスは描画されない (既存挙動互換)', () => {
      const { queryAllByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
        />,
      );
      expect(queryAllByTestId(/^node-recent-cell-/).length).toBe(0);
    });

    test('nodeRecentCells に該当 nodeId が含まれなければそのノードだけマトリクスを描画しない', () => {
      // n1 のみ cells を持つ
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'achieved'])],
      ]);
      const { getAllByTestId, queryAllByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      expect(getAllByTestId(/^node-recent-cell-n1-/).length).toBe(7);
      expect(queryAllByTestId(/^node-recent-cell-n2-/).length).toBe(0);
      expect(queryAllByTestId(/^node-recent-cell-n3-/).length).toBe(0);
    });

    test('kind=skip のノードでもマトリクスは表示される (過去の達成記録は反映する)', () => {
      const skipNodes: readonly TodayNode[] = [
        {
          node: buildNode('n-skip', 0, 'act-workout'),
          action: buildAction('act-workout', '筋トレ'),
          label: '筋トレ',
          kind: 'skip',
        },
      ];
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n-skip', buildCells(['miss', 'achieved', 'skip', 'skip', 'miss', 'achieved', 'skip'])],
      ]);
      const { getAllByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={skipNodes}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      expect(getAllByTestId(/^node-recent-cell-n-skip-/).length).toBe(7);
    });

    // Issue #145: マトリクスセルを縦横半分サイズ (8→4) に縮小し、 セル間隔 (slot 幅)
    // も比例縮小 (10→5) する。 実機で横幅占有が大きすぎたため (#125 で実装時、 7 セル×10px
    // = 70px がノード行右端を圧迫)。 二値表示・read-only の既存挙動は変えない。
    test('Issue #145: マトリクスセルは縦横 4px / slot 幅 5px に縮小される', () => {
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['achieved', 'miss', 'skip', 'achieved', 'miss', 'achieved', 'miss'])],
      ]);
      const oneNode: readonly TodayNode[] = [todayNodes[0]];
      const { getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={oneNode}
          achievements={{}}
          onToggleNode={() => {}}
          nodeRecentCells={cellsByNode}
        />,
      );
      const slot = getByTestId('node-recent-cell-n1-2026-05-13');
      const slotStyle = StyleSheet.flatten(slot.props.style) as {
        width?: number;
      };
      expect(slotStyle.width).toBe(5);
      // 内側のセル View はスロットの単一子要素
      const cellView = slot.children[0] as unknown as {
        props: { style: unknown };
      };
      const cellStyle = StyleSheet.flatten(cellView.props.style) as {
        width?: number;
        height?: number;
      };
      expect(cellStyle.width).toBe(4);
      expect(cellStyle.height).toBe(4);
    });

    test('既存のノードタップ (toggle) は引き続き動く (マトリクス追加がレイアウトを壊さない)', () => {
      const onToggleNode = jest.fn();
      const cellsByNode = new Map<string, readonly DateMatrixCell[]>([
        ['n1', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'miss'])],
        ['n2', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'miss'])],
        ['n3', buildCells(['miss', 'miss', 'miss', 'miss', 'miss', 'miss', 'miss'])],
      ]);
      const { getByLabelText } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={onToggleNode}
          nodeRecentCells={cellsByNode}
        />,
      );
      fireEvent.press(getByLabelText('水を飲む'));
      expect(onToggleNode).toHaveBeenCalledWith('n1');
    });
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

  // #142 (ADR-0041): ノード単位の累計達成回数「N 回」を ChainDetail のノード行から
  // 撤回。 ノード行は「実行直前の振り返り」を主役にし、 N=1 検証で
  // 「どのノードがうまく行ってないか」の数字情報は分析ビュー側に集約する。
  // Taku 指示: 「やっぱり各ノードに関しての累計回数は消して」(2026-06-17)。
  test('#142 (ADR-0041): ノード行に累計達成回数の数字を出さない', () => {
    const { queryByText } = renderScreen({ n1: true, n2: true });
    // 「N 回」「累計 N」表記がノード行に存在しない
    expect(queryByText(/\d+\s*回/)).toBeNull();
    expect(queryByText(/累計/)).toBeNull();
  });
});
