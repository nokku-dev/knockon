#!/bin/bash
# .claude/hooks/stall-detection.sh
# PostToolUse (Edit|Write) で実行
# 同一ファイルへの編集回数をカウントし、3回以上で警告を返す

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_result.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

EDIT_LOG="/tmp/claude-edit-log-$$"
touch "$EDIT_LOG"

# ファイルパスを記録
echo "$FILE_PATH" >> "$EDIT_LOG"

# 同一ファイルの編集回数をカウント
COUNT=$(grep -c "^${FILE_PATH}$" "$EDIT_LOG")

if [ "$COUNT" -ge 3 ]; then
  jq -n --arg file "$FILE_PATH" --arg count "$COUNT" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse"
    },
    transcript: ("⚠️ 迷走検知: " + $file + " を " + $count + " 回編集しています。一度立ち止まって状況を整理してください。KNOWLEDGE.md への記録を検討してください。")
  }'
fi

exit 0
