# Design — TS 重构 + Vitest

## 1. 技术栈与工具链

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript 5.x | 主目标 |
| 编译 | `tsc`（`typescript` devDep） | R1 要求构建期拦截，无需打包器 |
| 测试 | Vitest 2.x | 原生 ESM/TS 支持，零配置跑 `.ts`，内置 v8 coverage |
| 类型补充 | `@types/react`、`@types/node` | ink/react 创元素 + Node API |
| 模块解析 | `NodeNext` | ESM 项目标配，强制 `.js` 扩展名导入 |
| 运行时 | Node v24.5.0（≥20） | 现状不变 |

**不引入** tsup/esbuild/tsx/ink-testing-library（见 Out of Scope）。

## 2. tsconfig 设计

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,   // 配合不可变数据规则
    "exactOptionalPropertyTypes": true,  // ProviderSettings 的 model? 等可选字段更严谨
    "resolveJsonModule": true,           // presets.json 导入
    "verbatimModuleSyntax": true,        // ESM 导入语义清晰
    "declaration": true,                 // 产物含 .d.ts（虽不发布 SDK，零成本）
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts", "tests/**"]
}
```

**测试 tsconfig**：Vitest 用 `vite` 自带 esbuild 转译，不需单独 tsconfig；`vitest.config.ts` 配 `test.environment: 'node'`。

**关键决策**：
- `noUncheckedIndexedAccess` 与现有 `aliases[tierUpper]` 等 `Record` 访问会强制处理 `undefined`——这正是 R4 想要的边界保护，迁移时补 `?? ''` 即可（现有代码已大量用 `??`）。
- `exactOptionalPropertyTypes` 会让 `result.model = state.tier`（仅 alias 模式赋值）更精确，但需注意 `dangerouslySkipPermissions?: true` 这种「只赋 true」的类型声明要写成 `true` 而非 `boolean`。若迁移阻力过大，此项可降级为关闭，记为 design tradeoff。

## 3. 模块解析与导入路径

`NodeNext` 要求相对导入带扩展名，但 `.ts` 源码里写 `.js`（TS 编译后保持 `.js`）：

```ts
// src/cli.ts
import { listProviders } from './config.js';   // 源码写 .js，tsc 不改写，运行时 dist/config.js 存在
```

- `presets.json` 导入：`import builtinPresets from './presets.json' with { type: 'json' }`（Node v24 原生支持 import attributes，tsc 5.3+ 支持）。类型由 `resolveJsonModule` 推断为 `Record<string, Preset>` 形状，再用 `as` 断言到 `Record<string, Preset>` 收紧。
- 测试文件 `*.test.ts` 放 `src/` 同目录或 `tests/`，Vitest 都能发现；选 `tests/` 隔离源码。

## 4. 类型契约（核心数据模型）

```ts
// src/types.ts（新增，集中放共享类型）
export type Tier = 'opus' | 'sonnet' | 'haiku' | 'fable';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ProviderOptions {
  attributionHeader: boolean;
  disableNonEssentialTraffic: boolean;
  autoCompactWindow: number;
  effort: EffortLevel;
}

export interface Preset {
  label: string;
  baseUrl: string;
  model?: string;
  models?: Partial<Record<Tier, string>>;
  options?: Partial<ProviderOptions>;
}

export interface ProviderSettings {
  env: Record<string, string>;
  model?: Tier;                          // 仅 alias 模式
  dangerouslySkipPermissions?: true;     // ccs 自管 flag，只写 true
}

// 判别联合——form.mjs 的状态机核心
export type FormMode = 'alias' | 'single';
export interface FormState {
  baseUrl: string;
  existingKey: string;
  apiKey: string;
  keepExistingKey: boolean;
  mode: FormMode;
  tier: string;
  aliases: Record<string, string>;       // ALIAS_TIERS → model id
  singleModel: string;
  options: ProviderOptions;
  dangerouslySkipPermissions: boolean;
}
```

**exhaustive check 落点**（R4 / AC4）——`form.ts` 的 `buildResult`：
```ts
if (state.mode === 'single') { /* ... */ }
else if (state.mode === 'alias') { /* ... */ }
else {
  const _exhaustive: never = state.mode;  // 新增 mode 时编译报错
  throw new Error(`unhandled mode: ${_exhaustive}`);
}
```
现有代码用 `if/else` 二分，迁移时补 `never` 断言即满足 AC4。

## 5. 文件迁移映射

| 源 | 目标 | 类型重点 | 测试重点 |
|---|---|---|---|
| `config.mjs` | `config.ts` | `readJSON<T>` 泛型、路径常量 `string` | readJSON 回退、listProviders 排序、providerExists |
| `presets.mjs` | `presets.ts` | `Preset` 类型化导入 | getPresets 合并、presetList |
| `i18n.mjs` | `i18n.ts` | `t()` 的 key 字面量联合（可选） | detectLocale、t 插值 |
| `tui.mjs` | `tui.ts` | `Cancel` 类、`ui` 对象类型 | unwrap 抛 Cancel |
| `launch.mjs` | `launch.ts` | `ProviderSettings`、`redactSettings` 纯函数 | redactSettings 遮蔽、stripCcsKeys、buildProviderSettings |
| `form.mjs` | `form.ts` | `FormState` 判别联合、exhaustive | initState/buildResult/validateState 三态转换、parseXxxEnv 边界 |
| `formUi.mjs` | `formUi.ts` | `@types/react`、Field 类型 | 仅测 tabFields 等纯函数（R7） |
| `cli.mjs` | `cli.ts` | argv 解析、命令分发 | cmdList/cmdPresets/cmdShow 输出、nameValidator |

## 6. package.json 变更

```jsonc
{
  "type": "module",
  "bin": { "ccs": "dist/cli.js" },          // 原 src/cli.mjs → dist/cli.js
  "files": ["dist", "README.md"],            // 原 src → dist
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/cli.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/react": "^18.x",
    "vitest": "^2.x",
    "@vitest/coverage-v8": "^2.x"
  }
}
```

**shebang**：`cli.ts` 首行保留 `#!/usr/bin/env node`；tsc 不会剥离注释，`dist/cli.js` 仍带 shebang。`chmod +x dist/cli.js` 由 `npm link` / `bin` 字段处理，但需在 build 后验证可执行位（npm install 时自动加，本地 `npm link` 也会加）。

## 7. Vitest 配置

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/formUi.ts', 'src/types.ts', 'src/**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

## 8. 兼容性与回滚

- **零接口变更**：CLI 命令、`~/.ccs/` 存储布局、`presets.json` 格式、`--settings` 透传行为全部不变。
- **回滚**：git init 后每个阶段一个提交；任一阶段 `ccs` 不可用即 `git checkout HEAD~` 回退。
- **过渡期 bin 切换**：阶段顺序保证「先有 dist 产物，再切 bin」——见 implement.md 阶段 4。阶段 1-3 期间 `bin` 仍指 `.mjs`，`ccs` 始终可用；阶段 4 切到 `dist/cli.js` 并验证后，阶段 5 删 `.mjs`。
- **npm link**：`npm link` 指向项目根，bin 切到 `dist/cli.js` 后全局 `ccs` 自动跟随，无需重新 link。

## 9. Tradeoffs

| 决策 | 代价 | 接受理由 |
|---|---|---|
| `tsc` 而非 tsx 运行 | 失去「改完即跑」，需 `npm run build` | 构建期类型拦截是主目标；`tsc --watch` 缓解 |
| `exactOptionalPropertyTypes` | 部分可选字段赋值要小心 | 若阻力大可关闭，不阻塞 R1-R9 |
| `noUncheckedIndexedAccess` | Record 访问需补 `?? ''` | 现有代码已大量用 `??`，迁移成本低，且正是想要的边界 |
| formUi 排除覆盖率 | 整体数字不达规则 80% | PRD 已明确排除，AC3 按 7 文件计 |
| 不引入 ink-testing-library | formUi 逻辑覆盖低 | 类型守护 + 抽取纯函数测试，YAGNI |

## 10. 操作/回滚考虑

- 失败信号：任一阶段 `tsc --noEmit` 报错且无法快速修复 → 回滚到上一提交。
- 灾难场景：bin 切换后 `ccs` 不可用 → `git checkout` 上一提交 + `npm rebuild`/重新 `npm link`。
- 验证基线：迁移前先记录 `ccs --help` / `ccs list` / `ccs show <name>` 的输出快照，迁移后逐项比对。
