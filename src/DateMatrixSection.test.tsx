import { render } from '@testing-library/react-native';

import { DateMatrixSection } from './DateMatrixSection';
import type { DateMatrixChainGroup } from './analyticsDerivation';

const dates = ['2026-05-17', '2026-05-18', '2026-05-19']; // 昇順 (最新が末尾)

const rows: DateMatrixChainGroup[] = [
  {
    chainId: 'c1',
    chainTitle: '朝のチェーン',
    nodes: [
      {
        nodeId: 'n1',
        label: '起きる',
        cells: [
          { date: '2026-05-17', achieved: true, skipped: false },
          { date: '2026-05-18', achieved: false, skipped: false },
          { date: '2026-05-19', achieved: true, skipped: false },
        ],
      },
      {
        nodeId: 'n2',
        label: '筋トレ',
        cells: [
          { date: '2026-05-17', achieved: false, skipped: true },
          { date: '2026-05-18', achieved: true, skipped: false },
          { date: '2026-05-19', achieved: false, skipped: true },
        ],
      },
    ],
  },
];

const baseProps = {
  rows,
  dates,
  today: '2026-05-19',
};

describe('DateMatrixSection (#115 / ADR-0037)', () => {
  test('チェーン名・ノード名が表示される', () => {
    const { getByText } = render(<DateMatrixSection {...baseProps} />);
    expect(getByText('朝のチェーン')).toBeTruthy();
    expect(getByText('起きる')).toBeTruthy();
    expect(getByText('筋トレ')).toBeTruthy();
  });

  test('各セルに達成/未達/休む日の a11y ラベルが付く', () => {
    const { getByLabelText } = render(<DateMatrixSection {...baseProps} />);
    expect(getByLabelText('起きる 5/17 達成')).toBeTruthy();
    expect(getByLabelText('起きる 5/18 未達')).toBeTruthy();
    expect(getByLabelText('筋トレ 5/17 休む日')).toBeTruthy();
    expect(getByLabelText('筋トレ 5/18 達成')).toBeTruthy();
  });

  test('今日の列ヘッダーに「今」が出る', () => {
    const { getByText } = render(<DateMatrixSection {...baseProps} />);
    expect(getByText('今')).toBeTruthy();
  });

  test('チェーン 0 件なら空メッセージ', () => {
    const { getByText } = render(
      <DateMatrixSection {...baseProps} rows={[]} />,
    );
    expect(getByText(/アクティブなチェーンがありません/)).toBeTruthy();
  });

  test('streak の数字 (N 日連続) は一切出さない (反 streak)', () => {
    const { queryByText } = render(<DateMatrixSection {...baseProps} />);
    expect(queryByText(/日連続/)).toBeNull();
  });
});
