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

## 发版

版本号单一真源是 `package.json` 的 `version`，发版统一走 `standard-version`，日常提交不自动 bump：

```bash
npm run release         # patch：0.2.0 → 0.2.1
npm run release-minor   # minor：0.2.0 → 0.3.0
npm run release-major   # major：0.2.0 → 1.0.0
git push --follow-tags  # 推送 v* tag 触发 CI
```

`standard-version` 自增版本号、生成/更新 `CHANGELOG.md` 并打 `v*` tag。推送 tag 后 `.github/workflows/release.yml` 校验 tag 与 `package.json` 版本一致，构建并发布到 npm，同时创建 GitHub Release。

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

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
