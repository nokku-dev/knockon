import { fireEvent, render } from '@testing-library/react-native';

import { DayDetailSection } from './DayDetailSection';
import type { DayDetail } from './useDayDetail';

// 2026-05-18 = 月曜。dates は昇順 3 日分でテスト。
const dates = ['2026-05-16', '2026-05-17', '2026-05-18'];

const detail: DayDetail = {
  date: '2026-05-18',
  chains: [
    {
      chainId: 'c1',
      chainTitle: '朝のルーティン',
      anchorTitle: '起床',
      anchorFired: true,
      nodes: [
        { nodeId: 'n1', label: '歯磨き', achieved: true, skipped: false },
        { nodeId: 'n2', label: '白湯', achieved: false, skipped: false },
        { nodeId: 'n3', label: '筋トレ', achieved: false, skipped: true },
      ],
    },
  ],
  metrics: [{ key: 'weight', label: '体重', unit: 'kg', value: 62.5 }],
};

const baseProps = {
  dates,
  selectedDate: '2026-05-18',
  today: '2026-05-18',
  detail,
  onSelectDate: () => {},
};

describe('DayDetailSection (#63)', () => {
  test('日付チップが並び、今日ラベルが出る', () => {
    const { getByLabelText, getByText } = render(
      <DayDetailSection {...baseProps} />,
    );
    expect(getByLabelText('5/16 の記録を見る')).toBeTruthy();
    expect(getByLabelText('5/18 の記録を見る')).toBeTruthy();
    expect(getByText('今日')).toBeTruthy();
  });

  test('日付タップで onSelectDate が該当日で呼ばれる', () => {
    const onSelectDate = jest.fn();
    const { getByLabelText } = render(
      <DayDetailSection {...baseProps} onSelectDate={onSelectDate} />,
    );
    fireEvent.press(getByLabelText('5/16 の記録を見る'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-05-16');
  });

  test('選んだ日のノード状態を達成/未達/休む日で出し分ける', () => {
    const { getByLabelText } = render(<DayDetailSection {...baseProps} />);
    expect(getByLabelText('歯磨き 達成')).toBeTruthy();
    expect(getByLabelText('白湯 未達')).toBeTruthy();
    expect(getByLabelText('筋トレ は休む日')).toBeTruthy();
  });

  test('アンカー発火済みのピルが出る', () => {
    const { getByLabelText } = render(<DayDetailSection {...baseProps} />);
    expect(getByLabelText('発火済み')).toBeTruthy();
  });

  test('その日のメトリクスを値+単位で表示', () => {
    const { getByText } = render(<DayDetailSection {...baseProps} />);
    expect(getByText('体重')).toBeTruthy();
    expect(getByText('62.5 kg')).toBeTruthy();
  });

  test('チェーンが無い日は空メッセージ', () => {
    const empty: DayDetail = { date: '2026-05-18', chains: [], metrics: [] };
    const { getByText } = render(
      <DayDetailSection {...baseProps} detail={empty} />,
    );
    expect(getByText('この日のチェーンはありません')).toBeTruthy();
  });

  // #115 (ADR-0037): マトリクスからセルタップで開くときは日付チップ列を隠し、
  // 選択日の見出しだけ出す (日選択はマトリクス側が担う)。
  describe('showDateSelector={false} (マトリクスからの 1 日詳細)', () => {
    test('日付チップ列を出さず、 選択日の見出しを出す', () => {
      const { queryByLabelText, getByText } = render(
        <DayDetailSection {...baseProps} showDateSelector={false} />,
      );
      // チップ (「M/D の記録を見る」) は無い
      expect(queryByLabelText('5/16 の記録を見る')).toBeNull();
      expect(queryByLabelText('5/18 の記録を見る')).toBeNull();
      // 選択日の見出し (今日)
      expect(getByText(/5\/18 \(月\).*今日.*の記録/)).toBeTruthy();
    });

    test('ノード状態・メトリクスは従来どおり表示される', () => {
      const { getByLabelText, getByText } = render(
        <DayDetailSection {...baseProps} showDateSelector={false} />,
      );
      expect(getByLabelText('歯磨き 達成')).toBeTruthy();
      expect(getByText('62.5 kg')).toBeTruthy();
    });
  });
});
