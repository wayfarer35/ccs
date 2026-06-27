# ccs — Claude Code Switch

在多套供应商配置之间切换并启动 [Claude Code](https://docs.claude.com/en/docs/claude-code)。

把「与供应商无关的通用配置」和「每个供应商各自的配置」分开存放。启动时 ccs 把供应商配置写成一份 settings 片段喂给 `claude --settings`，由 claude 自行与 `~/.claude/settings.json` 深合（`--settings` 优先级最高，同 key 覆盖下层）。切供应商就是 `ccs deepseek-api`，或直接 `ccs` 交互选择。

> Bilingual: ccs 自动感知系统语言（中文/English），可用 `ccs config locale en|zh-CN` 手动设置。未设置时按 `LANG`/`LC_ALL` 自动判断，识别不到则回退英语。

## 为什么需要

Claude Code 的供应商接入全靠 `env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / 各档位别名）。多供应商时只能手动改来改去，没法同时维护几套。`ccs` 把供应商配置拆成独立文件，按需启动；**通用配置直接复用 `~/.claude/settings.json`**，ccs 只读不写，不重复维护 hooks/statusLine/theme 等。

## 安装

```bash
git clone <repo> && cd ccs
npm install
npm link        # 全局注册 ccs 命令
```

或本地直接跑：`npm run build && node dist/cli.js ...`

## 配置存放

```
~/.claude/settings.json             通用配置（hooks/statusLine/theme/通用 env 等）；ccs 只读，不写入
~/.ccs/
  providers/
    deepseek-api.settings.json      供应商配置（env: BASE_URL/AUTH_TOKEN/MODEL/别名 + model）
    myprov.settings.json
  config.json                       ccs 自身设置（如语言 locale）
  presets.json                      自定义/覆盖预设（可选）
  merged/<name>.settings.json       启动时写入的供应商片段（即 --settings 目标，保留供审查）
  .lastused                         记录上次选择（仅用于交互高亮）
```

每个 provider 文件都是标准的 Claude Code settings 片段。启动时 ccs 只剥离自身管理的 key（如 `dangerouslySkipPermissions`），把片段写入 `~/.ccs/merged/<name>.settings.json`，执行 `claude --settings <该文件>`，同时把片段里的 `env` 注入子进程（双保险）。**不做手动合并**——claude 加载 `--settings` 时会自行与 user/project settings 深合，片段里出现的 key 覆盖下层；ccs 只需把要覆盖的 key 填全。每次启动都重写片段，改了通用配置立刻生效。

供应商 `env` 还会始终带上四项 `CLAUDE_CODE_*` 配置（见下文「环境变量」），可在创建/编辑表单的 Options Tab 调整。

## 用法

```bash
ccs                      # 交互选择 供应商 / default / create 并启动（有配置时另含 edit / remove）
ccs use                  # 同上：交互选择并启动
ccs deepseek-api         # 直接用 deepseek-api 启动
ccs deepseek-api --print "hi"   # 透传参数给 claude
ccs deepseek-api --dry-run      # 打印片段与命令，不启动
ccs list                 # 列出供应商
ccs presets              # 列出可用预设
ccs create               # 引导式创建（先选 内置/自定义，再填 Key）
ccs create myprov        # 直接以自定义名称创建
ccs edit deepseek-api    # 引导式编辑（预填当前值，回车保留）
ccs edit deepseek-api --raw    # 用编辑器改原始 JSON
ccs remove deepseek-api  # 删除
ccs common               # 在编辑器中打开 ~/.claude/settings.json
ccs show deepseek-api    # 查看供应商片段（密钥已遮蔽）
ccs config locale zh-CN  # 设置语言（en | zh-CN）
ccs -h                   # 帮助
```

## 创建供应商：内置 vs 自定义

`ccs create` 第一步选择：

- **内置供应商**：从预设列表选一个，表单按预设预填，通常只需填 API Key。配置名默认取预设 key，可修改（同一供应商可建多个账号配置，如 `deepseek-api` / `deepseek-work`）。
- **自定义**：输入自定义名称，空白表单逐项填写。

`ccs create <name>` 跳过选择，直接以该名称走自定义路径。`create` 永远新建，重名直接拒绝；改既有配置用 `ccs edit`。

### 配置表单（4 个 Tab）

创建/编辑表单用导航菜单在 4 个 Tab 间切换，选哪个填哪个，填完回到菜单，可随时预览、反复修改，最后在 Review Tab 提交保存：

1. **API Key** — Base URL + API Key/Token（编辑时留空保留原值）。
2. **Models** — 档位别名模式（`settings.model` + 各档位 `ANTHROPIC_DEFAULT_*_MODEL`）或单模型模式（`ANTHROPIC_MODEL`）。
3. **Options** — 四项 `CLAUDE_CODE_*` 配置（attribution / non-essential traffic / auto-compact window / effort）+ `dangerouslySkipPermissions` 开关。
4. **Review** — 脱敏预览 settings 片段，校验并确认保存。

## 内置预设

内置预设有两种形态：自带推荐模型与各档位别名（创建时预填，开箱即用），或只预填 Base URL（模型由你在表单中填写）。所有内置供应商统一使用 `ANTHROPIC_AUTH_TOKEN` 认证。用 `ccs presets` 查看完整列表。

每个预设还带一份默认 `options`（四项 `CLAUDE_CODE_*` 配置的预填值）：

| 选项 | 默认 | 说明 |
|---|---|---|
| `attributionHeader` | `false` | `CLAUDE_CODE_ATTRIBUTION_HEADER`，是否向 git 提交追加归属 |
| `disableNonEssentialTraffic` | `true` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`，禁用遥测/分析流量 |
| `autoCompactWindow` | `200000` | `CLAUDE_CODE_AUTO_COMPACT_WINDOW`，自动压缩窗口（token 数） |
| `effort` | `max` | `CLAUDE_CODE_EFFORT_LEVEL`，推理强度（`low`/`medium`/`high`/`xhigh`/`max`），可在供应商上覆盖 |

### 自定义预设

在 `~/.ccs/presets.json` 中按相同结构写入，可覆盖内置预设或新增：

```json
{
  "myprov": {
    "label": "我的供应商",
    "baseUrl": "https://my.example.com/anthropic",
    "model": "my-model",
    "models": { "haiku": "my-fast", "sonnet": "my-model", "opus": "my-model", "fable": "my-model" },
    "options": {
      "attributionHeader": false,
      "disableNonEssentialTraffic": true,
      "autoCompactWindow": 200000
    }
  }
}
```

- `model`：默认模型（`ANTHROPIC_MODEL`）。
- `models`：各档位别名映射（`haiku/sonnet/opus/fable`，小写）。没有 `models` 的预设按「只预填 Base URL」处理，模型由用户填写。
- `options`：可选，预填四项 `CLAUDE_CODE_*` 配置；省略时用默认值。

## 环境变量

- `CCS_CLAUDE_BIN`：指定 `claude` 路径（默认 `claude`）。
- `EDITOR` / `VISUAL`：`--raw` 与 `ccs common` 使用的编辑器（默认 `vi`）。
- `LANG` / `LC_ALL`：未通过 `ccs config locale` 设置语言时，据此自动感知。

以下四项由 ccs 按供应商注入到 `env`（在创建/编辑表单的 Options Tab 调整，也可在预设 `options` 里预填）：

- `CLAUDE_CODE_ATTRIBUTION_HEADER`：是否启用 git 提交归属（`1`/`0`，默认 `0`）。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`：是否禁用非必要流量/遥测（`1`/`0`，默认 `1`）。
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW`：自动压缩窗口，token 数（默认 `200000`）。
- `CLAUDE_CODE_EFFORT_LEVEL`：推理强度（`low`/`medium`/`high`/`xhigh`/`max`，默认 `max`）。

> `dangerouslySkipPermissions` 是 ccs 自管开关（不进入 `--settings` 片段），开启后启动时透传 `--allow-dangerously-skip-permissions`（仅允许会话内切到 bypass 模式，不全程绕过）。

## Shell 补全

`ccs` 支持 bash 与 zsh 的 tab 补全：补全子命令、已有 provider 名、preset key，且上下文感知（如 `ccs show <Tab>` 只补 provider 名，`ccs create <Tab>` 只补 preset key）。

**自动安装（推荐）**：全局安装 `npm install -g ccs` 时会自动把补全 `eval` 行写入 `~/.bashrc` 与 `~/.zshrc`（幂等，重复安装/升级不重复追加）。重开终端即可用。非全局安装（作为依赖）不会修改任何 rc 文件。

**手动安装**：

```bash
eval "$(ccs completion bash)"   # bash；或追加到 ~/.bashrc
eval "$(ccs completion zsh)"    # zsh；需已 compinit
```

**卸载**：删除 `~/.bashrc` / `~/.zshrc` 中 `# >>> ccs completion >>>` 到 `# <<< ccs completion <<<` 之间的行。

## 版本自增

项目版本号随每次 git commit 按前缀自动递增，单一真源为 `package.json` 的 `version`（`ccs --version` 与之始终一致）。

**规则（三段式 `major.minor.patch`）：**

| commit message 第一行前缀 | 递增 | 例 |
|---|---|---|
| `fix:` / `fix(scope):` | patch++ | `0.1.9 → 0.1.10` |
| 其它（feat/chore/docs/refactor/…，甚至无前缀） | minor++（patch 归零） | `0.1.9 → 0.2.0` |
| major | **始终手动**，hook 永不自动改 | — |

**安装 hook：**

```bash
npm run hooks:install
# → 把 post-commit + bump.mjs 复制到 .git/hooks/，幂等覆盖
```

安装后 `.git/hooks/post-commit` 存在且可执行。提交时 hook 读 commit message 前缀，bump 版本号，并用 `git commit --amend --no-edit` 把变更并入本次提交（commit hash 会因 amend 改变，属正常）。无需 husky，零运行时依赖。

**跳过 bump 的情形：**

- `CCS_NO_BUMP=1 git commit ...` — 显式禁用本次 bump。
- merge commit（多父提交）— 自动跳过。
- cherry-pick 进行中（`.git/CHERRY_PICK_HEAD` 存在）— 跳过。
- 当次已手动改 `package.json` 的 version 行并提交 — hook 尊重手动值，不重复 bump。
- hook 自身触发的 amend（`CCS_BUMPING=1`）— 防递归，不再 bump。

> 用 `post-commit` + `--amend`：`prepare-commit-msg`/`commit-msg` 运行时 commit 的 tree 已锁定，`git add` 进不了本次提交；`pre-commit` 能改 index 但拿不到 message。只有 `post-commit` 能在 commit 创建后读 `git log -1` 消息，再 amend 把 version 并入——这是唯一可靠的"读消息 + 改本次提交"途径。

## 许可

MIT
