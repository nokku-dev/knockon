#!/usr/bin/env bash
#
# App Store 6.7" スクリーンショット撮影パイプライン (Issue #239 / #238)。
#
# seed 方式: **アプリ内 auto-seed** (src/screenshotSeed.ts + app/_layout.tsx の
#   SEED_SCREENSHOT_DATA=true)。初回起動時にアプリ自身が定着/もう少しで定着/育成中の
#   3ステージが揃うデータを1度だけ投入する。→ feat/screenshot-build ブランチのビルド前提。
#
# ナビ方式: **maestro (座標タップ)**。iOS 18 の simctl openurl はカスタム scheme で
#   確認ダイアログを出し deep-link 不可。RN テキストは a11y 階層に出ず text マッチ不可。
#   → scripts/screenshots.maestro.yaml が %座標でタブ/カードをタップして 5 画面を回す。
#
# 前提:
#   - macOS + Xcode + iOS 18.x runtime + iPhone 15 Pro Max (6.7" / 1290x2796)。
#   - feat/screenshot-build の EAS preview ビルド (simulator 向け .app)。
#   - maestro 導入済み (curl -fsSL "https://get.maestro.mobile.dev" | bash) + JDK。
#
# ⚠️ 破壊的操作: simctl erase で対象 simulator を全消去 (fresh install のため)。
#
# 使い方:
#   APP_PATH=/path/to/knockon.app scripts/capture-screenshots.sh
set -euo pipefail

DEVICE_NAME="knockon-shot-15promax"
DEVICE_TYPE="iPhone 15 Pro Max"          # 6.7" = 1290x2796
BUNDLE_ID="co.nokku.knockon"
EXPECT_W=1290; EXPECT_H=2796
SEED_SETTLE_SEC=15

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/release/screenshots/6.7"
FLOW="$REPO_ROOT/scripts/screenshots.maestro.yaml"
APP_PATH="${APP_PATH:-}"
mkdir -p "$OUT_DIR"

export PATH="$PATH:$HOME/.maestro/bin"
export JAVA_HOME="${JAVA_HOME_OVERRIDE:-$(/usr/libexec/java_home 2>/dev/null || true)}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

log() { printf '\033[1;36m[capture]\033[0m %s\n' "$*"; }

command -v maestro >/dev/null || { echo "maestro 未導入: curl -fsSL https://get.maestro.mobile.dev | bash" >&2; exit 1; }
[[ -z "$APP_PATH" ]] && { echo "APP_PATH 未設定。eas build 後の knockon.app パスを渡してください。" >&2; exit 1; }

# ── simulator 作成/boot ───────────────────────────────────────
RUNTIME_ID="$(xcrun simctl list runtimes | grep -Eo 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9-]+' | tail -1)"
[[ -z "$RUNTIME_ID" ]] && { echo "iOS runtime 無し。Xcode で iOS 18.x を入れてください。" >&2; exit 1; }
UDID="$(xcrun simctl list devices | grep "$DEVICE_NAME (" | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"
if [[ -z "$UDID" ]]; then
  DEVTYPE_ID="$(xcrun simctl list devicetypes | grep "$DEVICE_TYPE (" | grep -Eo 'com.apple.CoreSimulator.SimDeviceType[^)]+' | head -1)"
  UDID="$(xcrun simctl create "$DEVICE_NAME" "$DEVTYPE_ID" "$RUNTIME_ID")"
fi
log "simulator: $UDID ($DEVICE_TYPE)"
open -a Simulator || true

# ── fresh (⚠️ erase) → status/dark → install → 初回起動で auto-seed ──
log "⚠️  erase (全消去) → install → 9:41/dark → 初回起動で seed"
xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl ui "$UDID" appearance dark
xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null 2>&1
log "seed 収束待ち ${SEED_SETTLE_SEC}s..."; sleep "$SEED_SETTLE_SEC"

# ── maestro で 5 画面ナビ + 撮影 ──────────────────────────────
log "maestro flow で 5 画面を撮影..."
maestro test "$FLOW"

# ── maestro 出力 (最新 run) を docs へ回収 + サイズ検証 ─────────
D="$(ls -dt "$HOME"/.maestro/tests/*/ | head -1)"
log "maestro 出力: $D"
FAIL=0
for slug in 01-today 02-chain-detail 03-analytics-portfolio 04-chains-list 05-chain-edit; do
  src="$(find "$D" -name "$slug.png" | head -1)"
  [[ -z "$src" ]] && { echo "  [MISSING] $slug.png" >&2; FAIL=1; continue; }
  cp "$src" "$OUT_DIR/$slug.png"
  W="$(sips -g pixelWidth "$OUT_DIR/$slug.png" | awk '/pixelWidth/{print $2}')"
  H="$(sips -g pixelHeight "$OUT_DIR/$slug.png" | awk '/pixelHeight/{print $2}')"
  if [[ "$W" == "$EXPECT_W" && "$H" == "$EXPECT_H" ]]; then
    printf '  [OK]   %s = %sx%s\n' "$slug.png" "$W" "$H"
  else
    printf '  [FAIL] %s = %sx%s (期待 %sx%s)\n' "$slug.png" "$W" "$H" "$EXPECT_W" "$EXPECT_H"; FAIL=1
  fi
done
[[ "$FAIL" -ne 0 ]] && { echo "一部の PNG に問題があります。" >&2; exit 1; }
log "完了: 5 枚を $OUT_DIR に配置。目視で定着ステージ・9:41/dark・個人データ非混入を確認。"
