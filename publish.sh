#!/usr/bin/env bash
# 一条龙：改写 owner → 发布 npm → 建 GitHub 仓库并推送 → 提交到 dsh-plugin.org
#
# 前置：npm login（已登录）；gh auth login（已登录）
# 用法：
#   ./publish.sh                    # 默认 owner = wk-xjd
#   OWNER=kkt-xxx ./publish.sh      # 换成别的 GitHub 账号 / 组织
set -euo pipefail
cd "$(dirname "$0")"

OWNER="${OWNER:-wk-xjd}"
REPO_NAME="dsh-plugin-taskflow"
REPO="${OWNER}/${REPO_NAME}"

# 把仓库地址统一改成目标 owner（package.json / README / 提交正文）
OLD_OWNER="$(grep -o 'github.com/[^/]*/dsh-plugin-taskflow' package.json | head -1 | cut -d/ -f2)"
if [ -n "$OLD_OWNER" ] && [ "$OLD_OWNER" != "$OWNER" ]; then
  echo "==> 改写仓库地址：$OLD_OWNER → $OWNER"
  sed -i '' "s|$OLD_OWNER/dsh-plugin-taskflow|$OWNER/dsh-plugin-taskflow|g" package.json README.md SUBMIT.md
  git add -A && git commit -qm "chore: point repository urls at ${OWNER}"
fi

echo "==> 1/3 发布 npm 包"
npm publish --access public

echo "==> 2/3 建仓库并推送 ${REPO}"
if gh repo view "$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${REPO}.git"
  git push -u origin HEAD
else
  gh repo create "$REPO" --public --source=. --remote=origin --push
fi
gh repo edit "$REPO" \
  --add-topic dsh-plugin \
  --description "TaskFlow for DeepSeek Harness: liquid-glass task list, per-task summaries, per-turn digests"

echo "==> 3/3 提交到插件市场"
gh issue create -R dshplugin/dsh-plugin-hub \
  --title "[插件提交] ${REPO} — 液态玻璃任务清单 + 每任务小结 + 分段摘要" \
  --body-file SUBMIT.md

echo
echo "完成。收录后详情页： https://dsh-plugin.org/plugins/${OWNER}/${REPO_NAME}"
