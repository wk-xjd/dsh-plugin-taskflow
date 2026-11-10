#!/usr/bin/env bash
# 彻底清空远端历史：删仓库 → 用当前（已清洗）工作树重建 → 重新加 topic
# 前置：gh auth refresh -s delete_repo -h github.com
set -euo pipefail
cd "$(dirname "$0")"

OWNER="${OWNER:-wk-xjd}"
REPO="${OWNER}/dsh-plugin-taskflow"

echo "==> 删除 ${REPO}"
gh repo delete "$REPO" --yes

echo "==> 重建并推送"
gh repo create "$REPO" --public --source=. --remote=origin --push

echo "==> 加 topic 与描述"
gh repo edit "$REPO" \
  --add-topic dsh-plugin \
  --description "TaskFlow for DeepSeek Harness: liquid-glass task list, per-task summaries, per-turn digests"

echo "==> 校验"
count=$(gh api "repos/${REPO}/commits" --jq 'length')
echo "  远端提交数: ${count}（重建后应为 1）"
git ls-remote --heads origin

echo "完成：https://github.com/${REPO}"
