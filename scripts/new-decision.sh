#!/bin/bash
# Generate a new decision log (ADR) with auto-incremented ID.
#
# Usage:
#   ./scripts/new-decision.sh <kebab-case-title>
#
# Example:
#   ./scripts/new-decision.sh accent-color-decision

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DECISIONS_DIR="$REPO_ROOT/docs/decisions"

mkdir -p "$DECISIONS_DIR"

# Compute next ID
LAST_NUM=$(ls "$DECISIONS_DIR"/[0-9]*.md 2>/dev/null \
  | sed 's/.*\///' \
  | grep -oE '^[0-9]+' \
  | sort -n \
  | tail -1)
LAST_NUM=${LAST_NUM:-0}
NEXT_NUM=$(printf "%04d" $((10#$LAST_NUM + 1)))

# Title from arg
if [ -z "$1" ]; then
  echo "Usage: $0 <kebab-case-title>"
  echo "Example: $0 accent-color-decision"
  exit 1
fi

# Validate title format (lowercase, digits, hyphens only)
if ! echo "$1" | grep -qE '^[a-z0-9][a-z0-9-]*[a-z0-9]$'; then
  echo "Error: title must be kebab-case (lowercase letters, digits, hyphens)"
  echo "Got: $1"
  exit 1
fi

NEW_FILE="$DECISIONS_DIR/${NEXT_NUM}-$1.md"

if [ -f "$NEW_FILE" ]; then
  echo "Error: $NEW_FILE already exists"
  exit 1
fi

# Project name from git remote or directory
PROJECT_NAME=$(basename "$REPO_ROOT")

# Generate from template if exists, otherwise inline
TEMPLATE="$DECISIONS_DIR/_template.md"
if [ -f "$TEMPLATE" ]; then
  cp "$TEMPLATE" "$NEW_FILE"
  # Cross-platform sed (works on macOS BSD sed and Linux GNU sed)
  sed -i.bak "s/id: NNNN/id: $NEXT_NUM/" "$NEW_FILE"
  sed -i.bak "s/date: YYYY-MM-DD/date: $(date +%Y-%m-%d)/" "$NEW_FILE"
  sed -i.bak "s/project: project-name/project: $PROJECT_NAME/" "$NEW_FILE"
  rm -f "$NEW_FILE.bak"
else
  cat > "$NEW_FILE" <<EOF
---
id: $NEXT_NUM
date: $(date +%Y-%m-%d)
project: $PROJECT_NAME
tags: []
status: accepted
supersedes: []
superseded-by: []
---

# 判断のタイトル

## 文脈

## 検討した選択肢

## 決定

## 理由

## 想定される影響
EOF
fi

echo "Created: $NEW_FILE"
