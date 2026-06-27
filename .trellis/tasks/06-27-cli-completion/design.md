# Design — ccs tab 命令补全

## 方案选型

候选方案对比：

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 静态补全脚本（硬编码子命令） | 简单 | 无法补全动态 provider/preset 名，不满足核心需求 |
| B. shell 脚本内嵌 `ls ~/.ccs/providers/` | 无需改 ccs | 逻辑散落在 shell，多 shell 维护成本高，preset key 在 JSON 内难解析 |
| **C. `ccs completion <shell>` 输出脚本 + 隐藏 `ccs __complete` 回调**（cobra/oclif 模式） | 动态候选、逻辑集中在 TS、易测试、shell 侧薄 | 多一个隐藏命令 |

**采用 C**：这是现代 CLI（kubectl/cobra/oclif）的主流模式，把候选生成逻辑留在 TS 侧可单测，shell 脚本只负责把当前词序列转发给 `ccs __complete`。

## 架构

```
shell (bash/zsh)
  └─ tab 触发补全函数
       └─ ccs __complete <word1> <word2> ... <cur>   # 最后一个为当前正在输入的词（可为空串）
            └─ completeCandidates(argv) → string[]   # 新模块 completion.ts
                 ├─ listProviders()    # 来自 config.ts
                 └─ presetList()       # 来自 presets.ts
            └─ stdout 逐行打印候选（已按 cur 前缀过滤）
```

## 新增模块 `src/completion.ts`

纯函数，无 IO 副作用（provider/preset 读取仍走现有模块），便于单测。

```ts
import { listProviders } from './config.js';
import { presetList } from './presets.js';

const SUBCOMMANDS = ['list','ls','presets','create','edit','remove','rm','common','show','config','use'];
const GLOBAL_FLAGS = ['-h','--help','-v','--version'];
const PROVIDER_CMDS = new Set(['edit','remove','rm','show']);

/**
 * 根据已输入词序列返回补全候选（未按前缀过滤，由调用方/脚本过滤；
 * 这里也做前缀过滤以保持 __complete 输出干净）。
 * argv = 去掉 `ccs` 与 `__complete` 后的词，最后一个元素是当前光标词 cur。
 */
export function completeCandidates(argv: string[]): string[] {
  const cur = argv[argv.length - 1] ?? '';
  const prev = argv.slice(0, -1);

  // 第一个位置词未输入（prev 为空）→ 补子命令+provider+flags
  if (prev.length === 0) {
    return filterByPrefix([...SUBCOMMANDS, ...listProviders(), ...GLOBAL_FLAGS], cur);
  }

  const head = prev[0]!; // noUncheckedIndexedAccess → 用 !

  // 子命令的第一个参数位
  if (prev.length === 1) {
    if (PROVIDER_CMDS.has(head))   return filterByPrefix(listProviders(), cur);
    if (head === 'create')         return filterByPrefix(presetList().map(p => p.key), cur);
    if (head === 'config')         return filterByPrefix(['locale'], cur);
    // list/presets/common/use 无位置参数补全；ccs <name> 已在 prev.length===0 覆盖
    return [];
  }

  // config locale <cur>
  if (head === 'config' && prev[1] === 'locale') {
    return filterByPrefix(['en','zh-CN'], cur);
  }

  return [];
}

function filterByPrefix(cands: string[], prefix: string): string[] {
  if (!prefix) return cands;
  return cands.filter(c => c.startsWith(prefix));
}
```

> 注意：`prev.length===0` 分支同时覆盖了 `ccs <name>` 直接启动的 provider 名补全——因为 provider 名也是第一位置词的合法值，与子命令并列。这是该 CLI「子命令与 provider 名共享第一位置词空间」特性的自然映射。

## CLI 接入（`src/cli.ts`）

1. 在 `main` 的 switch 前增加对 `__complete` 与 `completion` 的分发：
   ```ts
   if (cmd === '__complete') { printCandidates(rest); return; }
   ...
   case 'completion': return cmdCompletion(rest);
   ```
2. `printCandidates(words)`：调用 `completeCandidates(words)`，逐行 `console.log`。words 即 `rest`（已含末尾空串：shell 脚本保证传一个空串表示光标在空位）。
3. `cmdCompletion(rest)`：
   - `rest[0] === 'bash'` → 打印 `BASH_SCRIPT`；
   - `rest[0] === 'zsh'` → 打印 `ZSH_SCRIPT`；
   - 否则打印提示（含安装示例）。
4. 脚本字符串作为常量放在 `completion.ts` 导出（`bashCompletionScript` / `zshCompletionScript`），便于单测断言其调用 `ccs __complete`。

## Shell 脚本要点

**bash**（`complete -F` 风格）：
```bash
_ccs_bash_complete() {
  local cur prev words cword
  _init_completion -n : || return
  # 把 COMP_WORDS 去掉 ccs 本身，末尾补 cur，传给 ccs __complete
  local args=("${words[@]:1}" "$cur")
  local cands
  cands=$(ccs __complete "${args[@]}" 2>/dev/null) || return
  COMPREPLY=( $(compgen -W "$cands" -- "$cur") )
}
complete -F _ccs_bash_complete ccs
```
- 用 `command -v ccs >/dev/null` 守卫整段，不在 PATH 时不注册、不报错。
- `compgen -W` 二次过滤（脚本与 TS 都过滤是冗余但无害，保证 shell 侧最终一致）。

**zsh**（`compdef` + `_arguments` 风格，但为保持动态性同样回调 `ccs __complete`）：
```zsh
_ccs_zsh_complete() {
  local -a args=("${words[@]:1}" "$CURRENT_WORD")
  local -a cands=(${(f)"$(ccs __complete "${args[@]}" 2>/dev/null)"})
  compadd -- "$@" "${cands[@]}"
}
compdef _ccs_zsh_complete ccs
```
（实现时按 zsh 真实 `compadd`/`_describe` 习惯微调；核心是回调 `ccs __complete`。）

## 兼容性 / 降级

- ccs 不在 PATH：脚本顶部 `command -v ccs` 守卫，静默跳过。
- `__complete` 自身出错：脚本 `2>/dev/null || return`，不打扰用户。
- provider/preset 为空：返回空列表，shell 显示无候选，符合预期。

## postinstall 自动安装

**目标**：`npm install -g ccs` 时自动把补全 `eval` 行写入用户 shell rc，无需手动配置；升级/重装幂等；被作为依赖安装时不污染。

### 触发判定

`package.json` 增 `"postinstall": "node scripts/postinstall.mjs"`。脚本首行判断：
```js
if (process.env.npm_config_global !== 'true') process.exit(0);
```
- 全局安装（`npm i -g`）→ `npm_config_global=true` → 继续。
- 本地依赖安装 / `npm install`（开发）→ 跳过，不改 rc。
- 注：postinstall 在 `npm install`（无 -g）也会跑，靠此守卫跳过，开发环境安全。

### 写入 rc（幂等标记块）

对 bash 与 zsh 各写一份（检测对应 rc 存在与否，不存在则创建）：
- `~/.bashrc` 追加：
  ```bash
  # >>> ccs completion >>>
  eval "$(ccs completion bash)"
  # <<< ccs completion <<<
  ```
- `~/.zshrc` 追加：
  ```zsh
  # >>> ccs completion >>>
  eval "$(ccs completion zsh)"
  # <<< ccs completion <<<
  ```
- 幂等：写前读取 rc，若已含 `# >>> ccs completion >>>` 标记则跳过（升级时 eval 目标 `ccs completion` 输出已更新，无需重写 rc 行）。
- ccs 不在 PATH（极端：postinstall 跑时 bin 尚未链接）时：仍写 eval 行（运行时再降级），不报错。

### 模块化

`scripts/postinstall.mjs` 导出纯函数 `injectCompletionRc(rcPath, shell)`（读、判标记、追加标记块），便于单测；main 调用它对两个 rc 执行。rc 路径用 `os.homedir()` 解析，尊重 `HOME`。

### 卸载

MVP 不做卸载清理（npm uninstall 不触发脚本）。文档说明手动删除 `# >>> ccs completion >>>` 到 `# <<< ccs completion <<<` 之间的行。标记块为将来 `ccs completion --uninstall` 预留。

## 测试策略

- `tests/completion.test.ts`：对 `completeCandidates` 做表驱动测试：
  - `[]` / `['']` → 含全部子命令+flags（provider/preset 依赖文件，用 mock 或接受实际环境，建议 mock `listProviders`/`presetList`）。
  - `['show','']` → provider 名。
  - `['create','ar']` → 以 `ar` 开头的 preset key。
  - `['config','']` → `['locale']`；`['config','locale','']` → `['en','zh-CN']`。
  - `['use','']` → `[]`。
- mock 方式：`vi.mock('./config.js', ...)` / `vi.mock('./presets.js', ...)` 注入固定 provider/preset 集，保证测试确定性。
- 覆盖率门槛 80%。

## 不做（Out of Scope）

- fish / PowerShell 补全（提示未支持，留待后续）。
- `ccs <name>` 之后的 claude 透传参数补全（claude 自身参数，超出 ccs 职责）。
- `ccs completion --uninstall` 自动清理 rc（MVP 用标记块预留，文档指导手动删）。
