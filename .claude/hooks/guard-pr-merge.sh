#!/bin/bash
# .claude/hooks/guard-pr-merge.sh
# PreToolUse (Bash) で実行。
# `gh pr merge <N>` を検知したら、対象 PR の mergeStateStatus が CLEAN の
# ときだけ通す。CI fail / 進行中 / BLOCKED (UNSTABLE/BLOCKED/DIRTY/UNKNOWN 等) は deny。
#
# 背景: CI green を確認せず gh pr merge して main を壊す事故 (K-032) が 2 回発生。
# レビュー観点の確認と CI green 確認は別ゲート。これを機械的に物理強制する。

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# `gh pr merge` が「コマンド位置」(行頭 or シェル区切り直後) にあるときだけ対象にする。
# コミットメッセージや PR 本文など引用符内の文字列にマッチしないよう、区切り文字
# (`;` `&` `|` 改行) 直後 or 先頭の gh pr merge に限定する。
if ! echo "$CMD" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge'; then
  exit 0
fi

# PR 番号を抽出 (`gh pr merge 83 ...` の数字)。番号省略 (現在ブランチ) も拾えないので
# その場合は安全側で「番号を明示せよ」と促す。
PR_NUM=$(echo "$CMD" | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[0-9]+' | grep -oE '[0-9]+$')

if [ -z "$PR_NUM" ]; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"PR 番号を明示してください (例: gh pr merge 83 ...)。番号なしだと CI 状態を機械検証できません (K-032 再発防止)。"}}
EOF
  exit 0
fi

# mergeStateStatus を取得 (gh は CWD のリポジトリを対象にする)
STATE=$(gh pr view "$PR_NUM" --json mergeStateStatus -q .mergeStateStatus 2>/dev/null)

if [ "$STATE" = "CLEAN" ]; then
  # green。素通り (permissionDecision を返さず通常フローへ)
  exit 0
fi

# CLEAN 以外はブロック。状態を理由に含める。
REASON="PR #${PR_NUM} の mergeStateStatus が '${STATE:-取得失敗}' です (CLEAN ではない)。CI green を確認してからマージしてください (K-032 再発防止)。CI 進行中なら完了を待つ、fail なら修正する。"
jq -n --arg r "$REASON" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
exit 0
