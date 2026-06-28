# Implement — UI 交互层重构：纯 ink + 页面独占

父任务协调三个子任务，按顺序执行。每个子任务自身有 design.md / implement.md（启动该子任务时在 Phase 1 细化）；本文为跨子任务的执行顺序与集成验证。

## 执行顺序（串行）

1. **pure-ink**（`06-28-pure-ink`）— 去除 clack。改 `src/tui.ts`、`src/cli.ts:436`、`package.json`、`tests/tui.test.ts`。
2. **picker-nav**（`06-28-picker-nav`）— Tab 区域跳转。改 `src/picker.ts`。
3. **fullscreen-screens**（`06-28-fullscreen-screens`）— 清屏契约 + 表单标题 + 结果消息分叉 + picker 横幅。改 5 个 ink 入口、`src/cli.ts` 控制流、`src/picker.ts` banner、`src/formUi.ts` title。

## 集成验证（父任务，全部子任务完成后）

```bash
npm run build                 # tsc 通过
npm test                      # vitest 全绿
npm run coverage              # formUi/picker/inkPrompts 排除外 ≥80%
grep -rn "@clack\|clack" src/ # 无残留
node dist/cli.js --help       # 帮助正常
```

手动交互验证（WSL/真终端，非 CI）：
- `ccs` → 首页独占视口；`Tab` 跨 items/actions 区；打字过滤正常；↑↓ 贯穿；Esc 取消。
- `ccs create` → 内置/自定义 → 选预设 → 配置名 → 表单：**每屏独占**，不堆叠；表单顶部有标题；提交后 `Created` 干净输出并启动。
- `ccs` → edit → 选配置 → 表单 → 提交 → 回菜单：顶部横幅显示 `✓ Updated xxx` 一个周期。
- `ccs` → remove → 选配置 → 确认 → 回菜单：横幅 `✓ Removed xxx`；列表项减少。
- `ccs edit <name>` / `ccs remove <name>`（standalone）：终态 `clearScreen + console.log` 干净输出。
- `ccs config locale` → inkSelect 选语言，回写 config。

## Review Gates

- 每个子任务完成 → 该子任务 `trellis-check`（spec 符合 + lint/type/test）。
- 全部完成 → 父任务集成 review：跨子任务数据流（D3 结果消息分叉、D4 横幅周期）一致性。
- 风险验证点：D1 清屏与 ink 自身 `clearTerminal` 是否叠加导致闪烁/重影——实测确认。

## 回滚点

- 每子任务独立 commit。
- pure-ink 可单独 revert 恢复 clack；picker-nav / fullscreen-screens 不依赖 clack，revert pure-ink 后仍可独立保留或回滚。
