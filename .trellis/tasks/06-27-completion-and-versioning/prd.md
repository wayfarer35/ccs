# ccs tab 补全与版本号自增

## Goal

提升 `ccs` 命令行的日常易用性：
1. 让 shell 在 `ccs` 后能 tab 补全子命令、provider 名、preset key 等动态配置名，免去记忆负担。
2. 让项目版本号随提交自动递增，无需手动 bump，并消除现有「版本号两处源头不同步」的隐患。

## Background

- `ccs` 是手写 `process.argv` 解析的 CLI（无 commander/oclif），子命令：`list/ls`、`presets`、`create`、`edit`、`remove/rm`、`common`、`show`、`config`、`use`，外加 `ccs <name>` 直接启动具名 provider。
- provider 名来自 `~/.ccs/providers/*.settings.json`（`listProviders()`，完全动态）；preset key 来自内置 `presets.json` + 用户 `~/.ccs/presets.json`（`presetList()`，半动态）。这两类是「难记的配置名」，是补全的核心价值。
- 版本号当前有两处源头：`package.json` 的 `0.1.0` 与 `src/cli.ts` 的 `const VERSION = '0.1.0'`；`tests/cli-main.test.ts:59` 还硬编码断言 `'0.1.0'`。三者必须收敛为单一真源。

## Requirements

### R1 — Tab 补全（子任务 `06-27-cli-completion`）
- 提供 `ccs completion <shell>` 命令，输出对应 shell 的补全脚本（MVP：bash + zsh）。
- 补全脚本通过回调隐藏命令 `ccs __complete <words...>` 获取动态候选，候选含：子命令、provider 名、preset key。
- 上下文感知：`edit/remove/show <Tab>` 补 provider 名；`create <Tab>` 补 preset key；`config locale <Tab>` 补 `en|zh-CN`。
- `npm install -g ccs` 时通过 postinstall 自动把补全 `eval` 行写入 `~/.bashrc`、`~/.zshrc`（幂等；非全局安装跳过），无需用户手动配置。
- 不引入新的运行时依赖；补全脚本对 ccs 未安装/不在 PATH 时安全降级（不报错）。

### R2 — 版本号自增（子任务 `06-27-version-auto-bump`）
- 版本号收敛为单一真源（`package.json`），`cli.ts` 与测试均从该源读取。
- 三段式递增：`fix:` → patch++，其它前缀 → minor++（patch 归零），major 由用户手动。
- 用 `prepare-commit-msg` hook 解析 commit message 前缀，递增后写回 `package.json` 并随提交入库。
- 有保护：merge/squash/amend/cherry-pick、手动已改版本号、或 `CCS_NO_BUMP=1` 时不 bump。
- hook 脚本纳入版本库，提供 `npm run hooks:install` 一键安装到本地 `.git/hooks/`。

## Acceptance Criteria（跨子任务集成）

- [ ] `eval "$(ccs completion bash)"` 后，`ccs <Tab>` 列出全部子命令与已有 provider 名；`ccs show <Tab>` 仅列 provider 名；`ccs create <Tab>` 列 preset key；`ccs config locale <Tab>` 列 `en zh-CN`。
- [ ] zsh 下 `compdef` 等价补全同样生效。
- [ ] `npm install -g ccs` 自动把补全 `eval` 行写入 `~/.bashrc` 与 `~/.zshrc`（幂等）；非全局安装不写。
- [ ] `ccs --version` 与 `package.json` 的 `version` 字段始终一致（单一真源）。
- [ ] `fix: xxx` 提交 → patch +1（`0.1.9→0.1.10`）；`feat: xxx` 等其它前缀提交 → minor +1、patch 归零（`0.1.9→0.2.0`）；major 仅手动。
- [ ] `git commit --amend` / merge / squash / `CCS_NO_BUMP=1 git commit` / 手动已改 version 行 均不 bump。
- [ ] `npm test` 全绿；新增/改动覆盖率达 80% 门槛（`formUi` 除外）。
- [ ] README 补一节「Shell 补全」与「版本自增」使用说明。

## Notes

- 两个子任务相互独立，可分别实现、分别验收。建议先做 R2（版本单一真源 + 三段式自增），再做 R1（补全 + postinstall 自动安装），互不阻塞。
- 版本递增为简化二分：`fix:`→patch，其它→minor，major 手动；详见 version 子任务 design.md。
- 补全自动安装用 postinstall + `npm_config_global` 守卫 + 幂等标记块；详见 cli-completion 子任务 design.md。
