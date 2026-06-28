# Implement — 纯 ink：去除 clack 依赖

## Checklist

1. `src/tui.ts`：删 `unwrap`/clack import/`export {clack}`；删 `ui.select/text/confirm/password` 及其参数类型（先 grep 确认无外部引用）；`intro`→no-op，`outro/cancel/log.*`→console 薄封装；保留 `Cancel` 与 ink re-export。
2. `src/cli.ts:436`：`ui.select` → `ui.inkSelect`。
3. `package.json`：移除 `@clack/core`、`@clack/prompts`；`npm install`。
4. `tests/tui.test.ts`：更新断言。
5. 验证（见下）。
6. commit（不 push）。

## Validation

```bash
npm run build
npm test
npm run coverage
grep -rn "@clack\|clack" src/   # 无结果
node dist/cli.js config locale   # inkSelect 选语言
node dist/cli.js --help
```

## 风险点

- 删 `SelectOption/SelectParams` 等类型前 grep 确认无外部 import（`tui.ts` 顶部 `export interface`）。
- `cmdConfigLocale` 无 try/catch，Esc 会经顶层 catch `exit(1)`——与原行为一致，确认无回归。
- `tui.ts` 覆盖率 ≥80%：console 薄封装难单测，必要时调整测试或接受（统计门槛 80%，薄封装行少）。

## 回滚

独立 commit，`git revert` 恢复 clack。
