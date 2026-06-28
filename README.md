# ccs — Claude Code Switch

支持 [Claude Code](https://docs.claude.com/en/docs/claude-code) 可以使用不同的配置

ccs 将供应商配置单独存储，启动把「供应商配置」通过 `claude --settings`  添加到启动参数。由 claude 会将 `~/.claude/settings.json` 与供应商配置进行合并（`--settings` 优先级最高，同 key 覆盖下层）。

> Bilingual: ccs 自动感知系统语言（中文/English），可用 `ccs config locale en|zh-CN` 手动设置。未设置时按 `LANG`/`LC_ALL` 自动判断，识别不到则回退English。

## 为什么需要

Claude Code 的供应商接入全靠 `env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / 各档位别名）。多供应商时只能手动改来改去，没法同时维护几套。`ccs` 把供应商配置拆成独立文件，按需启动；**通用配置直接复用 `~/.claude/settings.json`**，不重复维护 hooks/statusLine/theme 等。

## 安装

```bash
git clone <repo> && cd ccs
npm install
npm link        # 全局注册 ccs 命令
```

或本地直接跑：`npm run build && node dist/cli.js ...`

## 配置存放

```
~/.ccs/
  providers/
    deepseek-api.settings.json      供应商配置（env: BASE_URL/AUTH_TOKEN/MODEL/别名 + model）
    myprov.settings.json
  config.json                       ccs 自身设置（如语言 locale）
  presets.json                      自定义/覆盖预设（可选）
  .lastused                         记录上次选择（仅用于交互高亮）
```

每个 provider 文件都是标准的 Claude Code settings 片段。启动时 ccs 直接执行 `claude --settings ~/.ccs/providers/<name>.settings.json`。

## 用法

```bash
ccs                      # 交互选择 供应商 / default / create 并启动（有配置时另含 edit / remove）
ccs use                  # 同上：交互选择并启动
ccs provider-name        # 直接用 供应商配置名称
ccs provider-name --print "hi"   # 透传参数给 claude
ccs provider-name --dry-run      # 打印片段与命令，不启动
ccs list                 # 列出供应商
ccs presets              # 列出可用预设
ccs create               # 引导式创建（先选 内置/自定义，再填 Key）
ccs create myprov        # 直接以自定义名称创建
ccs edit provider-name    # 引导式编辑（预填当前值，回车保留）
ccs edit provider-name --raw    # 用编辑器改原始 JSON
ccs remove provider-name  # 删除
ccs common               # 在编辑器中打开 ~/.claude/settings.json
ccs show provider-name   # 查看供应商片段（密钥已遮蔽）
ccs config locale zh-CN  # 设置语言（en | zh-CN）
ccs -h                   # 帮助
```


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


## 许可

MIT
