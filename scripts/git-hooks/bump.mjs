// prepare-commit-msg hook：按 commit message 前缀自增 package.json 版本号。
// 纯 Node ESM，零运行时依赖。由 scripts/git-hooks/install.mjs 复制到 .git/hooks/。
//
// 规则：fix:/fix(scope): → patch++；其它前缀 → minor++（patch 归零）；major 始终手动。
// 守卫（不 bump）：CCS_NO_BUMP=1 / source∈{merge,squash,commit}(amend) /
//                  CHERRY_PICK_HEAD 存在 / 当次已手动改 package.json version 行。

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

function main() {
  const msgFile = process.argv[2];
  const source = process.argv[3];

  // 守卫 1：显式禁用
  if (process.env.CCS_NO_BUMP === '1') process.exit(0);
  // 守卫 2：amend(--amend→'commit') / merge / squash 天然跳过
  if (['merge', 'squash', 'commit'].includes(source)) process.exit(0);
  // 守卫 3：cherry-pick 进行中
  if (existsSync('.git/CHERRY_PICK_HEAD')) process.exit(0);

  // 守卫 4：当次已手动改 package.json 的 version 行 → 尊重，不重复 bump
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  if (staged.split('\n').includes('package.json')) {
    const diff = execSync('git diff --cached -- package.json', { encoding: 'utf8' });
    if (/^\+\s*"version"\s*:/m.test(diff)) process.exit(0);
  }

  // 读 commit message 第一行，按前缀判断递增段位
  const firstLine = readFileSync(msgFile, 'utf8').split('\n')[0] ?? '';
  const kind = parseBumpKind(firstLine);

  // bump + 写回（保持 2 空格缩进 + 尾随换行，与现有格式一致）+ stage 入本次提交
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkg.version = bumpVersion(pkg.version, kind);
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  execSync('git add package.json');
}

// 仅当直接执行（非被 import 测试）时跑 main
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
