# 页面级独占：清屏契约

## Goal

让每个顶层屏幕（首页 picker、选内置/自定义、选预设、配置名、表单）独占终端视口——一次只见一屏，不再向下堆叠。并处理 edit/remove 后回菜单时结果消息的可见性（顶部状态横幅）。

## Background（来自父任务勘察）

- 5 个 ink 入口（`runPicker`、`inkSelect/inkText/inkConfirm`、`runProviderForm`）调用 `render()`；ink 卸载时 `log.done()` **保留最后一帧**，导致连续屏幕堆叠——根因。
- `cmdUse`（cli.ts:194）在 edit/remove 后 `continue` 回 picker；若每屏清屏，结果消息会被下一屏抹掉。
- `cmdCreate` 后必跟 launch 或退出，结果可见，无需横幅。
- 依赖 pure-ink 完成（无 clack framing 后清屏契约才稳定）；与 picker-nav 都改 `picker.ts`，故在其后执行。

## Requirements

### R3.1 清屏 helper
- 新增 `clearScreen()`：`process.stdout.write('\x1b[2J\x1b[H')`（清视口 + 光标归位，保留 scrollback）。用 `process.stdout.write` 绕过 ink `patchConsole`。

### R3.2 入口清屏
- 5 个 ink 入口在 `render()` 之前调用 `clearScreen()`。

### R3.3 表单标题（取代 intro）
- `runProviderForm` 新增可选 `title: string`；`FormApp` 在 tab bar 之上渲染 cyan bold 标题行。
- `cmdCreate` 传 `t('create.kindTitle', {name})`，`cmdEdit` 传 `t('edit.title', {name})`。
- 删除 `cmdCreate/cmdEdit` 中的 `ui.intro` 调用。

### R3.4 结果消息分叉
- `cmdEdit` / `cmdRemove` 改为**返回状态字符串、不自印 outro**。
- 终态路径（main switch 的 `ccs edit`/`ccs remove`）：调用方 `clearScreen(); console.log(msg);` 后退出。
- 菜单路径（`cmdUse`）：捕获返回值作为 `statusMessage` 传给下一轮 picker。
- `cmdCreate` 自行 `clearScreen() + console.log('Created...')` 后返回 name（不走分叉）。

### R3.5 picker 状态横幅
- `PickerOpts` 新增可选 `statusMessage?: string`；`PickerApp` 在 message 之上渲染 `✓ <msg>`（green），仅当传入时显示。
- `cmdUse` 循环局部变量 `statusMessage`：edit/remove 返回非空则赋值，下一轮 picker 消费后清空（横幅只显示一个周期）。
- 其它 `runPicker` 调用方（`pickExistingProvider`）不传。

### R3.6 行为不变
- `Cancel` 语义、各命令功能、非交互路径（`ccs <name>`/`list`/`show` 等）不受影响。

## Acceptance Criteria

- [ ] `ccs create` 全流程每屏独占视口，不堆叠；表单顶部显示标题。
- [ ] create 提交后 `Created` 干净输出并启动 claude。
- [ ] `ccs` → edit → 提交 → 回菜单：顶部横幅 `✓ Updated xxx` 显示一个周期后消失。
- [ ] `ccs` → remove → 确认 → 回菜单：横幅 `✓ Removed xxx`；列表项减少。
- [ ] `ccs edit <name>` / `ccs remove <name>`（standalone）：终态干净输出一行结果。
- [ ] `ccs config locale`、首页 picker、inkText/inkConfirm 各自独占视口。
- [ ] Esc 取消仍按 `Cancel` 路径退出/回菜单。
- [ ] `npm run build`、`npm test` 通过；覆盖率达标。
- [ ] 清屏不破坏 scrollback（可上滚查看历史）；无闪烁/重影（实测确认与 ink 自身 clearTerminal 不冲突）。

## Out of Scope

- 表单内部布局（一字段一屏 / 分组）。
- picker Tab 区域跳转（picker-nav，本任务仅加 `statusMessage` 横幅，不动 Tab）。
