# UI 交互层重构：纯 ink + 页面独占

## Goal

把 ccs 的交互层完全收敛到 ink，并让每个顶层屏幕（首页 picker、选内置/自定义、选预设、填表单）独占终端视口——一次只见一屏，而非向下堆叠。同时在首页 picker 增加 `Tab` 区域跳转，减少从供应商列表到 Actions 的按键次数。

父任务统一持有需求集、子任务拆分、跨子任务验收与集成 review；实现工作落在三个子任务。

## Background / Confirmed Facts（来自代码勘察）

- `src/tui.ts` 中 clack 交互封装 `ui.text` / `ui.confirm` / `ui.password` **无任何调用方**（死代码）；表单密码字段由 `src/formUi.ts` 的 `FieldRow` 自行渲染，不经 `ui.password`。故 **无需新增 `inkPassword`**。
- 唯一存活的 clack 交互调用：`src/cli.ts:436` `ui.select<string>`（`cmdConfigLocale` 选语言）。其余交互已全部走 ink（`ui.inkSelect/inkText/inkConfirm`）。
- clack 的 `intro/outro/cancel/log` 仍用于 `src/cli.ts` 的开头结尾装饰与日志，不进 raw mode，不触发 termios 问题。
- 5 个 ink 入口均调用 `render()`：`runPicker`(picker.ts:175)、`inkSelect/inkText/inkConfirm`(inkPrompts.ts:94/157/194)、`runProviderForm`(formUi.ts:728)。ink 卸载时**不清除最后一帧**，导致连续屏幕向下堆叠——这是问题根因。
- `cmdUse`（cli.ts:194）在 edit/remove 完成后 `continue` 回到 picker 菜单循环。
- 依赖：`package.json` 含 `@clack/core` ^0.4.1、`@clack/prompts` ^0.9.1。
- 覆盖率配置（vitest.config）已排除 `formUi.ts/picker.ts/inkPrompts.ts`，门槛 80%。
- 三个子任务耦合度低：pure-ink 改 tui.ts/cli.ts/package.json；picker-nav 改 picker.ts；fullscreen-screens 改 5 个入口的清屏。fullscreen-screens 建议在 pure-ink 之后做（去掉 clack framing 后清屏契约才稳定），其余可独立。

## Requirements

### R1 完全去除 clack（子任务 pure-ink）
- R1.1 删除 `src/tui.ts` 中 `ui.select/ui.text/ui.confirm/ui.password` clack 封装及 `unwrap`/`clack.isCancel` 兜底。
- R1.2 `cmdConfigLocale`（cli.ts:436）由 `ui.select` 改为 `ui.inkSelect`。
- R1.3 `ui.intro/outro/cancel/log` 改为纯 `console` 输出（无 clack 依赖）。
- R1.4 移除 `@clack/prompts`、`@clack/core` 依赖与 `src/tui.ts` 的 clack import；`tui.ts` 仅保留 `Cancel` 与 `ui` 表面（ink 版）。
- R1.5 `Cancel` 语义保持：Esc 仍抛 `Cancel`，顶层 catch 行为不变。

### R2 首页 picker 区域跳转（子任务 picker-nav）
- R2.1 `Tab` 在 items 区（供应商，可过滤可滚动）与 actions 区（direct/create/edit/remove）之间跳转光标。
- R2.2 不引入字母/数字动作热键——与 filter 打字冲突无法两全（用户已确认：仅 Tab 跳区，不要热键）。
- R2.3 不得破坏现有 filter 行为（打字即时过滤 items）；`Tab` 不再用于其它语义。

### R3 页面级独占（子任务 fullscreen-screens）
- R3.1 每个顶层屏幕渲染前清屏（共享 `clearScreen()` helper，清视口保留 scrollback），同一时刻终端视口只见当前屏幕。
- R3.2 清屏集中在 5 个 ink 入口（`runPicker/inkSelect/inkText/inkConfirm/runProviderForm`）。
- R3.3 表单新增 `title`（取代 clack intro），`cmdCreate/cmdEdit` 传入；删除 `ui.intro` 调用。
- R3.4 结果消息分叉：`cmdEdit/cmdRemove` 返回状态字符串不自印；终态路径 `clearScreen+console.log`，菜单路径经 picker 顶部状态横幅（`statusMessage`）显示一个周期。`cmdCreate` 自印 `Created` 后启动/退出。

## Acceptance Criteria

- [ ] `grep -rn "@clack\|clack" src/` 无结果；`package.json` 不再含 `@clack/*`；`npm run build` 通过。
- [ ] `ccs config locale` 交互改用 ink，行为与原先一致（可选语言、回写 config）。
- [ ] `ccs`（无参）首页：`Tab` 可在供应商区与 Actions 区间跳转；从任意位置按 `Tab` 即可到 Actions，再用 ↑↓ 选 create/edit/remove/direct。
- [ ] 打字过滤仍正常工作，`Tab` 跳区不干扰过滤。
- [ ] `ccs create` 全流程：首页 → 内置/自定义 → 选预设 → 配置名 → 表单，每个屏幕独占视口，不向下堆叠。
- [ ] edit/remove 完成后回菜单，顶部横幅显示 `✓ Updated/Removed xxx` 一个周期；standalone `ccs edit/remove` 终态干净输出一行。
- [ ] `npm test` 通过；覆盖率仍达标（formUi/picker/inkPrompts 仍排除，其余 ≥80%）。
- [ ] Esc 取消仍按 `Cancel` 路径退出/回菜单，行为不变。

## Out of Scope

- 表单内部布局重构（一字段一屏 / 分组一屏）——本次不做，表单仍是当前 Tab + 多字段布局。
- ink 组件库引入或 picker fuzzy 匹配算法升级。
- 国际化新增语种。

## Resolved Decisions

- **动作热键**：不引入。字母/数字热键与 picker filter 打字冲突无法两全；仅用 `Tab` 区域跳转。
- **edit/remove 结果消息**：菜单回流走 picker 顶部状态横幅（一个周期）；standalone 走 `clearScreen+console.log`。`cmdEdit/cmdRemove` 返回状态字符串、不自印。

## Subtask Map（串行执行：pure-ink → picker-nav → fullscreen-screens）

- `pure-ink` — R1。改 `src/tui.ts`、`src/cli.ts:436`、`package.json`、`tests/tui.test.ts`。
- `picker-nav` — R2。改 `src/picker.ts`（Tab 区域跳转，不动 `PickerOpts` 签名）。
- `fullscreen-screens` — R3。改 5 个 ink 入口 + `clearScreen` helper + `src/formUi.ts`(title) + `src/cli.ts`(结果消息分叉) + `src/picker.ts`(statusMessage 横幅)。依赖 pure-ink 完成；与 picker-nav 都改 picker.ts 故在其后。
