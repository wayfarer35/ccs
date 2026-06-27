// 把 post-commit（+ bump.mjs）安装到本地 .git/hooks/，幂等覆盖。
// 用法：npm run hooks:install。不用 prepare 脚本，避免依赖安装时误触发。

import { existsSync, mkdirSync, copyFileSync, chmodSync, unlinkSync, readFileSync } from 'node:fs';
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

// 旧版本曾用 prepare-commit-msg，迁移：若存在且为本工具产物则清理。
const legacy = join(hooksDir, 'prepare-commit-msg');
if (existsSync(legacy)) {
  let txt = '';
  try { txt = readFileSync(legacy, 'utf8'); } catch { /* ignore */ }
  if (txt.includes('bump.mjs')) unlinkSync(legacy);
}

// post-commit 是 sh 入口，bump.mjs 是其调用的实际逻辑；两者需同目录。
const files = ['post-commit', 'bump.mjs'];
for (const f of files) {
  const dest = join(hooksDir, f);
  copyFileSync(join(here, f), dest);
  chmodSync(dest, 0o755); // sh 入口需可执行；bump.mjs 经 node 调用，+x 无害
}

console.log(`Installed git hooks → ${hooksDir}`);
for (const f of files) console.log(`  - ${f}`);
