import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';

import { AnalyticsScreen } from './AnalyticsScreen';
import type { SettlementPortfolioNode } from './useAnalyticsData';

// ADR-0047: ログ画面を「達成率ダッシュボード」から「定着ポートフォリオ」へ組み替え。
// 上部に「定着 N・育成中 M」カウント (単調増加の Celebrate 主役)、 本体はステージ別
// (定着 / 育成中 / これから) グルーピング一覧。 達成率グラフ (= 比率) は撤去。

const node = (
  chainId: string,
  nodeId: string,
  actionTitle: string,
  chainTitle: string,
  stage: SettlementPortfolioNode['stage'],
): SettlementPortfolioNode => ({
  chainId,
  nodeId,
  actionTitle,
  chainTitle,
  stage,
});

describe('AnalyticsScreen (定着ポートフォリオ ADR-0047)', () => {
  test('ノード 0 件 → 空メッセージ表示', () => {
    const { getByText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, almost: 0, settled: 0 }}
        nodes={[]}
      />,
    );
    expect(getByText(/まだ/)).toBeTruthy();
  });

  test('上部に「定着 N・育成中 M」カウントを表示 (Celebrate 主役)', () => {
    const { getByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 4, growing: 2, almost: 0, settled: 3 }}
        nodes={[node('c1', 'n1', 'A', 'C1', 'settled')]}
      />,
    );
    // 定着 3・育成中 2 が読み上げ可能な形で出る (fresh はカウント表示しない = 指差さない)。
    expect(getByLabelText(/定着 3/)).toBeTruthy();
    expect(getByLabelText(/育成中 2/)).toBeTruthy();
  });

  test('ステージ別の見出しは常に表示され、 初期は全グループ畳まれている (ノード非表示)', () => {
    const nodes = [
      node('c1', 'n1', '水を飲む', '朝', 'settled'),
      node('c1', 'n2', 'ストレッチ', '朝', 'growing'),
      node('c2', 'n3', '読書', '夜', 'fresh'),
    ];
    const { getByText, queryByText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 1, growing: 1, almost: 0, settled: 1 }}
        nodes={nodes}
      />,
    );
    // グループ見出しは常に表示
    expect(getByText('定着')).toBeTruthy();
    expect(getByText('育成中')).toBeTruthy();
    expect(getByText('これから')).toBeTruthy();
    // 初期は全畳み → ノード本体は非表示
    expect(queryByText('水を飲む')).toBeNull();
    expect(queryByText('ストレッチ')).toBeNull();
    expect(queryByText('読書')).toBeNull();
  });

  test('見出しタップでそのグループが開き、 再タップで畳める', () => {
    const nodes = [node('c1', 'n1', '水を飲む', '朝', 'settled')];
    const { getByTestId, queryByText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, almost: 0, settled: 1 }}
        nodes={nodes}
      />,
    );
    expect(queryByText('水を飲む')).toBeNull();
    fireEvent.press(getByTestId('portfolio-group-settled'));
    expect(queryByText('水を飲む')).toBeTruthy();
    fireEvent.press(getByTestId('portfolio-group-settled'));
    expect(queryByText('水を飲む')).toBeNull();
  });

  test('定着ノードに取り下げ導線があり、 確認後 onRetractSettlement が呼ばれる', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRetractSettlement = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, almost: 0, settled: 1 }}
        nodes={[node('c1', 'n1', '水を飲む', '朝', 'settled')]}
        onRetractSettlement={onRetractSettlement}
      />,
    );
    // 初期は畳まれているので、 定着グループを開いてから取り下げボタンを押す。
    fireEvent.press(getByTestId('portfolio-group-settled'));
    fireEvent.press(getByLabelText('水を飲む の定着を取り下げる'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirm = buttons.find((b) => b.style === 'destructive');
    expect(confirm).toBeDefined();
    confirm?.onPress?.();
    expect(onRetractSettlement).toHaveBeenCalledWith('c1', 'n1');
    alertSpy.mockRestore();
  });

  test('育成中 / これからノードには取り下げ導線を出さない (開いても出ない)', () => {
    const onRetractSettlement = jest.fn();
    const { queryByLabelText, getByTestId } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 1, growing: 1, almost: 0, settled: 0 }}
        nodes={[
          node('c1', 'n2', 'ストレッチ', '朝', 'growing'),
          node('c2', 'n3', '読書', '夜', 'fresh'),
        ]}
        onRetractSettlement={onRetractSettlement}
      />,
    );
    // グループを開いても育成中 / これからには取り下げボタンが無いこと。
    fireEvent.press(getByTestId('portfolio-group-growing'));
    fireEvent.press(getByTestId('portfolio-group-fresh'));
    expect(queryByLabelText(/を取り下げる/)).toBeNull();
  });

  // ADR-0047 追補 (2026-07-07): もう少しで定着ステージ + 週次流入。
  test('「もう少しで定着」グループが表示され、 開くとノードが出る', () => {
    const { getByText, getByTestId, queryByText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, almost: 1, settled: 0 }}
        nodes={[node('c1', 'n1', 'ランニング', '朝', 'almost')]}
      />,
    );
    expect(getByText('もう少しで定着')).toBeTruthy();
    expect(queryByText('ランニング')).toBeNull(); // 初期は畳み
    fireEvent.press(getByTestId('portfolio-group-almost'));
    expect(queryByText('ランニング')).toBeTruthy();
  });

  test('上部カウントに「もう少しで定着 P」を含む', () => {
    const { getByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 1, almost: 2, settled: 3 }}
        nodes={[node('c1', 'n1', 'A', 'C1', 'settled')]}
      />,
    );
    expect(getByLabelText(/もう少しで定着 2/)).toBeTruthy();
  });

  test('週次流入: 定着入り・もう少しで定着入りの個数を表示 (流入 > 0 のとき)', () => {
    const { getByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, almost: 1, settled: 1 }}
        movements={{ intoSettled: 2, intoAlmost: 3 }}
        nodes={[node('c1', 'n1', 'A', 'C1', 'settled')]}
      />,
    );
    expect(getByLabelText('今週 定着入り 2・もう少しで定着入り 3')).toBeTruthy();
  });

  test('週次流入が両方 0 なら流入行は出さない (0 を指差さない)', () => {
    const { queryByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 1, growing: 0, almost: 0, settled: 0 }}
        movements={{ intoSettled: 0, intoAlmost: 0 }}
        nodes={[node('c1', 'n1', 'A', 'C1', 'fresh')]}
      />,
    );
    expect(queryByLabelText(/今週/)).toBeNull();
  });
});
