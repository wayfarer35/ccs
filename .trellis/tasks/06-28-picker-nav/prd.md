# 首页 picker 区域跳转

## Goal

在首页 picker（`src/picker.ts`）增加 `Tab` 区域跳转：从供应商列表区（items）一键跳到 Actions 区（direct/create/edit/remove），免去供应商多时连续 ↓ 的按键负担。不引入动作热键（与 filter 打字冲突无法两全，用户已确认）。

## Background（来自父任务勘察）

- `picker.ts` 现为单一光标贯穿 `items`（可过滤可滚动，maxItems=5）+ `actions`（固定不过滤）两区；`combined = [...filtered, ...actions]`。
- 任何可打印字符进 filter；故字母/数字热键会与过滤冲突——**不采用热键**。
- ↑↓ 仍为单光标贯穿；`Tab` 现未在 picker 使用（表单里 Tab 切 tab，但 picker 是独立组件）。

## Requirements

- R2.1 `PickerApp` 新增 `region: 'items' | 'actions'` 状态；初值按 `initialIndex` 与 `filtered.length` 推断。
- R2.2 `Tab` 键：在 items / actions 两区间切换光标。
  - 切到 items 区：光标定位到当前可见 items 首项（若 items 为空则留在 actions）。
  - 切到 actions 区：光标定位到首个 action。
- R2.3 ↑↓ 单光标贯穿语义不变；跨区过渡自然（↑↓ 仍可跨区，`Tab` 只是捷径）。
- R2.4 filter 打字、退格、Enter、Esc 行为不变。
- R2.5 帮助行 `picker.help`（i18n `picker.help`）补 `Tab=jump region`（en/zh-CN）。

## Acceptance Criteria

- [ ] `ccs` 首页：任意位置按 `Tab` 即可跳到 Actions 区；再按 `Tab` 跳回 items 区。
- [ ] 供应商配置较多时（>5），无需连续 ↓ 即可到达 Actions。
- [ ] 打字过滤仍即时生效；`Tab` 不干扰过滤输入。
- [ ] ↑↓ / Enter / Esc 行为与原先一致。
- [ ] `npm run build`、`npm test` 通过。
- [ ] items 为空（无供应商配置）时 `Tab` 不报错、不跳到空区。

## Out of Scope

- 动作热键（已否决）。
- 清屏 / 页面独占（fullscreen-screens）。
- picker 状态横幅（fullscreen-screens，本任务不动 `PickerOpts` 签名）。
