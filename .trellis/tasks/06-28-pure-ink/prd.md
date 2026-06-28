# 纯 ink：去除 clack 依赖

## Goal

移除 `@clack/prompts` / `@clack/core` 依赖与 `src/tui.ts` 的 clack 封装，交互层完全由 ink 承担。本任务不改变交互呈现（清屏/独占由 fullscreen-screens 负责），仅做等价替换 + 死代码清理。

## Background（来自父任务勘察）

- clack 交互封装 `ui.text/ui.confirm/ui.password` 无调用方（死代码）；`ui.select` 仅 `cli.ts:436`（`cmdConfigLocale`）一处。
- 表单密码字段由 `formUi.FieldRow` 自渲染，不经 `ui.password`——**无需 `inkPassword`**。
- `ui.intro/outro/cancel/log` 为 clack 装饰，不进 raw mode；其中 `intro` 将在 fullscreen-screens 中被表单标题取代，本任务暂保留为纯 console 薄封装（调用点不动），避免与 fullscreen-screens 耦合。
- `Cancel` 类与顶层 catch 不变；ink 提示内部仍 `throw new Cancel()`。

## Requirements

- R1.1 删除 `src/tui.ts` 中 `ui.select/ui.text/ui.confirm/ui.password` 封装及 `unwrap` / `clack.isCancel`。
- R1.2 `cli.ts:436` `ui.select<string>` → `ui.inkSelect`（options `{value,label,hint}` + `initialValue` 已兼容）。
- R1.3 `ui.intro/outro/cancel/log` 改为纯 `console` 薄封装（保留 `ui` 表面，调用点零改动）；移除 `import * as clack` 与 `export { clack }`。
- R1.4 `package.json` 移除 `@clack/prompts`、`@clack/core`；`npm install` 后 lockfile 同步。
- R1.5 `tests/tui.test.ts` 更新：删除/调整 clack 相关断言，保持 `Cancel` 与 `ui` 表面测试。
- R1.6 `Cancel` 语义保持：Esc 抛 `Cancel`，顶层 catch 行为不变。

## Acceptance Criteria

- [ ] `grep -rn "@clack\|clack" src/` 无结果。
- [ ] `package.json` 不含 `@clack/*`；`npm install` 无报错。
- [ ] `npm run build` 通过；`npm test` 通过；覆盖率达标（formUi/picker/inkPrompts 排除外 ≥80%）。
- [ ] `ccs config locale` 交互行为与原先一致（可选语言、回写 `~/.ccs/config.json`）。
- [ ] Esc 取消仍按 `Cancel` 路径退出/回菜单。
- [ ] `ui.intro/outro/cancel/log` 调用点零改动即可正常工作（输出到 console）。

## Out of Scope

- 清屏 / 页面独占（fullscreen-screens）。
- 表单标题、结果消息分叉、picker 横幅（fullscreen-screens）。
- picker Tab 区域跳转（picker-nav）。
