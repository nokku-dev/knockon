import { readFileSync } from 'fs';
import { join } from 'path';

// 2026-08-17 (v1.0.1 提出): `eas submit --non-interactive` が
//   Set ascAppId in the submit profile (eas.json) or re-run this command in interactive mode.
// で失敗した。playbook が「Apple ID / ASC App ID / Team ID は secret なのでコミットしない」と
// 一括りにしていたため、`eas.json` に ascAppId が無かった。
//
// ⚠ ASC App ID は **secret ではない**。App Store の公開 URL にそのまま含まれている:
//   https://apps.apple.com/jp/app/knockon/id6796213204
// Apple ID (メールアドレス) と Team ID は引き続きコミットしない。
//
// README の URL と eas.json の値は **二重 truth source** なので、値の一致を固定する
// (片方だけ変えると、間違ったアプリにアップロードしうる)。

const REPO_ROOT = join(__dirname, '..');

const easJson = JSON.parse(
  readFileSync(join(REPO_ROOT, 'eas.json'), 'utf8'),
) as {
  submit?: {
    production?: {
      ios?: Record<string, unknown>;
    };
  };
};

const iosSubmit = easJson.submit?.production?.ios ?? {};

describe('eas.json submit.production.ios', () => {
  test('ascAppId が設定されている (--non-interactive で submit できる)', () => {
    expect(typeof iosSubmit.ascAppId).toBe('string');
    expect(iosSubmit.ascAppId).toMatch(/^\d+$/);
  });

  test('ascAppId が README の App Store URL と一致する', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    const match = readme.match(/apps\.apple\.com\/[^)\s]*\/id(\d+)/);
    expect(match).not.toBeNull();
    expect(iosSubmit.ascAppId).toBe(match![1]);
  });

  test('⚠ Apple ID と Team ID はコミットしない (こちらは secret)', () => {
    expect(iosSubmit.appleId).toBeUndefined();
    expect(iosSubmit.appleTeamId).toBeUndefined();
    expect(iosSubmit.ascApiKeyPath).toBeUndefined();
  });

  test('language が ja', () => {
    expect(iosSubmit.language).toBe('ja');
  });
});
