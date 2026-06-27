# 移除 ccs-only 参数体系，launch 直读 provider

## Goal / 用户价值

ccs 只做 settings 相关的事。移除 `--allow-dangerously-skip-permissions` 及其背后的整个 ccs-only 参数体系（`stripCcsKeys` / `readCcsFlags` / `ccsFlagArgs` / `buildMerged` / `merged/` 目录），让 `launch` 直接把 `providers/<name>.settings.json` 作为 `claude --settings` 的目标。provider 配置文件成为纯净的 Claude settings 片段，ccs 不再产出中间文件，存储布局更干净、名副其实。

## Background / 背景

当前 provider 配置文件混入一个 ccs 自管字段 `dangerouslySkipPermissions`（非合法 Claude settings key），ccs 用 `stripCcsKeys` 在启动前剥离，再把"清洁版"写到 `~/.ccs/merged/<name>.settings.json` 作为 `--settings` 目标。`merged/` 这层完全是为剥离一个 key 而存在的中间产物，名字也名不副实。

用户决定彻底删掉该参数（而非分离存储），手动处理已有 provider 配置里残留的该字段，ccs 不做迁移容错。

## Confirmed Facts（代码证据）

- `dangerouslySkipPermissions` 是唯一 ccs-only key：`src/launch.ts:27` `CCS_ONLY_KEYS = ['dangerouslySkipPermissions']`。
- `buildProviderSettings`（`src/launch.ts:72-78`）当前只做 `stripCcsKeys(provider)`，删 key 后等价于 `readProvider`。
- `launch`（`src/launch.ts:160-191`）写 `merged/<name>.settings.json` 作 `--settings` 目标；同时把 `settings.env` 注入子进程 env（"双保险"，`launch.ts:169-171`）。
- `ccsFlagArgs`（`src/launch.ts:52-58`）产出 `--allow-dangerously-skip-permissions`。
- 字段贯穿类型契约：`ProviderSettings.dangerouslySkipPermissions?`（`src/types.ts:42`）、`FormState.dangerouslySkipPermissions`（`src/types.ts:60`）、`InitInput.dangerouslySkipPermissions?`（`src/form.ts:81`）。
- 表单 toggle：`src/formUi.ts:90,141,155-156,210`；`initState` 读取 `src/form.ts:175`；`buildResult` 写入 `src/form.ts:224-226`。
- `MERGED_DIR` 定义 `src/config.ts:13`，`ensureDirs` 创建它 `src/config.ts:23`。
- `cli.ts:410` `cmdShow` 用 `buildProviderSettings`；`cli.ts:13` 导入它。
- `buildMerged` 是 `buildProviderSettings` 的向后兼容别名（`src/launch.ts:80-81`）。
- 测试覆盖：`tests/form.test.ts:173-178`、`tests/launch.test.ts:48-153`、`tests/launch-spawn.test.ts:11-40`、`tests/formUi.test.ts:56`、`tests/cli-main.test.ts:12`、`tests/cli-interactive.test.ts:15`。
- README 存储布局说明（`README.md:33,37`）提到 `merged/` 与 `dangerouslySkipPermissions`。

## Requirements

- R1 删除 `dangerouslySkipPermissions` 从 `ProviderSettings` / `FormState` / `InitInput` / 表单 toggle 全链路（类型、`initState`、`buildResult`、`formUi` 字段模型与渲染、i18n `form.fDanger`）。
- R2 删除 ccs-only 参数体系：`stripCcsKeys` / `CCS_ONLY_KEYS` / `readCcsFlags` / `ccsFlagArgs` / `CcsFlags` / `buildMerged` / `mergedPath` / `MERGED_DIR`。
- R3 `launch` 与 `dryRun` 的 `--settings` 目标改为直接指向 `providers/<name>.settings.json`（`providerFile(name)`），不再写中间文件。
- R4 删除 `buildProviderSettings`（已无构建语义）及其 `buildMerged` 别名；调用点（`launch`/`dryRun`/`cmdShow`）改用 `readProvider` + 各自报错。
- R5 `launch` 删除把 `settings.env` 注入子进程 env 的"双保险"（`childEnv`），子进程 env 直接用 `process.env`；`launch` 不再解析 settings 对象，只需 provider 文件路径。
- R6 `ensureDirs` 不再创建 `merged/` 目录。
- R6 `cmdShow`（`cli.ts:410`）与测试中的 `buildProviderSettings` 引用同步调整。
- R7 `cmdShow`（`cli.ts:410`）与测试中的 `buildProviderSettings` 引用同步调整。
- R8 5 个测试文件删除/改写相关用例：`launch-spawn.test.ts` 改为断言 provider 文件直接被 `--settings` 加载；`launch.test.ts` 删 `ccsFlagArgs`/`stripCcsKeys`/`readCcsFlags`/`mergedPath`/`buildMerged`/`buildProviderSettings` 相关 describe。
- R9 README 存储布局同步：移除 `merged/` 与 `dangerouslySkipPermissions` 描述。
- R10 不做迁移容错：读取/启动时不处理 provider 文件里残留的 `dangerouslySkipPermissions`。

## Acceptance Criteria

- AC1 `npm run build` 通过，`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 下无类型错误。
- AC2 `npm test` 全绿，覆盖率满足门槛（`formUi` 除外，其余 7 文件 ≥80%）。
- AC3 `ccs <name>` 启动执行命令形如 `claude --settings ~/.ccs/providers/<name>.settings.json [forwardedArgs]`，不再写 `merged/`，不再传 `--allow-dangerously-skip-permissions`。
- AC4 `ccs <name> --dry-run` 打印命令同上形态，且 `--settings` 指向 provider 文件本身。
- AC5 表单 Options tab 不再出现 `dangerouslySkipPermissions` 勾选项。
- AC6 `src/` 全局 grep `dangerouslySkip|ccsFlagArgs|readCcsFlags|stripCcsKeys|buildMerged|mergedPath|MERGED_DIR|CCS_ONLY_KEYS` 零命中。

## Out of Scope

- 任意参数文本框 / 参数持久化。
- provider 目录化（`providers/<name>/`）。
- 已有 provider 配置的迁移 / 容错读取。
- SQLite 等存储引擎替换。
