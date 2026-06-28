# Design — 纯 ink：去除 clack 依赖

## 边界

仅等价替换 + 死代码清理，不改变交互呈现。改 `src/tui.ts`、`src/cli.ts:436`、`package.json`、`tests/tui.test.ts`。

## `src/tui.ts` 改造

`ui` 表面保留（调用点零改动），内部去 clack：

- 删除 `unwrap`、`import * as clack`、`export { clack }`。
- 删除 `ui.select/ui.text/ui.confirm/ui.password` 及 `SelectOption/SelectParams/ConfirmParams/TextParams/PasswordParams`（确认无外部引用后再删）。
- `ui.intro` → `() => {}`（no-op；fullscreen-screens 会用表单 title 取代，但本任务不删调用点，先留空避免输出）。**改**：`intro` 直接置为 no-op 空函数，保留调用点不报错。
- `ui.outro(msg)` → `console.log(msg)`。
- `ui.cancel(msg)` → `console.log(msg)`（clack cancel 原本也是输出一行）。
- `ui.log.{message,info,step,warning,error}` → 对应 `console.log/info/log(warn)/console.error`（step 用 log）。
- 保留 `Cancel` 类、`inkSelect/inkText/inkConfirm` re-export、`PickerItem/PickerOpts` 类型 re-export。

## `src/cli.ts:436` 改造

`cmdConfigLocale` 的 `ui.select<string>` → `ui.inkSelect<string>`。
- `inkSelect` 入参 `{message, options: {value,label,hint}[], initialValue}` 与现有 options 结构完全兼容，直接替换。
- `ui.inkSelect` 抛 `Cancel`（Esc），但 `cmdConfigLocale` 不在菜单循环内、无 try/catch——顶层 `main` catch 会 `ui.cancel + exit(1)`。原 `ui.select` 行为相同（clack isCancel → Cancel）。等价。

## `package.json`

移除 `dependencies` 中 `@clack/core`、`@clack/prompts`。`npm install` 同步 lockfile。

## 测试

`tests/tui.test.ts` 更新：移除 clack mock 相关断言；保留 `Cancel` 实例化与 `ui` 表面存在性测试。`npm test` + `coverage` 须达标（tui.ts 仍在覆盖率统计内，≥80%）。

## 兼容性

- `Cancel` 语义不变；顶层 catch（cli.ts:146/240/250）不变。
- 非交互路径（`ccs <name>`/list/show 等）不触及 ui 改动。
- 回滚：单独 commit，可 revert 恢复 clack。
