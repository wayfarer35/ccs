// post-commit hook：按刚提交的 commit message 前缀自增 package.json 版本号，
// 并用 `git commit --amend --no-edit` 把版本变更并入本次提交。
// 纯 Node ESM，零运行时依赖。由 scripts/git-hooks/install.mjs 复制到 .git/hooks/。
//
// 为什么用 post-commit 而非 prepare-commit-msg：
//   prepare-commit-msg 时 commit 的 tree 已锁定，`git add` 无法进入本次提交。
//   pre-commit 能改 index 但拿不到 message（COMMIT_EDITMSG 尚未写入）。
//   唯一能"读消息 + 改本次提交内容"的可靠途径是 post-commit + amend。
//
// 规则：fix:/fix(scope): → patch++；其它前缀 → minor++（patch 归零）；major 始终手动。
// 守卫（不 bump）：
//   CCS_NO_BUMP=1 / CCS_BUMPING=1（防 amend 递归）/ merge commit / cherry-pick /
//   本次提交已手动改 package.json version 行。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * 按 kind 递增三段式版本号。
 * - 'patch'：patch+1（0.1.9 → 0.1.10）
 * - 'minor'：minor+1、patch 归零（0.1.9 → 0.2.0）
 * - 'major' 不支持（hook 永不自动改 major，由用户手动排板）。
 * 前导 `\d+.\d+.\d+` 之后的预发布/构建标记会被丢弃。
 */
export function bumpVersion(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) throw new Error(`invalid version: ${version}`);
  let [maj, min, pat] = [+m[1], +m[2], +m[3]];
  if (kind === 'patch') pat += 1;
  else if (kind === 'minor') { min += 1; pat = 0; }
  else throw new Error(`unsupported kind: ${kind}`); // major 不进此函数
  return `${maj}.${min}.${pat}`;
}

/**
 * 解析 commit message 第一行 → 'patch' | 'minor'。
 * fix: / fix(scope): → 'patch'；其余（feat/chore/docs/无前缀…）→ 'minor'。
 */
export function parseBumpKind(firstLine) {
  return /^\s*fix(\([^)]+\))?\s*:/i.test(firstLine) ? 'patch' : 'minor';
}

function sh(args, opts = {}) {
  return execSync(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
}

function main() {
  // 守卫 1：显式禁用本次 bump
  if (process.env.CCS_NO_BUMP === '1') process.exit(0);
  // 守卫 2：amend 递归保护——本 hook 自身触发的 amend 不再 bump
  if (process.env.CCS_BUMPING === '1') process.exit(0);
  // 守卫 3：cherry-pick 进行中（post-commit 阶段 CHERRY_PICK_HEAD 仍存在）
  if (existsSync('.git/CHERRY_PICK_HEAD')) process.exit(0);

  // 守卫 4：merge commit（多父）跳过
  const parents = sh('git rev-list --parents -n 1 HEAD').trim().split(/\s+/);
  if (parents.length > 2) process.exit(0); // HEAD + 2 个父 = merge

  // 守卫 5：本次提交已手动改 package.json version 行 → 尊重，不重复 bump
  const diffStat = sh('git show --name-only --format= HEAD -- package.json');
  if (diffStat.includes('package.json')) {
    const diff = sh('git show HEAD -- package.json');
    if (/^\+\s*"version"\s*:/m.test(diff)) process.exit(0);
  }

  // 读刚提交的 commit message 第一行，按前缀判断递增段位
  const firstLine = sh('git log -1 --format=%s').split('\n')[0] ?? '';
  const kind = parseBumpKind(firstLine);

  // bump + 写回（保持 2 空格缩进 + 尾随换行，与现有格式一致）
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkg.version = bumpVersion(pkg.version, kind);
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

  // 用 amend 把 version 并入本次提交；CCS_BUMPING=1 防止 amend 触发的 post-commit 递归 bump。
  // --no-edit 保留原 message；GIT_EDITOR=true 兜底，确保任何环境都不卡在编辑器。
  execSync('git add package.json', { stdio: 'ignore' });
  execSync('git commit --amend --no-edit', {
    stdio: 'ignore',
    env: { ...process.env, CCS_BUMPING: '1', GIT_EDITOR: 'true' },
  });
}

// 仅当直接执行（非被 import 测试）时跑 main
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
