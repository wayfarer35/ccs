# Implement — ccs tab 命令补全

## 执行清单（按序）

- [x] 1. 新建 `src/completion.ts`
  - 导出 `completeCandidates(argv: string[]): string[]`（见 design.md）。
  - 导出 `bashCompletionScript`、`zshCompletionScript` 常量。
  - 导出 `SUPPORTED_SHELLS` 与 `completionHelp(shell?)` 提示文本。
  - 注意 `noUncheckedIndexedAccess`：访问数组元素后用 `!` 或判空。

- [x] 2. `src/cli.ts` 接入
  - `main` 开头（`const [cmd,...rest] = argv` 之后、`-h/-v` 判断附近）增加：
    - `if (cmd === '__complete') { printCandidates(rest); return; }`（不进 try 包裹也行，但保持一致放进 try）。
  - switch 增加 `case 'completion': return cmdCompletion(rest);`
  - 实现 `printCandidates(words)`：`for (const c of completeCandidates(words)) console.log(c);`
  - 实现 `cmdCompletion(rest)`：按 `rest[0]` 分发 bash/zsh 脚本或提示。
  - 更新 `helpEn` / `helpZh`：在 Usage 区追加 `ccs completion <bash|zsh>` 一行；`__complete` 不出现在 help。

- [x] 3. shell 脚本常量打磨
  - bash：`complete -F _ccs_bash_complete ccs`，`command -v ccs` 守卫，`2>/dev/null || return`。
  - zsh：`compdef _ccs_zsh_complete ccs`，同样守卫。
  - 在 `completion.ts` 顶部用模板字符串写好，便于 review。

- [x] 4. 新建 `tests/completion.test.ts`
  - `vi.mock('./config.js')` 返回 `listProviders: () => ['deepseek-api','myprov']`。
  - `vi.mock('./presets.js')` 返回 `presetList: () => [{key:'ark-coding-plan',...},{key:'deepseek-api',...}]`（最小字段）。
  - 表驱动断言 `completeCandidates` 各分支（见 design 测试策略）。
  - 断言 `bashCompletionScript` 包含 `__complete` 与 `complete -F ... ccs`；`zshCompletionScript` 包含 `compdef`。

- [x] 5. 新建 `scripts/postinstall.mjs`（自动安装补全到 rc）
  - 首行守卫：`if (process.env.npm_config_global !== 'true') process.exit(0);`
  - 导出纯函数 `injectCompletionRc(rcPath, shell)`：读 rc（不存在视作空串）→ 若已含 `# >>> ccs completion >>>` 标记则返回未改 → 否则追加标记块（含 `eval "$(ccs completion <shell>)"`）→ 写回（2 空格无关，纯追加）。
  - main：对 `~/.bashrc`(bash) 与 `~/.zshrc`(zsh) 调用；rc 不存在则创建。
  - `chmod` 不需要（rc 文件无需可执行）。

- [x] 6. `package.json` 增 `"postinstall": "node scripts/postinstall.mjs"`。

- [x] 7. 新建 `tests/postinstall.test.ts`
  - 用 `os.tmpdir()` 临时 rc 文件测 `injectCompletionRc`：
    - 空 rc → 追加标记块，含 `eval "$(ccs completion bash)"`。
    - 已含标记块的 rc → 内容不变（幂等）。
    - 不存在的 rc → 创建并写入。
  - main 守卫测：`npm_config_global` 未设时 `injectCompletionRc` 不被调用（可用 spy 或直接测 main 在临时 HOME 下不产生文件）。
  - 覆盖率门槛 80%。

- [x] 8. README 增补「Shell 补全」节
  - 说明：全局安装 `npm i -g ccs` 后自动写入 `~/.bashrc`/`~/.zshrc`，重开终端即可用。
  - 手动备选：`eval "$(ccs completion bash)"` / `eval "$(ccs completion zsh)"`。
  - 卸载清理：删除 rc 中 `# >>> ccs completion >>>` 到 `# <<< ccs completion <<<` 之间的行。

- [x] 9. 质量检查（review gate）
  - `npm run build` 无 TS 错误。
  - `npm test` 全绿，`completion` 与 `postinstall` 测试覆盖率 ≥80%。
  - 手动验证（可选）：`eval "$(node dist/cli.js completion bash)"` 后试补全；`npm_config_global=true node scripts/postinstall.mjs` 在临时 HOME 下确认 rc 被写入且幂等。

## 验证命令

```bash
npm run build
npm test -- completion postinstall
node dist/cli.js completion bash | head
node dist/cli.js __complete show ''
node dist/cli.js __complete ''
# 模拟全局安装写 rc（用临时 HOME 避免污染真实 rc）：
HOME=$(mktemp -d) npm_config_global=true node scripts/postinstall.mjs
cat "$HOME/.bashrc"   # 应含 eval 行；再跑一次内容不变
```

## 回滚点

- completion.ts / cli-completion 改动均增量、不破坏既有命令分发；若补全异常，移除 switch 新增 case 与 `__complete` 分支即可恢复。
- postinstall：移除 `package.json` 的 `postinstall` 脚本与 `scripts/postinstall.mjs` 即停用自动安装；用户 rc 中的标记块需手动删除（文档已说明）。无数据迁移。
