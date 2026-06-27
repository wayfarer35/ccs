# State Management

> ccs 的"状态"是表单状态机（`FormState`）+ 运行态（`RuntimeForm`）+ reducer 内部态。无全局 store、无 server state、无 URL state。

---

## Overview

状态分三层：
1. **`FormState`**（`types.ts`）：对外类型契约，判别联合 `mode: 'alias' | 'single'`。`initState` 构造、`buildResult` 消费、`validateState` 校验——都在 `form.ts` 纯函数层。
2. **`RuntimeForm`**（`formUi.ts:37`）：表单运行态，`Omit<FormState,'options'>` + `autoCompactWindow` 改为 `string`（输入框以字符串编辑，提交时 `toFormState` 转回 number）。
3. **reducer 内部态 `FormState_`**（`formUi.ts:41`）：`tabIndex`/`fieldIndex`/`cursor`/`form`/`status`/`error`，`useReducer` 驱动。

无 Redux/Zustand/Context。状态局部于 `FormApp` 组件，靠 props 下发。

---

## State Categories

- **本地组件态**：`FormState_`（reducer），仅 `FormApp` 内。子组件无状态，纯 props 渲染。
- **持久化态**：provider 配置落盘 `~/.ccs/providers/<name>.settings.json`（`config.ts` 读写），非运行时内存态。
- **配置态**：`~/.ccs/config.json`（locale 等）、`~/.ccs/.lastused`——读时取，不缓存进组件。
- **无 server state / 无 URL state**：CLI 无网络层、无路由。

---

## 判别联合状态机（核心模式）

`FormState.mode` 是状态机核心。`buildResult`（`form.ts:183`）用 `if/else if/else { const _exhaustive: never = state.mode }` 强制 exhaustive：

```ts
if (state.mode === 'single') { env.ANTHROPIC_MODEL = … }
else if (state.mode === 'alias') { /* 写各档位别名 */ }
else { const _exhaustive: never = state.mode; throw new Error(…) }
```

**新增 `FormMode` 必须同步更新 `buildResult` 分支**，否则 `tsc` 编译失败。这是 [[type-safety]] 的关键不变量。`formUi.ts` 的 `setBoolValue` 切换 `mode`（`formUi.ts:147`），`tabFields` 按 `mode` 渲染不同字段。

---

## Derived State

- 派生值不存进 state，用时计算：`ReviewBody` 实时 `redactSettings(buildResult(toFormState(form)))` 生成预览（`formUi.ts:406`）。
- `detectAliasMode`（`form.ts:132`）由 `initial.env` 推断初始 `mode`，不持久化。
- `hasAliasEnv` 判断是否处于别名模式——纯函数读 env，不缓存。

---

## Immutability

reducer 全程不可变：`{ ...form, baseUrl: v }`、`{ ...form, options: { ...form.options, effort: v } }`、`{ ...form, aliases: { ...form.aliases, FABLE: v } }`。嵌套更新逐层展开。**禁止 mutate**——`form.ts`/`formUi.ts`/`launch.ts` 一致遵守（见 CLAUDE.md 不可变数据模式）。

---

## Common Mistakes

- **把运行态字符串类型泄漏到对外类型**：`autoCompactWindow` 在 `RuntimeForm` 是 `string`、在 `FormState` 是 `number`，提交时 `toFormState` 转换。别把 `string` 写进 `types.ts`。
- **新增 mode 漏改 `buildResult`**：`never` exhaustive 会拦，但改 `FormMode` 时务必同步 `tabFields`/`setBoolValue`。
- **在 reducer 外改 `form`**：所有变更经 `dispatch`，否则 `sanitize`（夹紧 fieldIndex/光标）不触发。
- **缓存派生值进 state**：预览/校验实时算，避免状态不同步。
