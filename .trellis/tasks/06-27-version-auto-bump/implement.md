# Implement — 版本号提交自增

> 建议先于「cli-completion」执行：版本单一真源是独立改动。

## 执行清单（按序）

- [ ] 1. 新建 `src/version.ts`
  - `getVersion()`：向上查找 package.json 读取 version，带缓存与兜底 `'0.0.0'`（见 design）。
  - 纯运行时 fs，不触碰 rootDir。

- [ ] 2. `src/cli.ts` 收敛 VERSION
  - 删 `const VERSION = '0.1.0';`，改 `import { getVersion } from './version.js'; const VERSION = getVersion();`
  - `${VERSION}` 引用不变。

- [ ] 3. 更新 `tests/cli-main.test.ts`
  - `expect(log).toHaveBeenCalledWith('0.1.0')` → `expect(log).toHaveBeenCalledWith(getVersion())`（import `getVersion`）。

- [ ] 4. 新建 `tests/version.test.ts`
  - 断言 `getVersion()` === `require('../package.json').version`（或 `import pkg`）。
  - 形如 `^\d+\.\d+\.\d+`。覆盖率 ≥80%。

- [ ] 5. 新建 hook 脚本
  - `scripts/git-hooks/bump.mjs`：
    - 导出纯函数 `bumpVersion(version, kind)`、`parseBumpKind(firstLine)`（见 design）。
    - main 守卫链：`CCS_NO_BUMP` → source∈{merge,squash,commit} → `CHERRY_PICK_HEAD` → 已手动改 staged version。
    - 读 `$1` message 第一行 → `parseBumpKind` → `bumpVersion` → 写回 `package.json`（2 空格 + 尾换行）→ `git add package.json`。
  - `scripts/git-hooks/prepare-commit-msg`（sh 入口）：`#!/bin/sh` + `exec node "$(dirname "$0")/bump.mjs" "$@"`。
  - `chmod +x` 两文件。

- [ ] 6. 新建 `scripts/git-hooks/install.mjs`
  - 把 `prepare-commit-msg` 复制到 `.git/hooks/prepare-commit-msg`，`chmod 0o755`，幂等覆盖；无 `.git` 报错提示。

- [ ] 7. `package.json` scripts
  - 增 `"hooks:install": "node scripts/git-hooks/install.mjs"`。
  - **不**用 `prepare`。

- [ ] 8. 新建 `tests/bump.test.ts`
  - 纯函数：`bumpVersion` 各边界（`0.1.9→0.1.10`、`0.1.9→0.2.0`、`0.0.0→0.0.1`、非法 version 抛错、`'major'` 抛错）。
  - `parseBumpKind`：`fix:`/`fix(scope):`→`'patch'`；`feat:`/`chore:`/无前缀→`'minor'`。
  - 集成测（推荐）：临时 git repo 验证 `fix:`→patch+1、`feat:`→minor+1、amend/merge/CCS_NO_BUMP/手动改 version 跳过。

- [ ] 9. README 增补「版本自增」节
  - 规则：`fix:`→patch，其它→minor，major 手动。
  - 安装：`npm run hooks:install`。
  - 跳过：`CCS_NO_BUMP=1`；amend/merge 自动跳过；手动改 version 行则尊重。

- [ ] 10. 质量检查（review gate）
  - `npm run build` 无 TS 错误。
  - `npm test` 全绿；`version.ts` / 纯函数覆盖率 ≥80%。
  - 手动验证：`npm run hooks:install` → `git commit --allow-empty -m "fix: t"` → patch+1 且 package.json 在提交内；`-m "feat: t"` → minor+1；`--amend` 不再 bump。

## 验证命令

```bash
npm run build
npm test -- version bump
node -p "require('./package.json').version"
node dist/cli.js --version
npm run hooks:install
git commit --allow-empty -m "fix: test"   # patch +1
git show --stat HEAD | grep package.json
git commit --allow-empty -m "feat: test"  # minor +1, patch 归零
git commit --amend --no-edit              # 不 bump
CCS_NO_BUMP=1 git commit --allow-empty -m "fix: x"  # 不 bump
```

## 回滚点

- `src/version.ts` + cli.ts：删 import、还原 `const VERSION = '0.1.0'`、测试同步还原即恢复。
- hook：`rm .git/hooks/prepare-commit-msg` + 删 `scripts/git-hooks/` 即完全移除，无数据迁移。
