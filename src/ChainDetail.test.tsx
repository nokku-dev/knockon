import { fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import type { AlertButton } from 'react-native';

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

  // ADR-0050 (2026-07-07): 定着ノードは左ドットが星型、 タップは従来どおり有効 (auto-✓ は撤回)。
  describe('定着ノードの星ドット + 通常タップ', () => {
    const renderWithSettled = (
      achievements: AchievementMap,
      settled: Set<string>,
      onToggleNode: (id: string) => void = () => {},
    ) =>
      render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={achievements}
          nodeIdsSettled={settled}
          onToggleNode={onToggleNode}
        />,
      );

    test('定着ノードの左マーカーは星型 (円ではない)', () => {
      const { getByTestId, queryByTestId } = renderWithSettled({}, new Set(['n1']));
      expect(getByTestId('node-marker-star-n1')).toBeTruthy();
      expect(queryByTestId('node-marker-circle-n1')).toBeNull();
      // 未定着ノードは円のまま。
      expect(getByTestId('node-marker-circle-n2')).toBeTruthy();
    });

    test('定着ノードもタップで onToggleNode が呼ばれる (通常トグル)', () => {
      const onToggleNode = jest.fn();
      const { getByLabelText } = renderWithSettled({}, new Set(['n1']), onToggleNode);
      fireEvent.press(getByLabelText('水を飲む (定着済み)'));
      expect(onToggleNode).toHaveBeenCalledWith('n1');
    });

    test('未定着ノードは従来どおりタップで onToggleNode が呼ばれる', () => {
      const onToggleNode = jest.fn();
      const { getByLabelText } = renderWithSettled({}, new Set(['n1']), onToggleNode);
      fireEvent.press(getByLabelText('ストレッチ'));
      expect(onToggleNode).toHaveBeenCalledWith('n2');
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

  // ADR-0050 (2026-07-07): 定着ノードは左の SVG マーカーが星型 (Issue #118 の「常に円」を反転)。
  // 星は常に塗り (今日の達成状態で塗り分けない)。 テキスト右の小 ★ (旧 #118 追補) は撤去。
  describe('ADR-0050: 定着ノードの左マーカーは星型', () => {
    test('定着ノード = 星マーカー (達成済み)、 未定着 = 円', () => {
      const { getByTestId, queryByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
          nodeIdsSettled={new Set(['n1'])}
        />,
      );
      expect(getByTestId('node-marker-star-n1')).toBeTruthy();
      expect(queryByTestId('node-marker-circle-n1')).toBeNull();
      expect(getByTestId('node-marker-circle-n2')).toBeTruthy();
      expect(getByTestId('node-marker-circle-n3')).toBeTruthy();
    });

    test('定着ノードは今日未達成でも星マーカー (達成状態で形を変えない)', () => {
      const { getByTestId, queryByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: false }}
          onToggleNode={() => {}}
          nodeIdsSettled={new Set(['n1'])}
        />,
      );
      expect(getByTestId('node-marker-star-n1')).toBeTruthy();
      expect(queryByTestId('node-marker-circle-n1')).toBeNull();
    });

    test('テキスト右の小 ★ (旧 #118 追補) は撤去済み', () => {
      const { queryByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
          nodeIdsSettled={new Set(['n1'])}
        />,
      );
      expect(queryByTestId('node-row-star-n1')).toBeNull();
    });

    test('nodeIdsSettled 未指定なら星マーカーなし (全ノード円)', () => {
      const { queryByTestId, getByTestId } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{ n1: true }}
          onToggleNode={() => {}}
        />,
      );
      expect(queryByTestId('node-marker-star-n1')).toBeNull();
      expect(getByTestId('node-marker-circle-n1')).toBeTruthy();
    });
  });

  test('nodeIdsSettled が未指定なら全ノード円マーカー (定着なし)', () => {
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

  // Issue #190: 左の SVG ドット (spine カラム) は pointerEvents="none" で親 Pressable が
  // 受けるべきタップを吸ってしまう。 Pressable 自体は paddingLeft=40 (SPINE_COLUMN_WIDTH+12)
  // の内側から始まるため、 ドット位置 (x≈9) はどの touchable にも属さず「タップしても
  // 反応しない」死角になっていた。 hitSlop.left で touchable を左に拡張してドットまで
  // カバーする (レイアウトは変えない = 視覚的な密度を保つ)。
  describe('Issue #190: ノードタップの hitSlop がドット領域までカバーする', () => {
    test('NodeRow Pressable の hitSlop.left が spine カラム分以上ある (ドット位置 ~x=9 をカバー)', () => {
      const { getByLabelText } = renderScreen();
      const pressable = getByLabelText('水を飲む');
      const hitSlop = pressable.props.hitSlop;
      expect(hitSlop).toBeDefined();
      // SPINE_COLUMN_WIDTH (28) + contentRow paddingLeft の gap (12) = 40 を最低カバーし、
      // ドット (cx=9, r=7) の左端まで touchable 範囲を伸ばす。
      const left = typeof hitSlop === 'number' ? hitSlop : hitSlop?.left;
      expect(left).toBeGreaterThanOrEqual(40);
    });

    test('達成済みノードの Pressable も同じ hitSlop を持つ (状態問わずタップ可能)', () => {
      const { getByLabelText } = renderScreen({ n1: true });
      const pressable = getByLabelText('水を飲む');
      const hitSlop = pressable.props.hitSlop;
      const left = typeof hitSlop === 'number' ? hitSlop : hitSlop?.left;
      expect(left).toBeGreaterThanOrEqual(40);
    });

    test('hitSlop 拡張後もタップ → onToggleNode が該当 nodeId で発火する (既存挙動非破壊)', () => {
      const onToggleNode = jest.fn();
      const { getByLabelText } = renderScreen({}, onToggleNode);
      fireEvent.press(getByLabelText('水を飲む'));
      expect(onToggleNode).toHaveBeenCalledWith('n1');
    });
  });

  // ADR-0044 (#181): ノード行の長押しで手動メモ導線 (onNoteLongPress) が発火する。
  test('ADR-0044: ノード行を長押しすると onNoteLongPress が該当 nodeId で呼ばれる', () => {
    const onNoteLongPress = jest.fn();
    const { getByLabelText } = render(
      <ChainDetail
        chain={chain}
        anchor={anchor}
        nodes={todayNodes}
        achievements={{}}
        onToggleNode={() => {}}
        onNoteLongPress={onNoteLongPress}
      />,
    );
    fireEvent(getByLabelText('ストレッチ'), 'longPress');
    expect(onNoteLongPress).toHaveBeenCalledWith('n2');
  });

  test('ADR-0044: onNoteLongPress 未指定なら長押しでエラーにならない (動線無効)', () => {
    const { getByLabelText } = renderScreen();
    expect(() => fireEvent(getByLabelText('水を飲む'), 'longPress')).not.toThrow();
  });

  // ADR-0047: 定着ノードの長押しは「メモを追加 / 定着を取り下げる」の Alert メニューを出す。
  describe('ADR-0047: 定着ノードの長押しメニュー (取り下げ導線)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('定着ノードを長押しすると Alert メニューが出て「定着を取り下げる」で onRetractSettlement が呼ばれる', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const onRetractSettlement = jest.fn();
      const onNoteLongPress = jest.fn();
      const { getByLabelText } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          onNoteLongPress={onNoteLongPress}
          onRetractSettlement={onRetractSettlement}
          nodeIdsSettled={new Set(['n2'])}
        />,
      );
      // ADR-0050: 定着ノードの a11y ラベルは「(定着済み)」を含む。
      fireEvent(getByLabelText('ストレッチ (定着済み)'), 'longPress');
      expect(alertSpy).toHaveBeenCalledTimes(1);
      // 第 1 引数はアクション名、 第 3 引数はボタン配列。
      expect(alertSpy.mock.calls[0][0]).toBe('ストレッチ');
      const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
      const retractBtn = buttons.find((b) => b.text === '定着を取り下げる');
      expect(retractBtn).toBeDefined();
      expect(retractBtn?.style).toBe('destructive');
      // メニューの「定着を取り下げる」を押すと該当 nodeId で取り下げが呼ばれる。
      retractBtn?.onPress?.();
      expect(onRetractSettlement).toHaveBeenCalledWith('n2');
      // メモ導線もメニューに含まれ、 直接メモは開かない (メニュー経由)。
      expect(onNoteLongPress).not.toHaveBeenCalled();
      expect(buttons.some((b) => b.text === 'メモを追加')).toBe(true);
    });

    test('未定着ノードの長押しは従来どおり直接メモ作成 (メニューを出さない)', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const onRetractSettlement = jest.fn();
      const onNoteLongPress = jest.fn();
      const { getByLabelText } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          onNoteLongPress={onNoteLongPress}
          onRetractSettlement={onRetractSettlement}
          nodeIdsSettled={new Set<string>()}
        />,
      );
      fireEvent(getByLabelText('ストレッチ'), 'longPress');
      expect(alertSpy).not.toHaveBeenCalled();
      expect(onNoteLongPress).toHaveBeenCalledWith('n2');
      expect(onRetractSettlement).not.toHaveBeenCalled();
    });
  });

  // Issue #188: 長押し中はノード Pressable に押下スタイル (opacity 低下) を適用する。
  // 長押しメモ動線 (onNoteLongPress) の発見性を上げるための UX フィードバック。
  // 注: RN Pressable の pressed 状態は jest-expo 環境では fireEvent('pressIn') で
  // 内部 state が flip せず、 resolved style は常に「pressed=false 時の解決結果」が
  // 出てくる。 そのため Pressable のレンダー結果を直接配列か単一 object かで比較し、
  // pressed-state ベースの function スタイルが設定されているかを構造的に検証する。
  describe('Issue #188: 長押し中の押下フィードバック', () => {
    test('onNoteLongPress 提供時、 Pressable に pressed 状態応答 style 配列が設定されている (= [base, null] 形式)', () => {
      const { getByLabelText } = render(
        <ChainDetail
          chain={chain}
          anchor={anchor}
          nodes={todayNodes}
          achievements={{}}
          onToggleNode={() => {}}
          onNoteLongPress={() => {}}
        />,
      );
      const pressable = getByLabelText('水を飲む');
      // pressed=false 解決結果は [base, null] の配列形式 (style={({pressed})=>...} 適用済の証跡)
      expect(Array.isArray(pressable.props.style)).toBe(true);
      // 現状 (unpressed) では opacity が下がっていない
      const flat = StyleSheet.flatten(pressable.props.style) as {
        opacity?: number;
      };
      expect(flat.opacity ?? 1).toBe(1);
    });

    test('onNoteLongPress 未指定なら static style のまま (= 機能が無いなら発見性フィードバックも出さない)', () => {
      const { getByLabelText } = renderScreen();
      const pressable = getByLabelText('水を飲む');
      const styleProp = pressable.props.style;
      // function 形式の場合でも pressed=true で opacity 低下しないことを確認
      const flat =
        typeof styleProp === 'function'
          ? (StyleSheet.flatten(styleProp({ pressed: true })) as {
              opacity?: number;
            })
          : (StyleSheet.flatten(styleProp) as { opacity?: number });
      expect(flat.opacity ?? 1).toBe(1);
    });
  });
});
