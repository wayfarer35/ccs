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

## Hook 选型：post-commit + amend（非 prepare-commit-msg / pre-commit）

三候选的取舍（关键：必须"能读 commit message + 能把改动并入本次提交"）：

| Hook | 能读 message？ | 改动能进本次 commit？ | 结论 |
|---|---|---|---|
| `pre-commit` | ❌（COMMIT_EDITMSG 尚未写入，实测为空） | ✅（tree 未生成） | 拿不到前缀 |
| `prepare-commit-msg` / `commit-msg` | ✅ | ❌（tree 已锁定，`git add` 留在暂存区，**实测进不了 commit**） | 改动不入库 |
| **`post-commit` + `--amend`** | ✅（`git log -1 --format=%s`） | ✅（commit 创建后 amend 并入） | **唯一可靠** |

**踩坑记录**：初版用 `prepare-commit-msg`，集成测试 + 真实 commit 都显示 bump 的 version **留在了暂存区，没进 HEAD commit**。根因是 git 在进入 message 类 hook 前，commit 的 tree 已从 index 快照生成并锁定——文档关于"index 修改会进 commit"的表述具有误导性。`pre-commit` 实测拿不到 message（`-m` 的内容此时尚未写入 `.git/COMMIT_EDITMSG`）。最终改用 `post-commit`：commit 创建后读 `git log -1` 拿 message，bump 后 `git commit --amend --no-edit` 把 version 并入本次提交。

**amend 递归防护**：`--amend` 会再次触发 `post-commit`，用环境变量 `CCS_BUMPING=1` 守卫跳过，避免无限递归。amend 会改变 commit hash——对本地刚提交的 commit 无妨（push 前完成）。

**守卫（不 bump）**：
- `CCS_NO_BUMP=1`（显式禁用）
- `CCS_BUMPING=1`（防 amend 递归）
- merge commit（`git rev-list --parents -n 1 HEAD` 多父）
- cherry-pick 进行中（`.git/CHERRY_PICK_HEAD` 存在）
- 本次提交已手动改 `package.json` version 行（`git show HEAD -- package.json` 检测 `+  "version":`）→ 尊重手动值

## bump.mjs 主流程

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function sh(args, opts = {}) {
  return execSync(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
}

function main() {
  if (process.env.CCS_NO_BUMP === '1') process.exit(0);
  if (process.env.CCS_BUMPING === '1') process.exit(0);     // 防 amend 递归
  if (existsSync('.git/CHERRY_PICK_HEAD')) process.exit(0);

  // merge commit（多父）跳过
  const parents = sh('git rev-list --parents -n 1 HEAD').trim().split(/\s+/);
  if (parents.length > 2) process.exit(0);

  // 本次提交已手动改 version → 尊重
  const diffStat = sh('git show --name-only --format= HEAD -- package.json');
  if (diffStat.includes('package.json')) {
    const diff = sh('git show HEAD -- package.json');
    if (/^\+\s*"version"\s*:/m.test(diff)) process.exit(0);
  }

  // 读刚提交的 message 第一行，按前缀判断段位
  const firstLine = sh('git log -1 --format=%s').split('\n')[0] ?? '';
  const kind = parseBumpKind(firstLine);

  // bump + 写回
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkg.version = bumpVersion(pkg.version, kind);
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

  // amend 并入本次提交；CCS_BUMPING=1 防 post-commit 递归
  execSync('git add package.json', { stdio: 'ignore' });
  execSync('git commit --amend --no-edit', {
    stdio: 'ignore',
    env: { ...process.env, CCS_BUMPING: '1', GIT_EDITOR: 'true' },
  });
}
```

`scripts/git-hooks/post-commit`（sh 入口）：
```sh
#!/bin/sh
exec node "$(dirname "$0")/bump.mjs"
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

`package.json` 增 `"hooks:install": "node scripts/git-hooks/install.mjs"`。`install.mjs`：把 `post-commit` + `bump.mjs` 复制到 `.git/hooks/`，`chmod 0o755`，幂等覆盖；并清理旧版遗留的 `prepare-commit-msg`（若为本工具产物）。不用 `prepare` 脚本（避免被依赖安装时误触发）。

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
