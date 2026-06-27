# Component Guidelines

> ccs 的"组件"即 `formUi.ts` 里的 ink/React 组件（终端 TUI）。非 Web 组件。

---

## Overview

唯一使用 React/ink 的文件是 `src/formUi.ts`。采用 `h = React.createElement`（非 JSX）——`tsconfig` 未配 JSX，全文件用 `h(Text, {…}, …children)` 构造。组件是纯渲染层，所有状态变更走 `useReducer(reduce, …)`，组件本身不持有业务状态。

---

## Component Structure

- 组件即函数，参数解构为单个 `props` 对象，返回 `React.ReactNode`。
- props 接口在组件上方定义（`FieldRowProps`/`ReviewBodyProps`/`FormAppProps`）。
- 顶层 `FormApp` 持有 reducer + `useInput`/`useStdout`，子组件（`FieldRow`/`ReviewBody`）纯展示，靠 props 传入 `form`/`focused`/`cursor`。

```ts
interface FieldRowProps { field: Field; form: RuntimeForm; focused: boolean; cursor: number; blinkOn: boolean; }
function FieldRow({ field, form, focused, cursor, blinkOn }: FieldRowProps): React.ReactNode { … }
```

---

## Props Conventions

- 每个组件一个 `XxxProps` interface，字段显式类型，不偷懒用 `any`。
- 布尔类 props 命名直接（`focused`/`blinkOn`），不加 `is` 前缀。
- 子组件不接收 `dispatch`；事件由 `FormApp` 的 `useInput` 统一翻译成 `Action` 派发。

---

## Rendering Patterns

- **`h` 而非 JSX**：`h(Box, { flexDirection: 'column' }, h(Text, null, …), h(Text, { color: 'cyan' }, …))`。children 展开用 `...arr.map((x) => h(Text, {…}, x))`。
- **样式按属性传**：`{ color: 'cyan' }`、`{ backgroundColor: 'cyan', color: 'black' }`、`{ dimColor: true }`。条件样式三元返回不同 props 对象：`h(Text, active ? { backgroundColor: 'cyan', color: 'black' } : { dimColor: true }, …)`。
- **聚焦前缀**：`focused ? '▸ ' : '  '`（`formUi.ts:341`）。
- **toggle 用 ✓/✗ 不留空**（`formUi.ts:374`），避免「空」歧义。
- **光标闪烁**：`useEffect` + `setInterval(530ms)` 翻转 `blinkOn`；移动光标/切字段时 `setBlinkOn(true)` 立即重显示（`formUi.ts:432-437`）。

---

## Field Model（组件背后的数据模型）

- `FieldKind = 'text' | 'password' | 'toggle' | 'select' | 'number' | 'button'`。
- `FieldId` 是字面量联合（含模板字面量 `` `alias_${typeof ALIAS_TIERS[number]}` ``）。
- `tabFields(form, tabIndex)` 返回当前 tab 的可聚焦字段列表——新增字段改这里，reducer/渲染自动复用。
- select 字段在 `selectConfig(fieldId)` 登记 `values/get/set`，新增 select 字段只改这一处（`formUi.ts:171`）。

---

## Accessibility / 键位

终端 TUI 无 ARIA，靠键位一致性：`Tab` 切 tab、`↑↓` 切字段、文本内 `←→` 移光标、非文本 `←→` 切字段、`Space` toggle/循环、`Enter` 下一步/提交、`Esc` 取消。键位映射集中在 `FormApp` 的 `useInput`（`formUi.ts:444`），底部 `form.help` 文案同步。

---

## Common Mistakes

- **把业务逻辑写进组件**：应放 `form.ts` 纯函数。组件只调 `dispatch`。
- **直接改 `form` 对象**：reducer 内一律返回新对象（`{ ...form, baseUrl: v }`），符合不可变模式。
- **新增 select 字段忘了登记 `selectConfig`**：`SELECT_DELTA` 会 no-op。
- **在模板字面量里写 shell `${...}` 未转义**——见 `completion.ts`，属类型安全范畴，详见 [[type-safety]]。
