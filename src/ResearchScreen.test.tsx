import { render } from '@testing-library/react-native';

import { ResearchScreen } from './ResearchScreen';

describe('ResearchScreen', () => {
  it('固定文言「インサイトはまだありません」を表示する (#175 / PR-A の空スケルトン)', () => {
    const { getByText } = render(<ResearchScreen />);
    expect(getByText('インサイトはまだありません')).toBeTruthy();
  });
});
