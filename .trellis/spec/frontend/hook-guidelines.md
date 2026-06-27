# Hook Guidelines

> ccs 仅在 `formUi.ts` 使用 React hooks（ink TUI）。无自定义可复用 hook 抽象——规模不需。

---

## Overview

hook 使用集中在 `FormApp` 组件（`src/formUi.ts:426`）。模式是 `useReducer` 驱动状态机 + ink 的 `useInput`/`useStdout` 接终端 + `useEffect`/`useState` 管光标闪烁与生命周期回调。项目无数据获取 hook（无网络层），无 `useMemo`/`useCallback` 性能优化（表单规模小）。

---

## Hook Patterns in This Project

### useReducer（状态机核心）

```ts
const [state, dispatch] = useReducer(reduce, initialForm, init);
```

- `reduce(state, action)` 是纯函数，所有状态变更经 `dispatch({ type: 'INSERT', field, char })`。
- `Action` 是判别联合（`formUi.ts:50`）：`NEXT_TAB`/`INSERT`/`TOGGLE`/`SELECT_DELTA`/`ACTIVATE`/`CANCEL` 等。
- `init` 与 `sanitize` 负责夹紧 `fieldIndex`、文本字段聚焦时光标置末尾。

### useInput（键位 → Action）

`useInput((input, key) => { … })`（`formUi.ts:444`）把终端按键翻译成 `dispatch`。注意 ink 怪癖：
- **Backspace 怪癖**：ink 把 `\x7f`（Linux/WSL Backspace）映射成 `key.delete` 而非 `key.backspace`，且无法与真正 Delete 区分——两者都按向后删除处理（`formUi.ts:466`）。
- **多字符合并**：ink 可能把快速连按合并成一次 `input`（如 `"abc"`），需逐字符 `for (const ch of input)` 处理（`formUi.ts:469`）。
- 控制字符（`charCode < 32`）跳过；`number` 字段只接受数字。

### useStdout（终端宽度）

```ts
const { stdout } = useStdout();
const cols = stdout && stdout.columns ? stdout.columns : 60;
```
用于分隔线宽度 `Math.min(cols, 64)`。

### useEffect（副作用）

- 光标闪烁定时器：`setInterval(530)`，cleanup `clearInterval`（`formUi.ts:433`）。
- 光标/字段/tab 变化立即重显示：`useEffect(() => { setBlinkOn(true); }, [state.cursor, state.fieldIndex, state.tabIndex])`。
- 提交/取消回调：`useEffect` 监听 `state.status`，`'done'` → `onDone`、`'cancel'` → `onCancel`（`formUi.ts:439`）。

### useState

仅 `blinkOn` 一个，驱动光标闪烁。

---

## Naming Conventions

- 无 `useXxx` 自定义 hook——本项目不抽。若未来表单逻辑复用，再抽 `useFormReducer` 之类。
- reducer 函数命名 `reduce`/`init`/`sanitize`，不放 hook 前缀。

---

## Common Mistakes

- **在 `useInput` 里直接改 state**：必须 `dispatch`，否则 reducer 不走、`sanitize` 不生效。
- **副作用里同步调 `onDone`**：会触发重渲染中卸载；用 `useEffect` 监听 `status` 延后到提交后（`formUi.ts:439`）。
- **漏 `setBlinkOn(true)`**：移动光标后光标位不立即更新，视觉卡顿。
- **测试 ink 组件**：`formUi.ts` 因 ink TUI 难单测，已排除出覆盖率统计（见 [[quality-guidelines]]）；抽纯函数（`tabFields`）单独测。
