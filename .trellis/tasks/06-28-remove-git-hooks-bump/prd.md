# 移除 git hooks bump 机制

## Goal

版本 bump 已统一走 `standard-version`（`npm run release[-major|-minor]` → push tag → `.github/workflows/release.yml` 发 npm）。post-commit hook 那套「每次 commit patch+1 + amend」机制与之理念冲突且重复，彻底移除。

## Requirements

- 删除 `scripts/git-hooks/` 整个目录（`install.mjs`、`bump.mjs`、`post-commit`）。
- 删除 `tests/bump.test.ts`。
- `package.json` 移除 `hooks:install` 脚本。
- `.trellis/spec/guides/git-hooks-guide.md` 删除；`.trellis/spec/guides/index.md` 移除其索引行。
- README 补一节发版流程说明（release 脚本 → push tag → CI 自动发布）。
- 保留 `standard-version` 依赖与 `release*` 脚本、`release.yml`、`src/version.ts` 的运行时版本读取。

## Acceptance Criteria

- [ ] `scripts/git-hooks/` 不存在。
- [ ] `tests/bump.test.ts` 不存在。
- [ ] `package.json` 无 `hooks:install`。
- [ ] spec guides 目录无 `git-hooks-guide.md`，index 无对应行。
- [ ] README 有发版流程说明。
- [ ] `npm run build` 通过。
- [ ] `npm test` 通过（覆盖率仍达 80% 门槛）。
- [ ] 仓库内 `grep -rn "hooks:install\|bump.mjs\|git-hooks"` 无残留（除本任务归档目录）。

## Notes

- 轻量任务，PRD-only。
- hook 从未挂 `prepare`，本地 `.git/hooks/` 是否安装过不影响仓库清理（`.git/hooks/` 不进版本库）。
