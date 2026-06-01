import { fireEvent, render } from '@testing-library/react-native';

import { OnboardingScreen } from './OnboardingScreen';
import type { OnboardingScreenProps } from './OnboardingScreen';

const baseProps: OnboardingScreenProps = {
  step: 'welcome',
  firstMoment: null,
  time: '07:00',
  previewTitles: ['歯磨き', '白湯'],
  secondMoment: null,
  adoptedTimes: [],
  notifyDecided: null,
  adopting: false,
  onBack: () => {},
  onStart: () => {},
  onSelectMoment: () => {},
  onChangeTime: () => {},
  onConfirmTime: () => {},
  onAdoptFirst: () => {},
  onAddSecond: () => {},
  onSkipSecond: () => {},
  onRequestNotify: () => {},
  onSkipNotify: () => {},
  onFinish: () => {},
  onTryNow: () => {},
};

const renderStep = (over: Partial<OnboardingScreenProps>) =>
  render(<OnboardingScreen {...baseProps} {...over} />);

describe('OnboardingScreen (#72)', () => {
  test('welcome: はじめるで onStart が呼ばれる', () => {
    const onStart = jest.fn();
    const { getByText } = renderStep({ step: 'welcome', onStart });
    fireEvent.press(getByText('はじめる'));
    expect(onStart).toHaveBeenCalled();
  });

  test('moment: 朝/夜の選択で onSelectMoment が該当値で呼ばれる', () => {
    const onSelectMoment = jest.fn();
    const { getByLabelText } = renderStep({ step: 'moment', onSelectMoment });
    fireEvent.press(getByLabelText('朝から始める'));
    expect(onSelectMoment).toHaveBeenCalledWith('morning');
    fireEvent.press(getByLabelText('夜から始める'));
    expect(onSelectMoment).toHaveBeenCalledWith('night');
  });

  test('anchorTime: 時刻を表示し、次へで onConfirmTime が呼ばれる', () => {
    const onConfirmTime = jest.fn();
    const { getByText, getByLabelText } = renderStep({
      step: 'anchorTime',
      firstMoment: 'morning',
      time: '06:30',
      onConfirmTime,
    });
    expect(getByLabelText('時').props.value).toBe('06');
    expect(getByLabelText('分').props.value).toBe('30');
    fireEvent.press(getByText('次へ'));
    expect(onConfirmTime).toHaveBeenCalled();
  });

  test('preview: プレビューのアクション名を表示し、これで始めるで onAdoptFirst', () => {
    const onAdoptFirst = jest.fn();
    const { getByText } = renderStep({
      step: 'preview',
      firstMoment: 'morning',
      onAdoptFirst,
    });
    expect(getByText('歯磨き')).toBeTruthy();
    expect(getByText('白湯')).toBeTruthy();
    fireEvent.press(getByText('これで始める'));
    expect(onAdoptFirst).toHaveBeenCalled();
  });

  test('second: もう一方を追加 / 1本で始める の 2 択', () => {
    const onAddSecond = jest.fn();
    const onSkipSecond = jest.fn();
    const { getByLabelText, getByText } = renderStep({
      step: 'second',
      firstMoment: 'morning',
      secondMoment: 'night',
      onAddSecond,
      onSkipSecond,
    });
    fireEvent.press(getByLabelText('夜の習慣も追加する'));
    expect(onAddSecond).toHaveBeenCalled();
    fireEvent.press(getByText('1本で始める'));
    expect(onSkipSecond).toHaveBeenCalled();
  });

  test('notify: 通知を許可 / あとで の 2 択', () => {
    const onRequestNotify = jest.fn();
    const onSkipNotify = jest.fn();
    const { getByText } = renderStep({
      step: 'notify',
      onRequestNotify,
      onSkipNotify,
    });
    fireEvent.press(getByText('通知を許可'));
    expect(onRequestNotify).toHaveBeenCalled();
    fireEvent.press(getByText('あとで'));
    expect(onSkipNotify).toHaveBeenCalled();
  });

  test('notify: 拒否後は Today 常時表示のフォールバックを明示する (SPEC §8)', () => {
    const { getByText } = renderStep({ step: 'notify', notifyDecided: 'denied' });
    // 通知が無くても Today を開けば実行できる旨が出る (初日に死なない)
    expect(getByText(/Today を開けば/)).toBeTruthy();
  });

  test('done: 起動時刻サマリ + 完了 + 今すぐ1回試す', () => {
    const onFinish = jest.fn();
    const onTryNow = jest.fn();
    const { getByText } = renderStep({
      step: 'done',
      adoptedTimes: ['06:30'],
      onFinish,
      onTryNow,
    });
    expect(getByText(/06:30/)).toBeTruthy();
    fireEvent.press(getByText('今すぐ1回試す'));
    expect(onTryNow).toHaveBeenCalled();
    fireEvent.press(getByText('完了'));
    expect(onFinish).toHaveBeenCalled();
  });

  test('進捗インジケータと戻る導線が出る (welcome 以外)', () => {
    const onBack = jest.fn();
    const { getByLabelText } = renderStep({ step: 'anchorTime', onBack });
    fireEvent.press(getByLabelText('戻る'));
    expect(onBack).toHaveBeenCalled();
  });
});
