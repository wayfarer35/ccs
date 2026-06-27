# Implement — TS 重构 + Vitest 执行计划

## 前置：基线快照

迁移前先记录行为基线，供迁移后逐项比对：

```bash
# 在 git init 之前先跑一遍，捕获当前 .mjs 版本的输出
ccs --help > /tmp/ccs_help.txt 2>&1
ccs list > /tmp/ccs_list.txt 2>&1
ccs presets > /tmp/ccs_presets.txt 2>&1
ccs show <某个现有provider> > /tmp/ccs_show.txt 2>&1   # 若有 provider
```

## 阶段 0：git 初始化（回滚保护，R3）

- [ ] 0.1 `git init`，检查 `.gitignore`（应已忽略 `node_modules`，新增忽略 `dist/`）
- [ ] 0.2 确认 `.gitignore` 含 `node_modules/` 与 `dist/`
- [ ] 0.3 初始提交：`git add -A && git commit -m "chore: baseline .mjs before TS refactor"`
- [ ] 0.4 验证 `ccs --help` 正常（基线可用）

**验证命令**：`git log --oneline` 看到 baseline 提交；`ccs --help` 正常退出。
**回滚点**：本提交是最终回退目标。

## 阶段 1：构建链搭建（不破坏现有 .mjs）

目标：引入 TS 工具链，但 `bin` 仍指 `.mjs`，`ccs` 不受影响。

- [ ] 1.1 `npm i -D typescript @types/node @types/react vitest @vitest/coverage-v8`
- [ ] 1.2 写 `tsconfig.json`（见 design.md §2）
- [ ] 1.3 写 `vitest.config.ts`（见 design.md §7）
- [ ] 1.4 在 `src/` 下新建 `types.ts`（见 design.md §4 类型契约）
- [ ] 1.5 **暂不**改 `package.json` 的 `bin`/`scripts`（保持 .mjs 可用）
- [ ] 1.6 提交：`chore: add TS toolchain, tsconfig, vitest config, types`
- [ ] 1.7 验证 `ccs --help` 正常（未动 bin）

**验证命令**：`npx tsc --version`；`ccs --help` 正常。
**回滚点**：本提交。

## 阶段 2：迁移纯逻辑模块（无 React 依赖，按依赖叶子→上）

顺序：`config` → `presets` → `i18n` → `tui` → `launch` → `form`。

每个文件：
- [ ] 2.x.1 复制 `X.mjs` → `X.ts`（保留 .mjs 不删，本阶段 bin 仍指 .mjs）
- [ ] 2.x.2 加类型注解（参数、返回值、Record），导入改 `.js` 扩展名
- [ ] 2.x.3 `npx tsc --noEmit` 通过
- [ ] 2.x.4 写对应 `tests/X.test.ts`
- [ ] 2.x.5 提交：`refactor: migrate X to TypeScript with tests`

**关键文件重点**：
- `config.ts`：`readJSON<T>(file: string, fallback: T | null = null): T | null`；`listProviders(): string[]`
- `launch.ts`：`redactSettings(obj: ProviderSettings): ProviderSettings`（纯函数，优先测）；`stripCcsKeys`；`buildProviderSettings`
- `form.ts`：`initState`/`buildResult`/`validateState` 加 `FormState` 类型；`buildResult` 的 `if/else` 补 `never` exhaustive（AC4）；`parseBoolEnv`/`parseNumEnv`/`parseEffortEnv` 测边界（空/非法/合法）

**阶段提交后验证**：`npx tsc --noEmit` 零错；`npx vitest run` 通过；`ccs --help` 正常（bin 未动）。
**回滚点**：每文件一提交。

## 阶段 3：迁移 formUi.mjs（React/ink）

- [ ] 3.1 复制 `formUi.mjs` → `formUi.ts`
- [ ] 3.2 加 `@types/react` 类型：`Field` 接口（`{ id: string; kind: 'text'|'password'|'toggle'|'select'|'number'|'button' }`）、`tabFields` 返回类型
- [ ] 3.3 `h = React.createElement` 保持，组件 props 加类型
- [ ] 3.4 `npx tsc --noEmit` 通过（重点处理 ink `useInput`/`useStdout` 类型）
- [ ] 3.5 抽取纯函数测试：`tests/formUi.test.ts` 测 `tabFields`（apikey/models-alias/models-single/options/review 各 tab 的字段列表）
- [ ] 3.6 提交：`refactor: migrate formUi to TypeScript, test pure helpers`

**验证命令**：`npx tsc --noEmit`；`npx vitest run`。
**回滚点**：本提交。

## 阶段 4：迁移 cli.mjs + 切 bin（可用性关键点，R9）

这是 `ccs` 切换到 `dist/` 的临界阶段。

- [ ] 4.1 复制 `cli.mjs` → `cli.ts`，加类型，导入改 `.js`，保留 shebang 首行
- [ ] 4.2 `npx tsc --noEmit` 全量通过
- [ ] 4.3 写 `tests/cli.test.ts`（`cmdList`/`cmdPresets` 输出、`nameValidator`、`validateName`、argv 分发——可用 spawn 或直接调函数）
- [ ] 4.4 `npm run build` → 检查 `dist/` 产物，`dist/cli.js` 含 shebang
- [ ] 4.5 `node dist/cli.js --help` 与基线 `/tmp/ccs_help.txt` 比对一致
- [ ] 4.6 改 `package.json`：`bin` → `dist/cli.js`，`files` → `["dist","README.md"]`，`scripts` 加 `build`/`test`/`coverage`（见 design.md §6）
- [ ] 4.7 `npm link`（刷新全局 `ccs` 指向新 bin）
- [ ] 4.8 验证全局 `ccs --help` / `ccs list` / `ccs presets` 与基线一致
- [ ] 4.9 提交：`refactor: migrate cli to TS, switch bin to dist, add build/test scripts`

**验证命令**：`npm run build && node dist/cli.js --help`；`which ccs && ccs --help`；`npx vitest run --coverage`。
**回滚点**：本提交。**若 `ccs` 不可用**：`git checkout HEAD~`（回到阶段 3），bin 仍指 .mjs，立即可用。

## 阶段 5：清理 .mjs + 文档同步

- [ ] 5.1 删除 `src/*.mjs`（8 个），保留 `src/*.ts` 与 `presets.json`
- [ ] 5.2 `npx tsc --noEmit` + `npx vitest run --coverage` 全绿
- [ ] 5.3 `ccs --help` / `ccs list` / `ccs presets` 最终比对基线
- [ ] 5.4 修正 CLAUDE.md（R8/AC6）：
  - CLI 框架 `commander` → `@clack/prompts`
  - 移除 `chalk`/`marked`（未用），输出样式说明改为 clack 自带样式
  - 入口说明 `src/launch.mjs → src/cli.mjs` → `src/cli.ts`（编译到 `dist/cli.js`）
  - 补充：`npm run build` 构建步骤、`.ts` 源码说明、`npm test`/coverage 说明
- [ ] 5.5 检查 `.claude/rules/` 是否有提到 `.mjs` 需同步（若有则改）
- [ ] 5.6 提交：`refactor: remove legacy .mjs, sync CLAUDE.md to TS toolchain`

**验证命令**：`ls src/*.mjs`（应无结果）；`ccs --help`；`npm run coverage`（formUi 外 ≥80%）。
**回滚点**：本提交。

## 阶段 6：最终验收

- [ ] 6.1 `npm run build` 产物完整（AC1）
- [ ] 6.2 `tsc --noEmit` 零错（AC1）
- [ ] 6.3 `ccs --help` / `list` / `presets` / `show` 与基线一致（AC2/AC8）
- [ ] 6.4 `npm run coverage`，formUi 外 ≥80%（AC3）
- [ ] 6.5 `form.ts` 含 `never` exhaustive（AC4）
- [ ] 6.6 `presets.ts` 的 `Preset` 类型含 `model?`/`models?`（AC5）
- [ ] 6.7 CLAUDE.md 无 commander/chalk/marked（AC6）
- [ ] 6.8 `git log --oneline` 基线 + 各阶段提交清晰（AC7）
- [ ] 6.9 提交：`docs: finalize TS refactor`（若有最终文档微调）

## 风险点与回滚

| 阶段 | 风险 | 回滚动作 |
|---|---|---|
| 4（切 bin） | `ccs` 全局不可用 | `git checkout HEAD~` → bin 回 .mjs |
| 2-3 | `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` 引发大量类型错误 | design.md §9 已预案：可临时关闭这两项，记为 tradeoff |
| 3 | ink `useInput` 类型不全 | 可能需 `@types/ink` 或局部 `as` 断言；不阻塞，YAGNI |
| 1 | 依赖版本冲突 | 锁定与 Node v24 兼容版本 |

## 验证命令汇总

```bash
npm run build              # tsc → dist/
npx tsc --noEmit           # 类型检查
npm test                   # vitest run
npm run coverage           # vitest run --coverage（formUi 外 ≥80%）
ccs --help && ccs list && ccs presets   # 行为基线比对
git log --oneline          # 提交历史
```
