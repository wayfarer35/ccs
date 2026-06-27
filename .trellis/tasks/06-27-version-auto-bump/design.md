# Design — 版本号提交自增

## 现状与问题

| 位置 | 当前值 | 问题 |
|---|---|---|
| `package.json` version | `0.1.0` | 真源 |
| `src/cli.ts` `const VERSION` | `0.1.0` | 硬编码副本，不同步 |
| `tests/cli-main.test.ts:59` | `expect(log).toHaveBeenCalledWith('0.1.0')` | 硬编码，bump 后立即红 |

三处收敛为单一真源。

## 递增规则实现

| commit 第一行前缀 | 递增 | 例 |
|---|---|---|
| `fix:` / `fix(scope):` | patch++ | `0.1.9 → 0.1.10` |
| 其它（feat/chore/docs/无前缀…） | minor++（patch 归零） | `0.1.9 → 0.2.0` |
| （major） | 手动，hook 不动 | — |

### 纯函数（放 `bump.mjs` 导出，便于单测）

```js
// 语义：把 '0.1.9' 按 kind 递增
export function bumpVersion(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) throw new Error(`invalid version: ${version}`);
  let [maj, min, pat] = [+m[1], +m[2], +m[3]];
  if (kind === 'patch') pat += 1;
  else if (kind === 'minor') { min += 1; pat = 0; }
  else throw new Error(`unsupported kind: ${kind}`); // major 不进此函数
  return `${maj}.${min}.${pat}`;
}

// 解析 commit message 第一行 → 'patch' | 'minor'
export function parseBumpKind(firstLine) {
  return /^\s*fix(\([^)]+\))?\s*:/i.test(firstLine) ? 'patch' : 'minor';
}
```

> 注：major 永远不由 hook 产生；`bumpVersion` 不接受 `'major'`，调用方也从不传。

## Hook 选型：prepare-commit-msg（非 pre-commit）

**为什么不用 pre-commit**：pre-commit 在 commit message 写入前运行，**拿不到 message 内容**，无法判断前缀。

**为什么用 prepare-commit-msg**：
- 参数 `$1` = 临时 message 文件路径 → 可读第一行判断前缀。
- 参数 `$2` = source ∈ {`message`, `template`, `merge`, `squash`, `commit`} → 天然区分：
  - `merge` / `squash` → 跳过
  - `commit`（即 `--amend`）→ 跳过
  - `message`（`-m`/`-F`）/ `template`（交互编辑）→ 正常处理
- 此阶段 index 已 staged，`git add package.json` 能更新本次 commit 的 index（git 接着用更新后的 index 创建 commit，package.json 随提交入库）。这是 git 允许的标准做法。

## bump.mjs 主流程

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [msgFile, source] = [process.argv[2], process.argv[3]];

// 守卫
if (process.env.CCS_NO_BUMP === '1') process.exit(0);
if (['merge','squash','commit'].includes(source)) process.exit(0); // amend/merge/squash
if (existsSync('.git/CHERRY_PICK_HEAD')) process.exit(0);

// 已手动改 version → 尊重
const staged = execSync('git diff --cached --name-only', {encoding:'utf8'});
if (staged.split('\n').includes('package.json')) {
  const diff = execSync('git diff --cached -- package.json', {encoding:'utf8'});
  if (/^\+\s*"version"\s*:/m.test(diff)) process.exit(0);
}

// 读 message 第一行
const firstLine = readFileSync(msgFile,'utf8').split('\n')[0] ?? '';
const kind = parseBumpKind(firstLine);

// bump + 写回 + add
const pkg = JSON.parse(readFileSync('package.json','utf8'));
pkg.version = bumpVersion(pkg.version, kind);
writeFileSync('package.json', JSON.stringify(pkg,null,2)+'\n');
execSync('git add package.json');
```

`scripts/git-hooks/prepare-commit-msg`（sh 入口）：
```sh
#!/bin/sh
exec node "$(dirname "$0")/bump.mjs" "$@"
```

## 单一真源：`src/version.ts`

`tsconfig.json` 的 `rootDir: ./src`、`include: src/**/*.ts`，不能在 src 内 `import '../package.json'`（超 rootDir）。用运行时向上查找：

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let cached: string | undefined;
export function getVersion(): string {
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
      if (typeof pkg?.version === 'string') { cached = pkg.version; return cached; }
    } catch { /* keep walking up */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}
```

运行兼容：开发 `dist/version.js` 向上找到根 `package.json`；全局安装 `<prefix>/lib/node_modules/ccs/dist/version.js` 向上找到包根 `package.json`。

`src/cli.ts`：删 `const VERSION = '0.1.0'`，改 `import { getVersion } from './version.js'; const VERSION = getVersion();`。

`tests/cli-main.test.ts`：`expect(log).toHaveBeenCalledWith(getVersion())`。

## 安装：`npm run hooks:install`

`package.json` 增 `"hooks:install": "node scripts/git-hooks/install.mjs"`。`install.mjs`：把 `prepare-commit-msg` 复制到 `.git/hooks/prepare-commit-msg`，`chmod 0o755`，幂等覆盖。不用 `prepare`（避免被依赖安装时误触发）。

## 测试策略

- `tests/version.test.ts`：`getVersion()` === `package.json.version`，形如 `^\d+\.\d+\.\d+`。
- `tests/bump.test.ts`：
  - 纯函数表驱动：`bumpVersion('0.1.9','patch')`→`'0.1.10'`；`bumpVersion('0.1.9','minor')`→`'0.2.0'`；`bumpVersion('1.0.0','patch')`→`'1.0.1'`。
  - `parseBumpKind`：`'fix: x'`/`'fix(scope): x'`→`'patch'`；`'feat: x'`/`'chore: x'`/`'x'`→`'minor'`。
  - 集成测（推荐）：临时 git repo 跑 `bump.mjs`，验证 `-m "fix: x"`→patch+1、`-m "feat: x"`→minor+1、amend/merge/CCS_NO_BUMP 跳过、手动改 version 跳过。
- 更新 `tests/cli-main.test.ts` 用 `getVersion()`。
- 覆盖率门槛 80%。

## 不做（Out of Scope）

- conventional-commits 全套 major 自动判断（major 始终手动，符合用户要求）。
- husky 集成、CI 版本校验、自动 `npm publish`。
