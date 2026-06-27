# ccs — Claude Code Switch

在多套供应商配置之间切换并启动 [Claude Code](https://docs.claude.com/en/docs/claude-code)。

把「与供应商无关的通用配置」和「每个供应商各自的配置」分开存放，启动时合并成一份临时 settings 喂给 `claude --settings`。切供应商就是 `ccs deepseek-api`，或直接 `ccs` 交互选择。

> Bilingual: ccs 自动感知系统语言（中文/English），可用 `ccs config locale en|zh-CN` 手动设置。未设置时按 `LANG`/`LC_ALL` 自动判断，识别不到则回退英语。

## 为什么需要

Claude Code 的供应商接入全靠 `env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / 各档位别名）。多供应商时只能手动改来改去，没法同时维护几套。`ccs` 把供应商配置拆成独立文件，按需合并启动；**通用配置直接复用 `~/.claude/settings.json`**，ccs 只读不写，不重复维护 hooks/statusLine/theme 等。

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
  .lastused                         记录上次选择（仅用于交互高亮）
  .cache/                           临时合并文件（启动后清理）
```

每个文件都是标准的 Claude Code settings 片段。启动时 `ccs` 先从 `~/.claude/settings.json` 剥离所有「供应商专属」的认证与 model 配置（顶层 `model` 及 `env` 下所有 `ANTHROPIC_*`），再与 provider 深度合并（`env` 按 key 合并，冲突时供应商胜），写入临时文件，执行 `claude --settings <临时文件>`，同时把合并后的 `env` 注入子进程（双重保证供应商生效）。临时文件用完即删，**每次启动都重新合并**——改了通用配置立刻生效。

供应商 `env` 还会始终带上三项 `CLAUDE_CODE_*` 配置（见下文「环境变量」），可在创建/编辑表单的 Options Tab 勾选或调整。

## 用法

```bash
ccs                      # 交互选择 供应商 / default / create 并启动（无供应商时只剩 default 与 create）
ccs deepseek-api         # 直接用 deepseek-api 启动
ccs deepseek-api --print "hi"   # 透传参数给 claude
ccs deepseek-api --dry-run      # 打印合并结果与命令，不启动
ccs list                 # 列出供应商
ccs presets              # 列出可用预设
ccs create               # 引导式创建（先选 内置/自定义，再填 Key）
ccs create myprov        # 直接以自定义名称创建
ccs edit deepseek-api    # 引导式编辑（预填当前值，回车保留）
ccs edit deepseek-api --raw    # 用编辑器改原始 JSON
ccs remove deepseek-api  # 删除
ccs common               # 在编辑器中打开 ~/.claude/settings.json
ccs show deepseek-api    # 查看合并结果（密钥已遮蔽）
ccs init                 # 从 ~/.claude/settings.json 拆出 ANTHROPIC_* 为供应商
ccs config locale zh-CN  # 设置语言（en | zh-CN）
ccs -h                   # 帮助
```

## 创建供应商：内置 vs 自定义

`ccs create` 第一步选择：

- **内置供应商**：从预设列表选一个，**文件名固定为预设 key**（如选 `deepseek-api` → `providers/deepseek-api.settings.json`），表单按预设预填，通常只需填 API Key。已存在时会询问是否覆盖。
- **自定义**：输入自定义名称，空白表单逐项填写。

`ccs create <name>` 跳过选择，直接以该名称走自定义路径。

### 配置表单（5 个 Tab）

创建/编辑表单用导航菜单在 5 个 Tab 间切换，选哪个填哪个，填完回到菜单，可随时预览、反复修改，最后 Submit 保存：

1. **API Key** — Base URL + API Key/Token（编辑时留空保留原值）。
2. **Models** — 档位别名模式（`settings.model` + 各档位 `ANTHROPIC_DEFAULT_*_MODEL`）或单模型模式（`ANTHROPIC_MODEL`）。
3. **Options** — 勾选三项 `CLAUDE_CODE_*` 配置的启用/禁用与窗口大小。
4. **Preview** — 脱敏预览合并后的 settings 片段。
5. **Submit** — 校验并确认保存。

## 内置预设

内置预设分两种：

- **有限模型型**（deepseek / mimo / bigmodel）：自带一套推荐模型与各档位别名，创建时预填，开箱即用。
- **多模型型**（ark）：只预填 Base URL，模型由你在表单中自行填写。

| key | 供应商 | Base URL | 模型 |
|---|---|---|---|
| `ark-coding-plan` | 火山引擎 Ark Coding Plan | `https://ark.cn-beijing.volces.com/api/coding` | 自填 |
| `ark-agent-plan` | 火山引擎 Ark Agent Plan | `https://ark.cn-beijing.volces.com/api/plan` | 自填 |
| `bigmodel-coding-plan` | 智谱 Bigmodel | `https://open.bigmodel.cn/api/anthropic` | glm-4.7 / glm-5.2[1m] |
| `deepseek-api` | DeepSeek | `https://api.deepseek.com/anthropic` | deepseek-v4-flash / deepseek-v4-pro[1m] |
| `mimo-api` | 小米 MiMo | `https://api.xiaomimimo.com/anthropic` | mimo-v2.5-flash / mimo-v2.5-pro[1m] |
| `mimo-token-plan` | 小米 MiMo (Token Plan) | `https://token-plan-cn.xiaomimimo.com/anthropic` | mimo-v2.5-flash / mimo-v2.5-pro[1m] |

所有供应商统一使用 `ANTHROPIC_AUTH_TOKEN` 认证。

每个内置预设还带一份默认 `options`（四项 `CLAUDE_CODE_*` 配置的预填值）：

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
- `models`：各档位别名映射（`haiku/sonnet/opus/fable`，小写）。没有 `models` 的预设按「多模型型」处理，模型由用户填写。
- `options`：可选，预填四项 `CLAUDE_CODE_*` 配置（`attributionHeader` / `disableNonEssentialTraffic` / `autoCompactWindow` / `effort`）；省略时用默认值。

## 从现有配置迁移

如果你现在所有配置都在 `~/.claude/settings.json`：

```bash
ccs init
```

它会读取该文件，把 `ANTHROPIC_*` 拆成一个供应商配置（命名由你输入），其余（hooks/statusLine/非 ANTHROPIC env 等）原地保留为通用配置。可选择从 `~/.claude/settings.json` 中移除已迁移的 `ANTHROPIC_*`（推荐），避免直接 `claude` 时残留过期供应商。

## 环境变量

- `CCS_CLAUDE_BIN`：指定 `claude` 路径（默认 `claude`）。
- `EDITOR` / `VISUAL`：`--raw` 与 `ccs common` 使用的编辑器（默认 `vi`）。
- `LANG` / `LC_ALL`：未通过 `ccs config locale` 设置语言时，据此自动感知。

以下三项由 ccs 按供应商注入到合并后的 `env`（在创建/编辑表单的 Options Tab 调整，也可在预设 `options` 里预填）：

- `CLAUDE_CODE_ATTRIBUTION_HEADER`：是否启用 git 提交归属（`1`/`0`，默认 `0`）。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`：是否禁用非必要流量/遥测（`1`/`0`，默认 `1`）。
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW`：自动压缩窗口，token 数（默认 `200000`）。

## 许可

MIT
