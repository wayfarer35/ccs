# 版本号提交自增

## Goal

让项目版本号随每次 git commit 按前缀自动递增相应段位，并消除现有「版本号多处源头不同步」的隐患。

## 版本递增规则（三段式）

- `major.minor.patch`
- commit message 前缀 `fix:` / `fix(scope):` → **patch++**
- 其它任何前缀（feat/chore/docs/refactor/…，甚至无前缀）→ **minor++**
- **major 由用户手动排板**，hook 永不自动改 major。
- 用户手动改了 `package.json` 的 version 行后提交 → hook 尊重之，不重复 bump。

## Requirements

- 版本号收敛为单一真源：`package.json` 的 `version`。`cli.ts` 的 `VERSION` 与测试断言均改为运行时从该源读取，不再硬编码。
- `prepare-commit-msg` hook 解析 commit message 第一行前缀，按规则递增，写回 `package.json` 并 `git add`，使版本变更随该次提交入库。
- 守卫（不 bump）：
  - `CCS_NO_BUMP=1`
  - merge / squash / amend（prepare-commit-msg 的 source ∈ {merge, squash, commit}）
  - cherry-pick（CHERRY_PICK_HEAD 存在）
  - 当次已手动改 `package.json` 的 version 行
- hook 脚本纳入版本库（`scripts/git-hooks/prepare-commit-msg` + `bump.mjs`），提供 `npm run hooks:install` 一键安装到本地 `.git/hooks/`。
- 无新增运行时依赖。

## Acceptance Criteria

- [ ] `ccs --version` 输出 == `node -p "require('./package.json').version"`，始终一致。
- [ ] `tests/cli-main.test.ts` 不再硬编码 `'0.1.0'`，改为从 `package.json` 读取期望值。
- [ ] `fix: xxx` 提交后 patch +1（如 `0.1.0 → 0.1.1`）；`feat: xxx` 提交后 minor +1（`0.1.0 → 0.2.0`），patch 归零。
- [ ] `patch` 进位正确：`0.1.9 --fix:--> 0.1.10`；`minor` 进位正确：`0.1.9 --feat:--> 0.2.0`。
- [ ] `git commit --amend`、merge commit、squash、`CCS_NO_BUMP=1 git commit` 均**不**再 bump。
- [ ] 手动改 version 行后提交，hook 不重复 bump。
- [ ] `npm run hooks:install` 后 `.git/hooks/prepare-commit-msg` 存在且可执行。
- [ ] `npm test` 全绿；`version.ts` 与 `bumpVersion`/`parseBumpKind` 纯函数覆盖率 ≥80%。
- [ ] README 增补「版本自增」节说明规则与跳过方式。

## Notes

- 用 `prepare-commit-msg` 而非 `pre-commit`：前者能拿到 commit message 内容用于前缀判断，且其 source 参数天然区分 amend/merge/squash。
- 策略为简化的二分（fix→patch，其余→minor），不做 conventional-commits 全套 major/patch 分级；major 始终手动。
- hook 不依赖 husky，纯 Node + sh 入口 + npm 安装脚本，零运行时依赖。
