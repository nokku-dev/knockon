import { act, fireEvent, render, within } from '@testing-library/react-native';

// @gorhom/bottom-sheet は reanimated worklet を要求するため jest 環境では mock 化。
// PR-AA: BottomSheet を「children 透過」モックに変更し、 Sheet 内コンテンツ
// (= 編集ボタン / ChainDetail) を test で検証可能に。 既存テストは Sheet を
// 開かない (= openChain=null で内部 ternary が null) ので影響なし。
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(
      ({ children }: { children?: React.ReactNode }) => children ?? null,
    ),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
      children ?? null,
  };
});

// Issue #102: InAppNotificationToast は reanimated / safe-area-context に依存する。
// TodayScreen test では表示の有無 + テキスト内容だけ検証すれば十分なので、
// 単純な View + Text に差し替える (= rendering 副作用を test 環境から排除)。
jest.mock('./InAppNotificationToast', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    InAppNotificationToast: ({
      title,
      body,
    }: {
      title: string;
      body: string;
    }) =>
      React.createElement(
        View,
        { accessibilityLabel: 'タイマー完了トースト' },
        React.createElement(Text, null, title),
        React.createElement(Text, null, body),
      ),
  };
});

// Issue #102: TimerScreen の事前スケジュール通知 mock。 jest 環境で
// expo-notifications を実呼び出ししないため。
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve(undefined)),
}));

import type { TodayNode } from './ChainDetail';
import type { AchievementMap, Anchor, Chain, Node } from './domain';
import { TodayScreen } from './TodayScreen';
import type { TodayChainData } from './useTodayData';

const buildChain = (id: string, title: string): Chain => ({
  id,
  title,
  anchorId: `${id}-anchor`,
  status: 'active',
  createdAt: '2026-05-24',
});

const buildAnchor = (id: string, title: string): Anchor => ({
  id,
  title,
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

const buildNode = (id: string, idx: number, actionId: string): Node => ({
  id,
  chainId: 'c1',
  orderIndex: idx,
  kind: 'action',
  actionId,
});

const fireNode = (id: string, label: string): TodayNode => ({
  node: buildNode(id, 0, `act-${id}`),
  action: { id: `act-${id}`, title: label, variants: null, timerSeconds: null },
  label,
  kind: 'fire',
});

const buildChainData = (
  id: string,
  title: string,
  nodes: TodayNode[],
  achievements: AchievementMap = {},
): TodayChainData => ({
  chain: buildChain(id, title),
  anchor: buildAnchor(`${id}-anchor`, '起点'),
  nodes,
  achievements,
  anchorFiredToday: false,
  recentAchievements: [],
  nodeIdsEstablished: new Set<string>(),
  nodeRecentCells: new Map(),
});

describe('TodayScreen (PR-X / マルチチェーン + Bottom Sheet)', () => {
  test('chains 0 件 → 空メッセージ表示', () => {
    const { getByText } = render(
      <TodayScreen chains={[]} onToggleNode={() => {}} />,
    );
    expect(getByText(/アクティブなチェーンがありません/)).toBeTruthy();
  });

  test('chains 複数 → 各 ChainCard のタイトルが表示される', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [
        fireNode('n1', '水を飲む'),
        fireNode('n2', 'ストレッチ'),
      ]),
      buildChainData('c2', '就寝前', [fireNode('n3', '歯磨き')]),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('就寝前')).toBeTruthy();
  });

  test('PR-AA: チェーンカードタップ → Sheet ヘッダーに「編集」ボタン → タップで onEditChain が呼ばれる', () => {
    const onEditChain = jest.fn();
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
    ];
    const { getByLabelText } = render(
      <TodayScreen
        chains={chains}
        onToggleNode={() => {}}
        onEditChain={onEditChain}
      />,
    );
    // ChainCard をタップして Sheet を開く
    fireEvent.press(getByLabelText(/朝のルーティン を開く/));
    // 編集ボタンが表示される
    const editBtn = getByLabelText('このチェーンを編集');
    fireEvent.press(editBtn);
    expect(onEditChain).toHaveBeenCalledWith('c1');
  });

  test('PR-AA: onEditChain 未指定なら編集ボタンは表示されない (発見性 = 親が動線を持っている時のみ)', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
    ];
    const { getByLabelText, queryByLabelText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    fireEvent.press(getByLabelText(/朝のルーティン を開く/));
    expect(queryByLabelText('このチェーンを編集')).toBeNull();
  });

  test('Issue #123: 連続達成 (streak) はカードに表示しない (反 streak / Celebrate 主)', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
    ];
    const { queryByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(queryByText(/日連続/)).toBeNull();
  });

  describe('#142 (ADR-0041): 見出し右のアプリ全体累計「累計 N 個達成 (+今日M)」', () => {
    test('base + 今日の達成数 (全チェーン合算) を「累計 N 個達成 (+M)」で出す', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝', [fireNode('n1', '水'), fireNode('n2', 'ストレッチ')], {
          n1: true,
          n2: false,
        }),
        buildChainData('c2', '夜', [fireNode('n3', '歯磨き')], { n3: true }),
      ];
      // base=1200, 今日の達成 = n1 + n3 = 2 → 累計 1,202 個達成 (+2)
      const { getByTestId } = render(
        <TodayScreen
          chains={chains}
          achievedBeforeToday={1200}
          onToggleNode={() => {}}
        />,
      );
      expect(getByTestId('today-cumulative-total').props.children).toEqual([
        '累計 ',
        '1,202',
        ' 個達成 (+',
        2,
        ')',
      ]);
    });

    test('累計 0 (base 0・今日も未達成) は非表示', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝', [fireNode('n1', '水')], {}),
      ];
      const { queryByTestId } = render(
        <TodayScreen chains={chains} achievedBeforeToday={0} onToggleNode={() => {}} />,
      );
      expect(queryByTestId('today-cumulative-total')).toBeNull();
    });

    test('base 0 でも今日 1 件達成すれば「累計 1 個達成 (+1)」が現れる', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝', [fireNode('n1', '水')], { n1: true }),
      ];
      const { getByTestId } = render(
        <TodayScreen chains={chains} achievedBeforeToday={0} onToggleNode={() => {}} />,
      );
      expect(getByTestId('today-cumulative-total').props.children).toEqual([
        '累計 ',
        '1',
        ' 個達成 (+',
        1,
        ')',
      ]);
    });

    test('achievedBeforeToday 未指定でも今日分だけで表示 (後方互換・デフォルト 0)', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝', [fireNode('n1', '水')], { n1: true }),
      ];
      const { getByTestId } = render(
        <TodayScreen chains={chains} onToggleNode={() => {}} />,
      );
      expect(getByTestId('today-cumulative-total').props.children).toEqual([
        '累計 ',
        '1',
        ' 個達成 (+',
        1,
        ')',
      ]);
    });
  });

  // Issue #102: タイマーがバックグラウンドに行ったあと完了した時に、
  // foreground 復帰後の挙動 (= 自動達成 + Modal クローズ) は無音で進むため
  // ユーザーが「完了したのか / キャンセルされたのか」を判別できない。
  // 完了時にはトースト ("タイマー完了" + アクション名) で feedback を出す。
  describe('Issue #102: タイマー完了フィードバック', () => {
    const timerNode = (id: string, label: string, seconds: number): TodayNode => {
      const node: Node = {
        id,
        chainId: 'c1',
        orderIndex: 0,
        kind: 'action',
        actionId: `act-${id}`,
      };
      return {
        node,
        action: {
          id: `act-${id}`,
          title: label,
          variants: null,
          timerSeconds: seconds,
        },
        label,
        kind: 'fire',
      };
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    test('タイマー自動完了 → 完了トーストが表示される (アクション名 + 「タイマー完了」)', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝のルーティン', [timerNode('n1', '読書', 60)]),
      ];
      const onMarkNodeAchieved = jest.fn();
      const { getByLabelText, queryByLabelText } = render(
        <TodayScreen
          chains={chains}
          onToggleNode={() => {}}
          onMarkNodeAchieved={onMarkNodeAchieved}
        />,
      );
      // チェーンを開く → ChainDetail 表示 → タイマー開始ボタン押下
      fireEvent.press(getByLabelText(/朝のルーティン を開く/));
      fireEvent.press(getByLabelText('読書 1 分のタイマー開始'));
      // 完了まで進める (= 60秒 + バッファ)
      act(() => {
        jest.advanceTimersByTime(61_000);
      });
      // 既存挙動: 自動達成記録
      expect(onMarkNodeAchieved).toHaveBeenCalledWith('c1', 'n1', true);
      // 新規挙動: 完了トースト表示 (アクション名 + 完了メッセージ)
      const toast = queryByLabelText('タイマー完了トースト');
      expect(toast).toBeTruthy();
      const inToast = within(toast!);
      expect(inToast.getByText('タイマー完了')).toBeTruthy();
      expect(inToast.getByText('読書')).toBeTruthy();
    });

    test('タイマーキャンセル → 完了トーストは出ない (ユーザー起点の操作には feedback 不要)', () => {
      const chains: TodayChainData[] = [
        buildChainData('c1', '朝のルーティン', [timerNode('n1', '読書', 60)]),
      ];
      const onMarkNodeAchieved = jest.fn();
      const { getByLabelText, queryByLabelText } = render(
        <TodayScreen
          chains={chains}
          onToggleNode={() => {}}
          onMarkNodeAchieved={onMarkNodeAchieved}
        />,
      );
      fireEvent.press(getByLabelText(/朝のルーティン を開く/));
      fireEvent.press(getByLabelText('読書 1 分のタイマー開始'));
      // キャンセル
      fireEvent.press(getByLabelText('タイマーキャンセル'));
      expect(onMarkNodeAchieved).not.toHaveBeenCalled();
      expect(queryByLabelText('タイマー完了トースト')).toBeNull();
    });
  });

  test('進捗 0/N と N/N の表示が区別される', () => {
    const chains: TodayChainData[] = [
      // 0/2 (未達成)
      buildChainData('c1', 'チェーン A', [
        fireNode('na1', 'アクション 1'),
        fireNode('na2', 'アクション 2'),
      ]),
      // 2/2 (全達成 → ✓ バッジ)
      buildChainData(
        'c2',
        'チェーン B',
        [fireNode('nb1', 'B1'), fireNode('nb2', 'B2')],
        { nb1: true, nb2: true },
      ),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    // 全達成チェーンは ✓ バッジ
    expect(getByText('✓ 達成')).toBeTruthy();
  });
});

// #165 (ADR-0042 P1): 立ち上げチェックリスト
describe('TodayScreen 立ち上げチェックリスト (#165)', () => {
  const oneChain = (): TodayChainData[] => [
    buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
  ];

  test('onboarding 完了・未 dismiss・未達 + onDismissChecklist あり → チェックリスト表示', () => {
    const { getByTestId, getByText } = render(
      <TodayScreen
        chains={oneChain()}
        onToggleNode={() => {}}
        onboardingCompleted
        checklistDismissedAt={null}
        onDismissChecklist={() => {}}
      />,
    );
    expect(getByTestId('onboarding-checklist')).toBeTruthy();
    // 1 本目採用のみ done → (1/5)
    expect(getByText('立ち上げチェックリスト (1/5)')).toBeTruthy();
  });

  test('onboarding 未完了 → 表示しない (まだ onboarding 中)', () => {
    const { queryByTestId } = render(
      <TodayScreen
        chains={oneChain()}
        onToggleNode={() => {}}
        onboardingCompleted={false}
        onDismissChecklist={() => {}}
      />,
    );
    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  test('dismiss 済み → 表示しない', () => {
    const { queryByTestId } = render(
      <TodayScreen
        chains={oneChain()}
        onToggleNode={() => {}}
        onboardingCompleted
        checklistDismissedAt="2026-06-20T00:00:00.000Z"
        onDismissChecklist={() => {}}
      />,
    );
    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  test('onDismissChecklist 未指定 → 表示しない (親が dismiss 動線を持つときのみ)', () => {
    const { queryByTestId } = render(
      <TodayScreen chains={oneChain()} onToggleNode={() => {}} onboardingCompleted />,
    );
    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  test('全マイルストーン達成 → 自動的に表示しない', () => {
    // 2 本採用 + 通算 10 達成 + アクション追加済み = 全 done
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝', [fireNode('n1', '水')]),
      buildChainData('c2', '夜', [fireNode('n2', '歯磨き')]),
    ];
    const { queryByTestId } = render(
      <TodayScreen
        chains={chains}
        achievedBeforeToday={10}
        onToggleNode={() => {}}
        onboardingCompleted
        checklistAddedAction
        onDismissChecklist={() => {}}
      />,
    );
    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  test('閉じるボタン → onDismissChecklist が呼ばれる', () => {
    const onDismissChecklist = jest.fn();
    const { getByLabelText } = render(
      <TodayScreen
        chains={oneChain()}
        onToggleNode={() => {}}
        onboardingCompleted
        onDismissChecklist={onDismissChecklist}
      />,
    );
    fireEvent.press(getByLabelText('立ち上げチェックリストを閉じる'));
    expect(onDismissChecklist).toHaveBeenCalledTimes(1);
  });

  test('マイルストーンの達成度がライブ反映される (2 本採用で 2/5)', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝', [fireNode('n1', '水')]),
      buildChainData('c2', '夜', [fireNode('n2', '歯磨き')]),
    ];
    const { getByText } = render(
      <TodayScreen
        chains={chains}
        onToggleNode={() => {}}
        onboardingCompleted
        onDismissChecklist={() => {}}
      />,
    );
    // 1 本目採用 + 2 本目採用 = 2 done
    expect(getByText('立ち上げチェックリスト (2/5)')).toBeTruthy();
  });

  test('checklistAddedAction で「アクションを 1 つ追加した」が done になる', () => {
    const { getByText, getByLabelText } = render(
      <TodayScreen
        chains={oneChain()}
        onToggleNode={() => {}}
        onboardingCompleted
        checklistAddedAction
        onDismissChecklist={() => {}}
      />,
    );
    // 1 本目採用 + アクション追加 = 2 done
    expect(getByText('立ち上げチェックリスト (2/5)')).toBeTruthy();
    expect(getByLabelText('チェーンにアクションを 1 つ追加した 達成済み')).toBeTruthy();
  });
});
