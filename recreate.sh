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

echo "==> 校验旧提交是否已失效"
for sha in 11020b23916744c277afded4c0a6b11f4206a22e 12c01b1b07951df54d0e1163d76079445f437dac; do
  code=$(gh api "repos/${REPO}/commits/${sha}" --jq '.sha' 2>/dev/null || echo 404)
  echo "  ${sha:0:7} -> ${code:0:12}"
done
echo "完成：https://github.com/${REPO}"
