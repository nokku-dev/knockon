#!/usr/bin/env bash
#
# App Store 6.7" スクリーンショット撮影パイプライン (POC / Issue #237 / #238)。
#
# 前提 (README-screenshot-automation.md 参照):
#   - macOS + Xcode + iOS 18.x runtime (iPhone 15 Pro Max = 6.7" / 1290x2796)。
#   - **EAS preview (or development) ビルドの knockon.app** が手元にある
#     (production は SQLite 外部アクセス不可 = 撮影に使えない / demo-seed README §2.1)。
#   - このリポジトリで `npm install` 済み (better-sqlite3 / tsx が要る)。
#
# このスクリプトは (c) app install ステップだけ **未確定 (.app パスが eas build 後に決まる)**。
# それ以外 (simulator 作成/boot/erase/schema 生成/seed 注入/status bar/撮影/サイズ検証) は自動化する。
#
# ⚠️ 破壊的操作: `simctl erase` は対象 simulator の全データを消す (fresh install のため意図的)。
#    専用の撮影用 simulator に対してのみ実行する (Taku の常用 simulator を指定しないこと)。
#
# 冪等性: 何度でも再実行できる。simulator は無ければ作成、あれば再利用。erase で毎回 fresh。
#
# 使い方:
#   scripts/capture-screenshots.sh                 # .app パス未設定 → install ステップで停止し手順を表示
#   APP_PATH=/path/to/knockon.app scripts/capture-screenshots.sh   # フル実行
#
set -euo pipefail

# ── 設定 ───────────────────────────────────────────────────────
DEVICE_NAME="knockon-shot-15promax"      # 撮影専用 simulator 名 (常用機と分離)
DEVICE_TYPE="iPhone 15 Pro Max"          # 6.7" = 1290x2796 (16 Pro Max は 6.9" で別サイズ)
BUNDLE_ID="co.nokku.knockon"             # app.json ios.bundleIdentifier
SCHEME="knockon"                         # app.json scheme
EXPECT_W=1290
EXPECT_H=2796

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/release/screenshots/6.7"
SEED_SCRIPT="$REPO_ROOT/scripts/screenshot-demo-seed.ts"
APP_PATH="${APP_PATH:-}"                  # eas build 後にここへ .app パスを渡す

mkdir -p "$OUT_DIR"

log() { printf '\033[1;36m[capture]\033[0m %s\n' "$*"; }
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

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true
open -a Simulator || true

# ── (b) Erase All Content (fresh) ⚠️ 破壊的 ────────────────────
log "⚠️  simulator を erase (fresh install のため全データ消去): $UDID"
xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

# ── (c) app install (TODO: eas build 後に .app パスを埋める) ─────
if [[ -z "$APP_PATH" ]]; then
  warn "APP_PATH 未設定 — install をスキップします。"
  warn "eas build 後、下記のように .app パスを渡して再実行してください:"
  echo ""
  echo "  # simulator 向け preview ビルド (別途・時間がかかる):"
  echo "  eas build --profile preview --platform ios --simulator"
  echo "  # 生成された .tar.gz を展開 → knockon.app のパスを APP_PATH に:"
  echo "  APP_PATH=\"/path/to/knockon.app\" scripts/capture-screenshots.sh"
  echo ""
  # TODO: xcrun simctl install "$UDID" "<path-to-knockon.app>"
  exit 0
fi
log "app install: $APP_PATH"
xcrun simctl install "$UDID" "$APP_PATH"

# ── (d) 一度 launch → スキーマ生成 → terminate ────────────────
log "app を一度起動して initSchema (knockon.db 生成) を通す..."
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep 6   # migration + catalog seed が走り切るのを待つ
xcrun simctl terminate "$UDID" "$BUNDLE_ID" || true

# ── (e) knockon.db のパスを特定 ───────────────────────────────
log "knockon.db を特定..."
DATA_CONTAINER="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)"
DB_PATH="$DATA_CONTAINER/Documents/SQLite/knockon.db"
if [[ ! -f "$DB_PATH" ]]; then
  # スキーマ生成前 / パス差異の保険: container 配下を検索。
  DB_PATH="$(find "$DATA_CONTAINER" -name 'knockon.db' 2>/dev/null | head -1)"
fi
if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "knockon.db が見つかりません。app 起動でスキーマが生成されたか確認してください。" >&2
  exit 1
fi
log "DB: $DB_PATH"

# ── (f) demo seed 注入 (§1.2 の 3 チェーン + 達成 + 定着) ──────
log "demo seed を注入 (npx tsx screenshot-demo-seed.ts)..."
( cd "$REPO_ROOT" && npx tsx "$SEED_SCRIPT" "$DB_PATH" )

# ── (g) status bar override + dark 固定 ───────────────────────
log "status bar 9:41 / battery 100% / dark 固定..."
xcrun simctl status_bar "$UDID" override \
  --time "9:41" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 \
  --batteryState charged --batteryLevel 100
xcrun simctl ui "$UDID" appearance dark

# ── (h) relaunch (seed 済みデータを cold-start で読み込む) ──────
log "relaunch (seed 済みデータをロード)..."
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep 4

# ── (i) 5 画面を deep-link で開いて撮影 ────────────────────────
# deep-link マッピング (README-screenshot-automation.md §deep-link 参照):
#   01-today            knockon://                       (Today)
#   02-chain-detail     knockon://?openChainId=chain-morning  (Today で朝ルーティンの ChainDetail Bottom Sheet を自動展開)
#   03-analytics        knockon://analytics              (ログ / 定着ポートフォリオ)
#   04-chains-list      knockon://chains                 (チェーン一覧 active)
#   05-chain-edit       knockon://chain/chain-morning    (朝ルーティンの編集画面。chain/new ではない = 既存 4 ノードを見せるため)
shoot() {
  local slug="$1" url="$2"
  log "open $url  → $slug.png"
  xcrun simctl openurl "$UDID" "$url"
  sleep 3   # 画面遷移 + アニメ (達成ジェスチャ ~500ms) 収束を待つ
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$slug.png"
}

shoot "01-today"                "$SCHEME://"
shoot "02-chain-detail"         "$SCHEME://?openChainId=chain-morning"
shoot "03-analytics-portfolio"  "$SCHEME://analytics"
shoot "04-chains-list"          "$SCHEME://chains"
shoot "05-chain-edit"           "$SCHEME://chain/chain-morning"

# ── (j) サイズ検証 (1290x2796) ────────────────────────────────
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

# ── (k) 命名配置は shoot() で OUT_DIR に直接出力済み ─────────────
if [[ "$FAIL" -ne 0 ]]; then
  echo "サイズ不一致の PNG があります。DEVICE_TYPE が 15 Pro Max か確認してください。" >&2
  exit 1
fi
log "完了: 5 枚を $OUT_DIR に配置。目視チェックは demo-seed README §3 を参照。"
