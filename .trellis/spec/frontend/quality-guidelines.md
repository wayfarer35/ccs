# Quality Guidelines

> ccs 代码质量标准。类型安全细则见 [[type-safety]]，本文件覆盖测试、禁用模式、审查清单。

---

## Overview

质量靠三层保障：`tsc --noEmit`（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）拦类型错误；`vitest` 测试 + 80% 覆盖率门槛拦行为回归；`buildResult` 的 `never` exhaustive 拦漏分支。无 ESLint（`tsc` + 严苛 tsconfig 已覆盖大部分），无 Prettier 配置。

---

## Forbidden Patterns

- **`any`**：边界用 `unknown` + 显式断言（`(e as NodeJS.ErrnoException).code`）。详见 [[type-safety]]。
- **源码 `.ts` 里写 `.ts` 导入扩展名**：`NodeNext` 要求写 `.js`（`import { ui } from './tui.js'`）。
- **直接 `spyOn` ESM 模块命名空间**：不可配置；测试用 `vi.mock` + `vi.hoisted`。
- **测试污染用户真实 `~/.ccs/`**：mock config 或备份/恢复（`tests/i18n.test.ts`、`tests/cli-interactive.test.ts`）。
- **mutate 已有对象**：一律创建新对象（`{ ...obj, k: v }`），reducer/`redactSettings` 都遵守。
- **在模板字面量里写 shell `${...}` 不转义**：`completion.ts` 的 `${COMP_WORDS[...]}` 必须写成 `\${...}`，否则被 JS 插值成空串，脚本静默失效。
- **`process.exit` 在测试路径上真退出**：用 `interceptExit` 拦截（throw `exit:<code>`）。

---

## Required Patterns

- **判别联合 + exhaustive check**：状态机用 `mode`/`kind` 判别字段，处理处补 `never` 分支（`form.ts:210`、`cli.ts` 的 `UsePick`）。
- **Record 访问配 `?? ''` 兜底**：`noUncheckedIndexedAccess` 下索引返回 `T | undefined`（`env[k] ?? preset?.x ?? ''`）。
- **可选字段只赋真值**：`exactOptionalPropertyTypes` 下可选字段（如 `ProviderSettings.model?: Tier`）只赋实值，用 `if (cond) result.model = ...;` 不写 else。
- **边界校验回退默认不抛**：`parseBoolEnv`/`parseNumEnv`/`parseEffortEnv` 非法值回退默认；`readJSON` ENOENT 回退、解析错抛出。
- **配置名校验**：`validateName`/`nameValidator` 拒绝空、路径分隔符、空白、`..`。
- **不可变更新**：嵌套对象逐层展开。

---

## Testing Requirements

- **框架**：Vitest，`tests/**/*.test.ts`，`environment: 'node'`。
- **覆盖率门槛 80%**（lines/functions/branches/statements）：`vitest.config.ts` 配置。**排除** `src/formUi.ts`（ink TUI 难单测）与 `src/types.ts`（纯类型）。其余 7+ 源文件必须 ≥80%。
- **源文件↔测试一一对应**：`config.ts`→`tests/config.test.ts`，每个源文件都有测试。
- **纯函数优先测**：`form.ts` 的 `initState`/`buildResult`/`validateState`、`launch.ts` 的 `redactSettings`/`buildProviderSettings`、env 解析边界（空/非法/合法）。
- **`process.exit` 拦截**：`interceptExit` 工具，不依赖 vitest 默认行为。
- **mock `node:child_process`**：测 `launch`/`launchDefault` 分支，不真起 claude。
- **mock config 或备份/恢复 `~/.ccs/`**：测试不得写用户真实配置目录。

验证命令：
```bash
npm test                 # vitest run
npm run coverage         # vitest run --coverage（formUi/types 外 ≥80%）
npx tsc --noEmit         # 类型检查
npm run build            # tsc → dist/
```

---

## Code Review Checklist

- [ ] `tsc --noEmit` 零错；`npm test` 全绿；覆盖率未降破 80%。
- [ ] 新增 `FormMode`/判别字段：处理处是否补 `never` exhaustive？`buildResult`/`tabFields`/`setBoolValue` 是否同步？
- [ ] Record 索引访问是否有 `??` 兜底？可选字段是否只赋真值？
- [ ] 有无 `any`？边界是否用 `unknown` + 断言？
- [ ] 导入是否写 `.js` 扩展名？
- [ ] reducer/数据更新是否不可变（新建对象，非 mutate）？
- [ ] 测试是否 mock 了 `~/.ccs/` 与 `child_process`，未污染真实环境？
- [ ] 模板字面量里的 shell `${...}` 是否转义（`completion.ts` 改动时重点查）？
- [ ] 文案是否走 `t()`（i18n 双语）？新增 key 是否 `en` + `zh-CN` 都补？
- [ ] CLI 行为是否与基线一致（`ccs --help`/`list`/`presets`）？
