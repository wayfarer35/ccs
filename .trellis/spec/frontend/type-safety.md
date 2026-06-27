# Type Safety

> Type safety patterns for the ccs TypeScript codebase.

---

## Overview

ccs 是 Node.js ESM + TypeScript 项目，源码 `.ts` 经 `tsc` 编译到 `dist/`。`tsconfig.json` 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`resolveJsonModule`、`verbatimModuleSyntax`、`NodeNext` 模块解析。

---

## Type Organization

- **共享类型集中于 `src/types.ts`**：`Tier`、`EffortLevel`、`ProviderOptions`、`Preset`、`ProviderSettings`、`FormMode`、`FormState`。
- 模块内部类型（如 `formUi.ts` 的 `RuntimeForm`、`Field`、`FieldKind`）就近定义，不外泄到 `types.ts`。
- 不在多个文件重复定义同一类型——`ProviderSettings` 既被 `launch.ts` 消费（写 `--settings` 片段），也被 `form.ts` 的 `buildResult` 产出，统一引用 `types.ts`。

---

## Key Patterns

### 判别联合 + exhaustive check

`FormState.mode: 'alias' | 'single'` 是状态机核心。`buildResult` 用 `if/else if/else { const _exhaustive: never = state.mode }` 强制新增 mode 时编译报错。**改 `FormMode` 必须同步更新 `buildResult` 分支**，否则 `tsc` 失败。

### Record 访问配 `?? ''`

`noUncheckedIndexedAccess` 下 `Record<string, string>` 索引返回 `string | undefined`。读 env/aliases 时统一用 `env[k] ?? preset?.x ?? ''` 兜底，避免运行时 undefined 串入。

### 可选字段只赋「真值」

`exactOptionalPropertyTypes` 下 `dangerouslySkipPermissions?: true` 只能赋 `true`，不能赋 `undefined`。模式：`if (cond) result.dangerouslySkipPermissions = true;`——不写 else 分支。

### 运行时与类型不一致的边界

`FormState.options.autoCompactWindow: number`（对外契约），但 `formUi.ts` 内部以字符串编辑（`RuntimeForm.options.autoCompactWindow: string`）。提交时 `toFormState` 转回 number。**不要把运行态字符串类型泄漏到对外类型**。

### clack 分布式条件类型陷阱

`@clack/prompts` 的 `Option<Value>` 是分布式条件类型，对联合 `Value`（如判别联合）会展开成 `Option<A> | Option<B>`，导致 `Option<UsePick>[]` 赋值失败。`tui.ts` 自定义 `SelectOption<T>` 接口规避，`ui.select<T>` 内部 `as` 转回 clack 类型。

---

## Validation

- env 解析点（`parseBoolEnv`/`parseNumEnv`/`parseEffortEnv`）是边界校验：非法值回退默认，不抛错。
- 配置名校验 `validateName`/`nameValidator`：拒绝空、路径分隔符、空白、`..`。
- JSON 读取 `readJSON<T>` 泛型 + try/catch，ENOENT 回退、解析错抛出。

---

## Forbidden Patterns

- 不用 `any`；边界用 `unknown` + 显式断言（如 `(e as NodeJS.ErrnoException).code`）。
- 不在源码 `.ts` 里写 `.ts` 扩展名导入——`NodeNext` 要求写 `.js`（编译后生效）。
- 不直接 `spyOn` ESM 模块命名空间（不可配置）——测试用 `vi.mock` + `vi.hoisted`。
- 不让测试污染用户真实 `~/.ccs/`——mock config 或备份/恢复（见 `tests/i18n.test.ts`、`tests/cli-interactive.test.ts`）。

---

## Testing

- Vitest，`tests/**/*.test.ts`，`environment: 'node'`。
- 覆盖率门槛 80%，`formUi.ts`（ink TUI 难单测）与 `types.ts`（纯类型）排除出统计。
- `process.exit` 路径用 `interceptExit` 拦截（throw `exit:<code>`），不依赖 vitest 默认行为。
- mock `node:child_process` 测 `launch`/`launchDefault` 分支，不真起 claude。
