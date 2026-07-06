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

  // ADR-0047 追補 (2026-07-07): 定着後は「派生で数える」= セルを塗って埋める (effective
  // 達成 = 実レコード OR 定着)。 定着日のセルは a11y「定着」で、 実タップと同じ塗りになる。
  test('定着日セルは a11y ラベルが「定着」になる (実タップ有無に関わらず)', () => {
    const settledByNode = { n1: new Set(['2026-05-18', '2026-05-19']) };
    const { getByLabelText } = render(
      <DateMatrixSection {...baseProps} settledByNode={settledByNode} />,
    );
    // 未達の日 (5/18) も定着なら「定着」= 埋まる (auto)。
    expect(getByLabelText('起きる 5/18 定着')).toBeTruthy();
    // 実達成 + 定着の日 (5/19) も「定着」。
    expect(getByLabelText('起きる 5/19 定着')).toBeTruthy();
    // 定着前の日付は従来どおり達成/未達。
    expect(getByLabelText('起きる 5/17 達成')).toBeTruthy();
  });

  test('settledByNode 未指定なら「定着」ラベルは出ない (既存挙動互換)', () => {
    const { queryByLabelText } = render(<DateMatrixSection {...baseProps} />);
    expect(queryByLabelText(/定着/)).toBeNull();
  });
});
