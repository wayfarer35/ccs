// 把 prepare-commit-msg（+ bump.mjs）安装到本地 .git/hooks/，幂等覆盖。
// 用法：npm run hooks:install。不用 prepare 钩子，避免依赖安装时误触发。

import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // scripts/git-hooks/

// 向上查找 .git（仓库根），兼容从子目录调用
let gitDir = null;
for (let dir = here; ; dir = dirname(dir)) {
  const candidate = join(dir, '.git');
  if (existsSync(candidate)) { gitDir = candidate; break; }
  if (dirname(dir) === dir) break; // 文件系统根
}

if (!gitDir) {
  console.error(`No .git directory found (searched upward from ${here}).`);
  console.error('Run this script from inside a git repository.');
  process.exit(1);
}

const hooksDir = join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

// prepare-commit-msg 是 sh 入口，bump.mjs 是其调用的实际逻辑；两者需同目录。
const files = ['prepare-commit-msg', 'bump.mjs'];
for (const f of files) {
  const dest = join(hooksDir, f);
  copyFileSync(join(here, f), dest);
  chmodSync(dest, 0o755); // sh 入口需可执行；bump.mjs 经 node 调用，+x 无害
}

console.log(`Installed git hooks → ${hooksDir}`);
for (const f of files) console.log(`  - ${f}`);
