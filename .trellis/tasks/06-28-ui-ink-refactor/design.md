# Design — UI 交互层重构：纯 ink + 页面独占

## 架构与边界

三个子任务按文件边界切分，顺序执行（避免 picker.ts / cli.ts 并行冲突）：

```
pure-ink (tui.ts, cli.ts:436, package.json)
   ↓
picker-nav (picker.ts)
   ↓
fullscreen-screens (5 ink 入口 + cli.ts 控制流 + picker.ts banner)
```

- `pure-ink` 与 `picker-nav` 改不同文件，理论上可并行；但 `fullscreen-screens` 同时改 `picker.ts`（banner）与 `cli.ts`（控制流），与二者都冲突，故整体串行。
- 每个子任务独立可编译、可测、可归档。

## 关键设计决策

### D1 清屏契约（fullscreen-screens）

- 新增共享 helper `clearScreen()`：`process.stdout.write('\x1b[2J\x1b[H')`（清视口 + 光标归位，**保留 scrollback**，不破坏历史）。
  - 用 `process.stdout.write` 而非 `console.clear`，绕过 ink 的 `patchConsole`（默认 true）干预。
  - 不用 `\x1b[3J`（清 scrollback）——过度破坏，"独占屏幕"只需视口干净。
- 调用点：5 个 ink 入口（`runPicker/inkSelect/inkText/inkConfirm/runProviderForm`）在 `render()` **之前**调用 `clearScreen()`。
- 契约语义：
  - **交互屏**：`clearScreen() + render()` → 视口只见本屏。
  - **终态输出**（程序退出或 spawn claude 前）：`clearScreen() + console.log(msg)` → 干净的一行结果。
  - **菜单回流**（edit/remove 后回 picker）：不走 console.log（会被下一屏清掉），改走 picker 顶部状态横幅（见 D3）。
- 风险：ink 首次 mount 可能写入 `clearTerminal`，与手动清屏叠加。实现时需实测 `ccs create` 全流程确认无重影/闪烁；若 ink 自身清屏足够，则降级为仅在跨实例过渡处清屏。列为 implement 验证点。

### D2 表单标题（fullscreen-screens，取代 clack intro）

- `runProviderForm` 新增可选 `title: string`，`FormApp` 在 tab bar 之上渲染一行 cyan bold 标题。
- `cmdCreate` 传 `t('create.kindTitle', {name})`，`cmdEdit` 传 `t('edit.title', {name})`。
- 删除 `ui.intro` 调用（其输出会被紧随的表单清屏抹掉，已无意义）。

### D3 结果消息的两种归宿（fullscreen-screens）

`cmdEdit` / `cmdRemove` 改为**返回状态字符串、不自印**：

- 终态路径（`ccs edit <name>` / `ccs remove <name>`，来自 main switch）：调用方 `clearScreen(); console.log(msg);` 后退出。
- 菜单路径（`cmdUse` 循环）：`cmdUse` 捕获返回值，作为 `statusMessage` 传给下一轮 `runPicker`，由 picker 顶部横幅显示一个周期。

`cmdCreate` 不走此分叉：create 后必跟 launch（菜单路径）或退出（standalone），两种情况结果都可见，故 `cmdCreate` 自行 `clearScreen() + console.log('Created...')` 后返回 name。

### D4 picker 状态横幅（fullscreen-screens）

- `PickerOpts` 新增可选 `statusMessage?: string`。
- `PickerApp` 在 message 之上渲染一行 `✓ <statusMessage>`（green），仅当传入时显示。
- `cmdUse` 维护循环局部变量 `statusMessage`：edit/remove 返回非空则赋值，下一轮 picker 消费后清空（重新循环时不再传）。故横幅只显示一个菜单周期。
- 其它 `runPicker` 调用方（`pickExistingProvider`）不传，无横幅。

### D5 picker Tab 区域跳转（picker-nav）

- `PickerApp` 新增 `region: 'items' | 'actions'` 状态（按 `initialIndex` 与 `filtered.length` 推断初值）。
- `Tab`：在两区间切换光标——切到 items 区时定位到首个可见 item，切到 actions 区时定位到首个 action。
- ↑↓ 仍为单光标贯穿（跨区时自然过渡），`Tab` 提供"一键跨区"捷径。filter 打字行为不变。
- 现有 `combined` 单光标模型保留；`region` 仅影响 `Tab` 的落点，不改变 ↑↓ 语义。
- 帮助行 `picker.help` 文案补 `Tab=jump region`。

### D6 去除 clack（pure-ink）

- `src/tui.ts`：删除 `ui.select/ui.text/ui.confirm/ui.password` 及 `unwrap`/`clack.isCancel`；`ui.intro` 删除（D2 取代）；`ui.outro/cancel/log` 改为纯 `console` 薄封装（保留 `ui` 表面，减少调用点改动）；移除 `import * as clack` 与 `export { clack }`。
- `cli.ts:436` `ui.select` → `ui.inkSelect`（options 结构已兼容：`{value,label,hint}` + `initialValue`）。
- `package.json` 移除 `@clack/prompts`、`@clack/core`。
- `Cancel` 类与顶层 catch（`cli.ts:146` 等）不变；ink 版提示内部仍 `throw new Cancel()`。

## 数据流

```
ccs (无参)
  → cmdUse 循环
    → runPicker({items, actions, statusMessage?})     [clearScreen + render]
       Tab 跳区 / 打字过滤 / ↑↓ / Enter
    ├─ provider → cmdLaunch (spawn claude)
    ├─ direct   → launchDirect
    ├─ create   → cmdCreate
    │            → inkSelect(builtin/custom)  [clearScreen + render]
    │            → inkSelect(preset)          [clearScreen + render]
    │            → inkText(name)              [clearScreen + render]
    │            → runProviderForm({title})   [clearScreen + render]
    │            → clearScreen + console.log("Created")
    │            → cmdLaunch
    ├─ edit     → pickExistingProvider (runPicker)
    │            → cmdEdit → runProviderForm({title}) → return "Updated"
    │            → statusMessage = "Updated"; continue  [picker 横幅]
    └─ remove   → pickExistingProvider
                 → cmdRemove → inkConfirm → return "Removed"
                 → statusMessage = "Removed"; continue
```

## 兼容性 / 回滚

- 行为兼容：所有命令语义不变，仅交互呈现改变。`ccs <name>`、`ccs list`、`ccs show` 等非交互路径不受影响。
- 回滚点：每个子任务独立 commit；`pure-ink` 若引入回归可单独 revert（恢复 clack），其余两个子任务不依赖 clack 存在。
- 覆盖率：`formUi.ts/picker.ts/inkPrompts.ts` 仍排除；`tui.ts/cli.ts` 改动需保持 ≥80%（现有测试 + 必要新增）。`tests/tui.test.ts` 需更新（删除 clack 相关断言）。

## 不在范围

- 表单内部布局（一字段一屏 / 分组）——OOS。
- ink 组件库、fuzzy 升级、新语种——OOS。
