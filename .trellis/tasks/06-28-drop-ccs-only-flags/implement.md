# Implement — 移除 ccs-only 参数体系

## 执行顺序

按依赖方向（类型 → launch → 表单 → cli → config → i18n → 测试 → 文档），每步可独立编译验证。

### 1. 类型契约（`src/types.ts`）
- 删 `ProviderSettings.dangerouslySkipPermissions?: true;`（`:42`）。
- 删 `FormState.dangerouslySkipPermissions: boolean;`（`:60`）。
- 同步更新 `ProviderSettings` 上方注释（`:37` 提及该字段）。

### 2. launch 核心（`src/launch.ts`）
- 删 `CCS_ONLY_KEYS`、`stripCcsKeys`、`CcsFlags`、`readCcsFlags`、`ccsFlagArgs`（`:27-59`）。
- 删 `buildProviderSettings`、`buildMerged` 别名（`:72-81`）。
- 删 `mergedPath`（`:103-105`）。
- 改 `dryRun`（`:112-120`）：`readProvider` 取对象做 `redactSettings` 展示；命令用 `providerFile(name)`；null→`error.providerMissing`。
- 改 `launch`（`:160-191`）：删 `buildProviderSettings`/`ensureDirs`/`writeFileSync`/`readCcsFlags`/`ccsFlagArgs`/`childEnv`；`args = ['--settings', providerFile(name), ...forwardedArgs]`；env 用 `process.env`。
- import 调整：去 `MERGED_DIR`、`writeFileSync`、`PROVIDER_SUFFIX`（若不再用）、`readProvider` 保留；新增 `providerFile`。
- 保留 `redactSettings`、`whichClaude`、`launchDefault`、`dryRunDefault`、`clearScreen`。

### 3. 表单（`src/form.ts`）
- 删 `InitInput.dangerouslySkipPermissions?: true;`（`:81`）。
- 删 `initState` 中该字段初始化（`:175`）。
- 删 `buildResult` 中该字段写入块（`:224-226`）。

### 4. 表单 UI（`src/formUi.ts`）
- `FieldId` 移除 `'dangerouslySkipPermissions'`（`:25`）。
- Options tab 字段列表移除 toggle（`:90`）。
- `fieldValue` 移除分支（`:141`）。
- `toggleField` 移除分支（`:155-156`）。
- `fieldLabel` 移除 case（`:210`）。
- `initial` 类型注解移除该字段（`:534`）。

### 5. CLI（`src/cli.ts`）
- import 移除 `buildProviderSettings`（`:13`）。
- `cmdShow`（`:407-412`）：改用 `readProvider`；null 时 `console.error` + `process.exit(1)`；`redactSettings` 保留。
- 检查 `cli.ts` 其他 `readProvider`/`providerFile` import 是否已存在，按需补。

### 6. config（`src/config.ts`）
- 删 `MERGED_DIR`（`:13`）及其注释（`:12`）。
- `ensureDirs`（`:20-24`）删 `mkdirSync(MERGED_DIR, ...)`。

### 7. i18n（`src/i18n.ts`）
- 删 `form.fDanger`（en + zh-CN）。
- 改 `launch.dryTmp`：说明 `--settings` 指向 provider 文件本身，dry-run 不启动不创建。

### 8. 测试
- `tests/launch.test.ts`：删 `buildProviderSettings`/`ccsFlagArgs`/`stripCcsKeys`/`readCcsFlags`/`mergedPath`/`buildMerged` 的 describe；import 清理。
- `tests/launch-spawn.test.ts`：断言改为 spawn `--settings` 参数 === `providerFile(name)`；删 `MERGED_DIR` import 与 merged 文件断言；删 `forwards dangerouslySkipPermissions flag` 用例。
- `tests/form.test.ts`：删 `dangerouslySkipPermissions only written when true`（`:173-178`）。
- `tests/formUi.test.ts`：字段列表断言移除该项（`:56`）。
- `tests/cli-main.test.ts` / `cli-interactive.test.ts`：mock 的 `buildProviderSettings` 改为 `readProvider`（按新调用调整）。

### 9. 文档（`README.md`）
- 存储布局（`:33`）：删 `merged/` 行。
- 说明段（`:37`）：移除 `dangerouslySkipPermissions` 提及与"剥离自身管理的 key"表述，改为"provider 文件即 Claude settings 片段，launch 直接 `--settings` 它"。

## 验证命令

```bash
npm run build                 # AC1: strict 下无类型错误
npm test                      # AC2: 全绿
npm run coverage              # AC2: 7 文件 ≥80%（formUi 除外）
# AC6: 零命中
grep -rnE "dangerouslySkip|ccsFlagArgs|readCcsFlags|stripCcsKeys|buildMerged|mergedPath|MERGED_DIR|CCS_ONLY_KEYS" src/
```

## Review Gates

- 完成 step 2 后先 `npm run build` 确认 launch 链路类型通。
- 完成 step 8 后跑全量 `npm test`。
- AC3/AC4 手动验证：`ccs <some-provider> --dry-run` 检查打印命令形态。

## 回滚点

- 单次提交，`git revert` 即可整体回滚。
- 若 `exactOptionalPropertyTypes` 在 `buildResult` 报错，检查是否残留对已删字段的赋值。
