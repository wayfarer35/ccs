# Directory Structure

> ccs 是 Node.js ESM + TypeScript CLI，源码 `src/*.ts` 经 `tsc` 编译到 `dist/`。本文件描述源码组织。

---

## Overview

单层 `src/` 目录，无嵌套模块包——CLI 规模小，所有源文件平铺在 `src/` 下，按职责命名。测试镜像在 `tests/`，与源文件一一对应（`config.ts` ↔ `tests/config.test.ts`）。

---

## Directory Layout

```
src/
├── cli.ts          # 入口：argv 分发、命令实现（cmdCreate/cmdEdit/...）、help 文本
├── types.ts        # 共享类型契约（Tier/FormState/ProviderSettings/Preset/...）
├── config.ts       # 文件系统层：~/.ccs 读写、readJSON/writeJSON、provider 增删查
├── presets.ts      # 内置 + 用户预设合并（presets.json + ~/.ccs/presets.json）
├── i18n.ts         # 双语字典 + t() 翻译、locale 探测
├── tui.ts          # @clack/prompts 封装：ui.select/text/confirm/password + Cancel
├── form.ts         # 表单状态机：initState/buildResult/validateState（纯逻辑，无 React）
├── formUi.ts       # ink/React 持久化 Tab 表单（reducer + 渲染）
├── launch.ts       # 启动 claude：buildProviderSettings/launch/dryRun/redactSettings
├── completion.ts   # shell 补全脚本生成 + 候选词
├── version.ts      # 运行时从 package.json 读版本
└── presets.json    # 内置预设数据（resolveJsonModule 导入）
tests/
└── *.test.ts       # 与源文件一一对应
```

---

## Module Organization

- **按职责分层，不按功能特性分包**：`config.ts`（持久化）→ `presets.ts`/`i18n.ts`（数据/文案）→ `tui.ts`（交互原语）→ `form.ts`（状态机纯逻辑）→ `formUi.ts`（TUI 渲染）→ `cli.ts`（命令编排）→ `launch.ts`（外部进程）。
- **纯逻辑与 UI 分离**：`form.ts` 是无 React 依赖的纯函数（`initState`/`buildResult`/`validateState`），可单测；`formUi.ts` 才引入 ink/React。新增表单逻辑优先放 `form.ts`，别塞进组件。
- **类型集中**：跨模块共享类型放 `types.ts`；模块内部类型（如 `formUi.ts` 的 `Field`/`FieldKind`/`RuntimeForm`）就近定义，不外泄。

---

## Naming Conventions

- 文件：小写驼峰（`formUi.ts`、`cli.ts`），与默认导出/主函数对应。
- 源码导入写 `.js` 扩展名（`NodeNext` 要求，编译后生效）：`import { ui } from './tui.js'`。
- 命令处理函数：`cmd<X>`（`cmdCreate`/`cmdEdit`/`cmdList`/`cmdLaunch`）。
- 纯函数：动词开头（`buildResult`/`redactSettings`/`parseBoolEnv`）。
- 常量：大写（`TIERS`/`ALIAS_TIERS`/`CCS_DIR`/`CUSTOM_KEY`）。

---

## Examples

- 纯逻辑模块范本：`src/form.ts`（无 React，全可单测，`tests/form.test.ts` 覆盖）。
- 交互原语封装范本：`src/tui.ts`（薄封装 clack，统一 `Cancel` 处理）。
- 入口分发范本：`src/cli.ts:114` `main()` 的 argv switch。
