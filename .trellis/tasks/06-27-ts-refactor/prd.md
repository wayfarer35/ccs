# 用 TypeScript 重构 ccs 项目并引入 Vitest 测试

## Goal

将 ccs（Claude Code Switch）CLI 从纯 ESM `.mjs` 迁移到 TypeScript，同时引入 Vitest 测试框架，建立类型安全与测试覆盖。核心动机：`form.mjs` 的判别联合状态机（`mode: 'alias' | 'single'`）与多处 env 解析点目前完全裸奔，类型 + 测试能提前挡住分支遗漏与解析边界错误。ccs 是作者日常使用的全局工具，迁移须保证零可用性中断。

## Background（已确认事实）

- 8 个 `.mjs` 源文件 + `presets.json`，共 ~1633 行：`cli.mjs`(416) / `formUi.mjs`(454) / `form.mjs`(233) / `i18n.mjs`(204) / `launch.mjs`(182) / `config.mjs`(78) / `presets.mjs`(35) / `tui.mjs`(31)
- 入口 `src/cli.mjs` 是 `bin`（`ccs`），带 `#!/usr/bin/env node` shebang，`package.json` `"type": "module"`，Node v24.5.0（≥20）
- `formUi.mjs` 使用 `React.createElement`（别名 `h`），**非 JSX 语法** → 迁移不需 TSX 工具链，纯 `.ts` + `@types/react`
- 依赖均自带类型：`@clack/core`、`@clack/prompts`、`ink`、`react`
- 当前零测试（`"test": "echo \"no tests yet\" && exit 0"`）
- 数据模型三层真实类型边界：
  - `Preset` / `ProviderOptions`（attributionHeader / disableNonEssentialTraffic / autoCompactWindow / effort）
  - `FormState`（判别联合 `mode: 'alias' | 'single'`，initState → buildResult → validateState 转换链）
  - `ProviderSettings`（`env: Record<string,string>` + 顶层 `model?` / `dangerouslySkipPermissions?`）
- 字符串字面量联合：`EffortLevel = 'low'|'medium'|'high'|'xhigh'|'max'`，`Tier = 'opus'|'sonnet'|'haiku'|'fable'`
- `presets.json` 形状一致：6 个预设，全部含 `options`，部分含 `model` / `models`
- `ccs` 已 `npm link` 全局安装（`/home/evan/.nvm/.../bin/ccs` → 本项目），日常使用中
- 项目**无 git 仓库**，迁移前须先 `git init` 建立回滚点
- CLAUDE.md 文档债：写的是 `commander`/`chalk`/`marked`，实际依赖 `@clack/prompts`/`ink`/`react`
- 项目规则（CLAUDE.md / `.claude/rules/`）要求 80% 测试覆盖、不可变数据、KISS/DRY/YAGNI

## Requirements

- R1 运行/发布形态：TypeScript 源码经 `tsc` 编译为 `dist/` 下的 ESM `.js`，`bin` 与 `files` 指向 `dist`；保留 `"type": "module"`；类型错误在构建期拦截
- R2 源码布局：`src/` 平铺结构不变（8 文件原位 `.mjs` → `.ts`），导入路径不改；tsc 输出至 `dist/`，保持 git 历史连贯
- R3 回滚保护：迁移前先 `git init` + 初始提交锁定当前可用 `.mjs` 版本；迁移分阶段提交，任何阶段出错可 `git checkout` 恢复
- R4 类型边界：定义 `Preset` / `ProviderOptions` / `FormState`（判别联合）/ `ProviderSettings` / `EffortLevel` / `Tier` 类型；`form.mjs` 的 `mode` 分支启用 exhaustive check
- R5 测试框架：引入 Vitest，配置 ESM + `node:v24`；测试覆盖纯逻辑模块（`config` / `presets` / `form` / `launch` / `i18n` / `tui` / `cli`）
- R6 覆盖率门槛：`formUi` 排除出覆盖率统计（`coverage.exclude`），其余 7 文件覆盖率门槛 80%
- R7 formUi 测试：仅测可抽出的纯函数（`tabFields`、字段模型逻辑）；ink render / `useInput` 部分不单测，靠类型守护 + 手动验证
- R8 文档同步：修正 CLAUDE.md 过时信息（CLI 框架改为 `@clack/prompts`、移除未用的 chalk/marked、补充 `.ts` 源码、构建步骤、Vitest 说明）
- R9 可用性保持：迁移全程 `ccs` 命令必须可用；`.mjs` 与 `.ts` 不并存的过渡方式——每阶段提交后 `ccs` 都能正常运行（构建产物就绪后再切 bin）

## Acceptance Criteria

- [ ] AC1 `npm run build` 产出 `dist/`，`tsc --noEmit` 零错误
- [ ] AC2 `ccs --help` / `ccs list` / `ccs presets` 等命令行为与迁移前一致（手动验证清单见 implement.md）
- [ ] AC3 `npm test` 通过，`formUi` 除外覆盖率 ≥80%
- [ ] AC4 `form.mjs` 的 `mode: 'alias' | 'single'` 分支有 exhaustive check（`never` 断言）
- [ ] AC5 `presets.json` 经类型化导入，`Preset` 类型覆盖 `model?` / `models?` 可选字段
- [ ] AC6 CLAUDE.md 不再提及 commander/chalk/marked，反映真实依赖与构建流程
- [ ] AC7 git 历史清晰：初始提交（.mjs 基线）+ 分阶段迁移提交
- [ ] AC8 全程 `ccs` 可用：每个阶段提交点 `ccs --help` 正常退出

## Out of Scope

- 不引入 TSX/JSX 工具链（`formUi` 继续用 `React.createElement`）
- 不重构 `formUi` 的 ink/useInput 架构以提升可测性（仅类型迁移 + 抽取纯函数测试）
- 不引入 ink-testing-library 驱动测试
- 不改变 CLI 命令行接口、配置文件格式、存储路径（`~/.ccs/` 布局不变）
- 不引入新依赖（除 typescript / vitest 及其 @types）

## Open Questions

- 无（所有阻塞性问题已在 brainstorm 中解决）
