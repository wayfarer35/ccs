# Design — 移除 ccs-only 参数体系

## 架构与边界

本次是纯删除 + 链路简化，不新增模块。改动集中在两个边界：

1. **存储布局**：`~/.ccs/merged/` 目录整体移除。provider 配置文件（`~/.ccs/providers/<name>.settings.json`）成为 `claude --settings` 的唯一直接目标。
2. **类型契约**：`ProviderSettings` / `FormState` / `InitInput` 移除 `dangerouslySkipPermissions` 字段。`ProviderSettings` 退化为纯 Claude settings 片段（`env` + 可选 `model`）。

## 数据流（改动后）

### `launch(name, forwardedArgs)`
```
providerFile(name)  →  claude --settings <providerFile> [forwardedArgs]
```
- 不再 `readProvider` 解析对象（不再需要 env 注入）。
- 不再写 `merged/` 中间文件。
- 不再传 `--allow-dangerously-skip-permissions`。
- `setLastUsed(name)` 保留；`clearScreen()` 保留；ENOENT→`error.claudeBin` 保留。
- 子进程 env 直接用 `process.env`（删除 `childEnv` 合并）。

### `dryRun(name, forwardedArgs)`
- 仍 `readProvider` 取对象 → `redactSettings` 打印（展示用）。
- 打印命令改为 `claude --settings <providerFile> [forwardedArgs]`。
- `i18n launch.dryTmp` 文案调整：不再提"持久化保存以便审查"的 merged 文件，改为说明 `--settings` 即 provider 文件本身（dry-run 不启动）。

### `cmdShow(name)`（`cli.ts:407-412`）
- `readProvider` 取对象 → `redactSettings` 打印。provider 不存在时给提示并退出（替代原 `buildProviderSettings` 抛 `error.providerMissing` 的行为）。

## 函数去留

| 函数 | 处置 |
|---|---|
| `buildProviderSettings` | **删**。调用点改用 `readProvider` + 各自报错。 |
| `buildMerged`（别名） | **删**。 |
| `stripCcsKeys` / `CCS_ONLY_KEYS` | **删**。 |
| `readCcsFlags` / `ccsFlagArgs` / `CcsFlags` | **删**。 |
| `mergedPath` | **删**。 |
| `MERGED_DIR` | **删**（`config.ts`）。 |
| `redactSettings` | **留**。 |
| `readProvider` / `providerFile` | **留**，调用点增加。 |
| `whichClaude` / `launchDefault` / `dryRunDefault` | 不动。 |

## 类型契约变更

`src/types.ts`：
- `ProviderSettings`：删 `dangerouslySkipPermissions?: true;`。
- `FormState`：删 `dangerouslySkipPermissions: boolean;`。

`src/form.ts`：
- `InitInput`：删 `dangerouslySkipPermissions?: true;`。
- `initState`：删该字段初始化（`:175`）。
- `buildResult`：删该字段写入（`:224-226`）。

## 表单变更（`src/formUi.ts`）

- `FieldId` 联合移除 `'dangerouslySkipPermissions'`（`:25`）。
- Options tab 字段列表移除该 toggle（`:90`）。
- `fieldValue` / `toggleField` 的分支移除（`:141,155-156`）。
- `fieldLabel` 的 `case` 移除（`:210`）。
- `RuntimeForm`/`initial` 类型中 `dangerouslySkipPermissions` 引用移除（`:534`）。
- `tests/formUi.test.ts:56` 的字段断言列表同步移除该项。

## i18n 变更

- 删 `form.fDanger`（zh-CN / en）。
- 改 `launch.dryTmp`：描述 `--settings` 指向 provider 文件本身，dry-run 不启动、不创建文件。

## 兼容性与迁移

- **不做迁移容错**（用户已确认手动处理已有 provider 配置）。读取时若 provider 文件残留 `dangerouslySkipPermissions`，原样保留在对象里——但 ccs 不再读它、不剥离、不传 flag。`launch` 不再解析对象，故残留字段对启动无影响（claude 加载该文件时会忽略不认识的 key）。`cmdShow`/`dryRun` 的 `redactSettings` 会原样打印残留字段（无害）。
- `merged/` 目录不主动清理（遗留目录无副作用，用户可自行删除）。

## 测试策略

- `tests/launch.test.ts`：删 `buildProviderSettings` / `ccsFlagArgs` / `stripCcsKeys` / `readCcsFlags` / `mergedPath` / `buildMerged` 的 describe 块。
- `tests/launch-spawn.test.ts`：原断言 `merged/<name>.settings.json` 存在 → 改为断言 spawn 的 `--settings` 参数等于 `providerFile(name)`；删 `forwards dangerouslySkipPermissions flag` 用例。
- `tests/form.test.ts`：删 `dangerouslySkipPermissions only written when true` 用例。
- `tests/formUi.test.ts`：字段列表断言移除该项。
- `tests/cli-main.test.ts` / `cli-interactive.test.ts`：mock 中 `buildProviderSettings` 引用改为 `readProvider`（或按新签名调整）。

## 风险与回滚

- 风险低：纯删除，无新逻辑分支。
- 主要风险点：`exactOptionalPropertyTypes` 下 `ProviderSettings` 删可选字段后，`buildResult` 返回对象构造需保证不残留该 key（已是显式 `if` 写入，删 `if` 块即可）。
- 回滚：git revert 单次提交。
