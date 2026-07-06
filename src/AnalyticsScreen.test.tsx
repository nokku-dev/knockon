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
        counts={{ fresh: 0, growing: 0, settled: 0 }}
        nodes={[]}
      />,
    );
    expect(getByText(/まだ/)).toBeTruthy();
  });

  test('上部に「定着 N・育成中 M」カウントを表示 (Celebrate 主役)', () => {
    const { getByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 4, growing: 2, settled: 3 }}
        nodes={[node('c1', 'n1', 'A', 'C1', 'settled')]}
      />,
    );
    // 定着 3・育成中 2 が読み上げ可能な形で出る (fresh はカウント表示しない = 指差さない)。
    expect(getByLabelText(/定着 3/)).toBeTruthy();
    expect(getByLabelText(/育成中 2/)).toBeTruthy();
  });

  test('ステージ別にノードがグルーピング表示される (定着 / 育成中 / これから)', () => {
    const nodes = [
      node('c1', 'n1', '水を飲む', '朝', 'settled'),
      node('c1', 'n2', 'ストレッチ', '朝', 'growing'),
      node('c2', 'n3', '読書', '夜', 'fresh'),
    ];
    const { getByText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 1, growing: 1, settled: 1 }}
        nodes={nodes}
      />,
    );
    expect(getByText('水を飲む')).toBeTruthy();
    expect(getByText('ストレッチ')).toBeTruthy();
    expect(getByText('読書')).toBeTruthy();
    // グループ見出し
    expect(getByText('定着')).toBeTruthy();
    expect(getByText('育成中')).toBeTruthy();
    expect(getByText('これから')).toBeTruthy();
  });

  test('定着ノードに取り下げ導線があり、 確認後 onRetractSettlement が呼ばれる', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRetractSettlement = jest.fn();
    const { getByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 0, growing: 0, settled: 1 }}
        nodes={[node('c1', 'n1', '水を飲む', '朝', 'settled')]}
        onRetractSettlement={onRetractSettlement}
      />,
    );
    fireEvent.press(getByLabelText('水を飲む の定着を取り下げる'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirm = buttons.find((b) => b.style === 'destructive');
    expect(confirm).toBeDefined();
    confirm?.onPress?.();
    expect(onRetractSettlement).toHaveBeenCalledWith('c1', 'n1');
    alertSpy.mockRestore();
  });

  test('育成中 / これからノードには取り下げ導線を出さない', () => {
    const onRetractSettlement = jest.fn();
    const { queryByLabelText } = render(
      <AnalyticsScreen
        today="2026-07-06"
        counts={{ fresh: 1, growing: 1, settled: 0 }}
        nodes={[
          node('c1', 'n2', 'ストレッチ', '朝', 'growing'),
          node('c2', 'n3', '読書', '夜', 'fresh'),
        ]}
        onRetractSettlement={onRetractSettlement}
      />,
    );
    expect(queryByLabelText(/を取り下げる/)).toBeNull();
  });
});
