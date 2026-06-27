# CCS

CLI 工具 — 基于 Node.js ESM + TypeScript 构建。

## Commands

```bash
# 构建（tsc → dist/）
npm run build

# 开发（watch 模式）
npm run dev

# 启动（需先 build）
node dist/cli.js --help
# 或全局安装后
ccs --help

# 测试
npm test            # vitest run
npm run coverage    # vitest run --coverage（formUi 除外 ≥80%）
```

## Project Notes

- **ESM + TypeScript** — `"type": "module"`，源文件使用 `.ts` 扩展名，经 `tsc` 编译到 `dist/`
- **CLI 框架**: `@clack/prompts`（交互提示）+ `ink`/`react`（持久化 Tab 表单）
- **测试**: `vitest`
- 入口: `src/cli.ts`（编译到 `dist/cli.js`，带 shebang）
- 类型契约集中于 `src/types.ts`：`FormState`（判别联合 `mode: 'alias' | 'single'`）、`ProviderSettings`、`Preset`、`EffortLevel`、`Tier`
- `tsconfig.json`：`NodeNext` 模块解析、`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`resolveJsonModule`

## Coding Standards

- 遵循 `.claude/rules/common/` 下的项目规则
- 不可变数据模式（创建新对象，不修改现有对象）
- 测试覆盖率目标: 80%+（`formUi` 因 ink TUI 难单测，排除出覆盖率统计，其余 7 文件门槛 80%）
- 改 `form.ts` 的 `FormMode` 分支时，`buildResult` 的 `never` exhaustive check 会强制处理新分支
