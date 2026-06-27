# ccs tab 命令补全

## Goal

让 shell 在 `ccs` 后能 tab 补全子命令与动态配置名（provider 名、preset key），上下文感知；且 `npm install -g ccs` 时自动安装/更新补全，无需用户手动配置。

## Requirements

- 新增 `ccs completion <shell>` 命令，输出 bash / zsh 补全脚本到 stdout。
- 新增隐藏命令 `ccs __complete <words...>`：根据已输入词序列输出候选项（每行一个，已按前缀过滤）。
- 候选规则：
  - 第一个位置词：全部子命令（`list ls presets create edit remove rm common show config use`）+ 已有 provider 名 + 全局 flag（`-h --help -v --version`）。
  - `edit`/`remove`/`rm`/`show` 的第一个参数：provider 名。
  - `create` 的第一个参数：preset key。
  - `config` 的第一个参数：`locale`；第二个参数：`en`、`zh-CN`。
  - 其余位置（`use` 之后的透传参数、`ccs <name>` 之后的 claude args）：不补全，返回空。
- 补全脚本对 ccs 不在 PATH 时静默降级（不向用户报错）。
- **自动安装**：`npm install -g ccs`（全局安装）时通过 `postinstall` 自动把补全 `eval` 行写入 `~/.bashrc` 和 `~/.zshrc`（幂等，带标记行，重复安装/升级不重复追加）。被作为依赖安装（非全局）时跳过，不污染使用者环境。
- 无新增运行时依赖。

## Acceptance Criteria

- [x] `ccs completion bash` 输出可被 `eval` 的 bash 补全脚本；`ccs completion zsh` 输出 zsh 脚本；`ccs completion` 无参数或 `ccs completion fish` 给出友好提示（fish 非 MVP）。
- [x] bash `eval` 后：`ccs <Tab>` 列子命令+provider；`ccs show <Tab>` 仅 provider；`ccs create <Tab>` 仅 preset key；`ccs config locale <Tab>` 列 `en zh-CN`。
- [x] zsh 下等价生效（`compdef _ccs ccs`）。
- [x] `ccs __complete show ''` 输出 provider 名；`ccs __complete ''` 输出子命令+provider+flags。
- [x] 新增模块单测覆盖候选生成逻辑，覆盖率 ≥80%。
- [x] 模拟全局安装（`npm_config_global=true`）运行 postinstall：`~/.bashrc` 与 `~/.zshrc` 各追加一条带标记的 `eval` 行；再次运行不重复追加（幂等）。
- [x] 模拟非全局安装（`npm_config_global` 未设）：postinstall 不修改任何 rc 文件。
- [x] `ccs --help` 文本与 README 补一节说明（含自动安装机制与手动 `eval` 备选）。

## Notes

- 候选数据复用 `listProviders()` 与 `presetList()`，单一真源。
- 隐藏命令 `__complete` 双下划线前缀，help 不展示。
- postinstall 写 rc 用幂等标记块（`# >>> ccs completion >>>` / `# <<< ccs completion <<<`），便于将来 `--uninstall` 清理；MVP 不做卸载清理，文档说明手动删标记块。
- postinstall 仅在 `npm_config_global=true` 时写 rc；rc 文件不存在时创建。
