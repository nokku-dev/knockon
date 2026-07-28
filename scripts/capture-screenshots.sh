#!/usr/bin/env bash
#
# App Store 6.7" スクリーンショット撮影パイプライン (Issue #239 / #238)。
#
# seed 方式: **アプリ内 auto-seed** (src/screenshotSeed.ts + app/_layout.tsx の
#   SEED_SCREENSHOT_DATA=true)。初回起動時にアプリ自身が定着/もう少しで定着/育成中の
#   3ステージが揃うデータを1度だけ投入する。外部 SQLite 注入は不要。
#   → この撮影は feat/screenshot-build ブランチのビルドを前提にする
#     (SEED_SCREENSHOT_DATA=true が入っているのはこのブランチのみ・main には無い)。
#
# 前提:
#   - macOS + Xcode + iOS 18.x runtime (iPhone 15 Pro Max = 6.7" / 1290x2796)。
#   - **feat/screenshot-build の EAS preview ビルド (knockon.app / simulator 向け)** が手元にある。
#     production は不可 (SQLite 外部アクセス閉じる & seed フラグ無し)。
#
# ⚠️ 破壊的操作: `simctl erase` は対象 simulator の全データを消す (fresh install のため意図的)。
#    専用の撮影用 simulator に対してのみ実行する (常用 simulator を指定しないこと)。
#
# 冪等性: 何度でも再実行できる。simulator は無ければ作成、あれば再利用。erase で毎回 fresh。
#
# 使い方:
#   scripts/capture-screenshots.sh                                # APP_PATH 未設定 → install 手順を表示して停止
#   APP_PATH=/path/to/knockon.app scripts/capture-screenshots.sh  # フル実行
#
set -euo pipefail

# ── 設定 ───────────────────────────────────────────────────────
DEVICE_NAME="knockon-shot-15promax"      # 撮影専用 simulator 名 (常用機と分離)
DEVICE_TYPE="iPhone 15 Pro Max"          # 6.7" = 1290x2796 (16 Pro Max は 6.9" で別サイズ)
BUNDLE_ID="co.nokku.knockon"             # app.json ios.bundleIdentifier
SCHEME="knockon"                         # app.json scheme
# deep-link 参照する chain ID は screenshotSeed.ts の実 ID (ss- prefix)。
CHAIN_MORNING="ss-chain-morning"         # 朝のルーティン (4ノード・定着含む)
EXPECT_W=1290
EXPECT_H=2796
SEED_SETTLE_SEC=14                       # 初回起動の auto-seed (多数の achievement 書込) 収束待ち

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/release/screenshots/6.7"
APP_PATH="${APP_PATH:-}"                  # eas build 後にここへ .app パスを渡す

mkdir -p "$OUT_DIR"

log()  { printf '\033[1;36m[capture]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[capture][WARN]\033[0m %s\n' "$*"; }

# ── (a) simulator 作成 (無ければ) → boot ───────────────────────
log "runtime 一覧を確認..."
RUNTIME_ID="$(xcrun simctl list runtimes | grep -Eo 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9-]+' | tail -1)"
if [[ -z "$RUNTIME_ID" ]]; then
  echo "iOS runtime が見つかりません。Xcode で iOS 18.x runtime を入れてください。" >&2
  exit 1
fi
log "使用 runtime: $RUNTIME_ID"

UDID="$(xcrun simctl list devices | grep "$DEVICE_NAME (" | grep -Eo '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1 || true)"
if [[ -z "$UDID" ]]; then
  log "撮影用 simulator '$DEVICE_NAME' を作成..."
  DEVTYPE_ID="$(xcrun simctl list devicetypes | grep "$DEVICE_TYPE (" | grep -Eo 'com.apple.CoreSimulator.SimDeviceType[^)]+' | head -1)"
  UDID="$(xcrun simctl create "$DEVICE_NAME" "$DEVTYPE_ID" "$RUNTIME_ID")"
fi
log "simulator UDID: $UDID"

open -a Simulator || true

# ── (b) Erase All Content (fresh) ⚠️ 破壊的 ────────────────────
log "⚠️  simulator を erase (fresh install のため全データ消去): $UDID"
xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

# ── (c) app install (eas build 後に APP_PATH を渡す) ───────────
if [[ -z "$APP_PATH" ]]; then
  warn "APP_PATH 未設定 — install をスキップします。"
  warn "eas build 完了後、下記のように .app パスを渡して再実行してください:"
  echo ""
  echo "  # feat/screenshot-build ブランチで simulator 向け preview ビルド:"
  echo "  eas build --profile preview --platform ios"
  echo "  # 生成物 (.tar.gz) を DL・展開 → knockon.app のパスを APP_PATH に:"
  echo "  APP_PATH=\"/path/to/knockon.app\" scripts/capture-screenshots.sh"
  echo ""
  exit 0
fi
log "app install: $APP_PATH"
xcrun simctl install "$UDID" "$APP_PATH"

# ── (d) status bar override + dark 固定 (device レベル・起動前に設定) ──
log "status bar 9:41 / battery 100% / dark 固定..."
xcrun simctl status_bar "$UDID" override \
  --time "9:41" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 \
  --batteryState charged --batteryLevel 100
xcrun simctl ui "$UDID" appearance dark

# ── (e) 初回 launch → アプリ内 auto-seed (SEED_SCREENSHOT_DATA=true) ──
log "初回起動 → アプリが screenshotSeed を1度だけ投入 (待ち ${SEED_SETTLE_SEC}s)..."
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep "$SEED_SETTLE_SEC"   # initSchema + seedScreenshotData (多数 achievement) の収束待ち

# ── (f) cold-start relaunch (seed 済みデータをクリーンにロード) ─────
log "relaunch (seed 済みデータを cold-start でロード)..."
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep 4

# ── (g) 5 画面を deep-link で開いて撮影 ────────────────────────
# deep-link マッピング (expo-router / app/ ルート):
#   01-today            knockon://                          (Today)
#   02-chain-detail     knockon://?openChainId=ss-chain-morning  (Today で朝ルーティンの ChainDetail Bottom Sheet を自動展開)
#   03-analytics        knockon://analytics                 (ログ / 定着ポートフォリオ)
#   04-chains-list      knockon://chains                    (チェーン一覧 active)
#   05-chain-edit       knockon://chain/ss-chain-morning    (朝ルーティンの編集画面。既存4ノードを見せる)
shoot() {
  local slug="$1" url="$2"
  log "open $url  → $slug.png"
  xcrun simctl openurl "$UDID" "$url"
  sleep 3   # 画面遷移 + アニメ収束を待つ
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$slug.png"
}

shoot "01-today"                "$SCHEME://"
shoot "02-chain-detail"         "$SCHEME://?openChainId=$CHAIN_MORNING"
shoot "03-analytics-portfolio"  "$SCHEME://analytics"
shoot "04-chains-list"          "$SCHEME://chains"
shoot "05-chain-edit"           "$SCHEME://chain/$CHAIN_MORNING"

# ── (h) サイズ検証 (1290x2796) ────────────────────────────────
log "サイズ検証 (期待: ${EXPECT_W}x${EXPECT_H})..."
FAIL=0
for f in "$OUT_DIR"/0*.png; do
  W="$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')"
  H="$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')"
  if [[ "$W" == "$EXPECT_W" && "$H" == "$EXPECT_H" ]]; then
    printf '  [OK]   %s = %sx%s\n' "$(basename "$f")" "$W" "$H"
  else
    printf '  [FAIL] %s = %sx%s (期待 %sx%s)\n' "$(basename "$f")" "$W" "$H" "$EXPECT_W" "$EXPECT_H"
    FAIL=1
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "サイズ不一致の PNG があります。DEVICE_TYPE が 15 Pro Max か確認してください。" >&2
  exit 1
fi
log "完了: 5 枚を $OUT_DIR に配置。"
log "目視チェック: 定着ステージ (定着/もう少しで定着/育成中) が各カットで映えているか、"
log "  Taku 個人データが混入していないか、9:41/dark が効いているか を確認 (demo-seed README §3)。"
