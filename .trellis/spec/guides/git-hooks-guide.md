# Git Hooks Guide

> 选型契约与踩坑记录：在 ccs 仓库写 git hook 脚本前必读。

---

## 何时读这份

- 新增 / 改动 `scripts/git-hooks/` 下的 hook。
- 需要「读 commit message」或「把文件改动并入本次提交」的 hook 逻辑。
- 排查「bump 的 version 留在暂存区却没进 HEAD」类问题。

---

## 核心契约：message 与 tree 的可读/可写窗口

git 各 hook 能拿到什么、能改什么，**窗口是错开的**。下表是实测结论（不是文档字面意思）：

| Hook | 能读 commit message？ | 改动能进本次 commit？ | 原因 |
|---|---|---|---|
| `pre-commit` | ❌（`.git/COMMIT_EDITMSG` 尚未写入，`-m` 内容此阶段不可见） | ✅（tree 未生成，`git add` 后正常入库） | message 还没落盘 |
| `prepare-commit-msg` / `commit-msg` | ✅ | ❌（commit 的 tree 已从 index 快照生成并锁定，`git add` 只进暂存区，**实测进不了本次 commit**） | tree 已锁定 |
| `post-commit` + `--amend` | ✅（`git log -1 --format=%s`） | ✅（commit 创建后 amend 并入） | 唯一可靠 |

**结论**：若 hook 必须**同时**读 message 前缀**且**把改动并入本次提交，唯一可靠方案是 `post-commit` + `git commit --amend --no-edit`。git 文档关于「prepare-commit-msg 阶段修改 index 会进 commit」的表述具有误导性——实测不进。

---

## `--amend` 递归防护（必做）

`git commit --amend` 会再次触发 `post-commit`，无限递归。用环境变量守卫：

```js
if (process.env.CCS_BUMPING === '1') process.exit(0);  // 防 amend 递归
// ... bump + 写回 ...
execSync('git commit --amend --no-edit', {
  env: { ...process.env, CCS_BUMPING: '1', GIT_EDITOR: 'true' },
});
```

amend 会改变 commit hash——仅适用于「本地刚提交、push 前完成 bump」的场景。

---

## 跳过 bump 的守卫链（按序短路）

`scripts/git-hooks/bump.mjs` 的 main 守卫顺序：

1. `CCS_NO_BUMP=1` — 显式禁用。
2. `CCS_BUMPING=1` — 防 amend 递归（见上）。
3. `.git/CHERRY_PICK_HEAD` 存在 — cherry-pick 进行中跳过。
4. `git rev-list --parents -n 1 HEAD` 多父 — merge commit 跳过。
5. `git show HEAD -- package.json` 含 `+  "version":` — 本次已手动改 version 行，尊重手动值，不重复 bump。

---

## 版本单一真源

- `package.json` 的 `version` 是唯一真源。`src/cli.ts` 的 `VERSION` 经 `src/version.ts` 的 `getVersion()` 运行时向上查找读取，**绝不硬编码**。
- 测试断言用 `getVersion()`，不写字面量版本号——否则 bump 后立即红。
- `tsconfig.json` 的 `rootDir: ./src` 禁止在 src 内 `import '../package.json'`，故用运行时 fs 查找而非静态 import。

---

## 安装与产物

- `npm run hooks:install`（`scripts/git-hooks/install.mjs`）把 `post-commit` + `bump.mjs` 复制到 `.git/hooks/`，`chmod 0o755`，幂等覆盖；并清理旧版遗留的 `prepare-commit-msg`（若为本工具产物）。
- **不**用 `prepare` 脚本，避免依赖安装时误触发。
- `.git/hooks/` 不进版本库；脚本真源在 `scripts/git-hooks/`。

---

## 递增规则（ccs 项目约定）

| commit 第一行前缀 | 递增 |
|---|---|
| `fix:` / `fix(scope):` | patch++ |
| 其它（feat/chore/docs/无前缀…） | minor++（patch 归零） |
| major | 永远手动，hook 不动 |

`bumpVersion(version, kind)` 纯函数不接受 `'major'`，调用方也从不传。纯函数与 `parseBumpKind` 均导出供单测。
