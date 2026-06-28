/**
 * Shell 补全：候选生成 + bash/zsh 脚本。
 *
 * 模式（cobra/oclif 风格）：
 * - `ccs __complete <words...>` 隐藏命令，按已输入词序列输出候选项（每行一个）。
 * - `ccs completion <shell>` 输出对应 shell 的补全脚本，脚本运行时回调 `ccs __complete`。
 *
 * 候选数据复用 listProviders() / presetList()，单一真源，不重复维护配置名表。
 * 本模块为纯函数（IO 委托 config/presets），便于单测。
 */
import { listProviders } from './config.js';
import { presetList } from './presets.js';

/** 子命令（含别名）。 */
const SUBCOMMANDS = ['list', 'ls', 'presets', 'create', 'edit', 'remove', 'rm', 'common', 'show', 'config', 'use'];
/** 全局 flag。 */
const GLOBAL_FLAGS = ['-h', '--help', '-v', '--version'];
/** 第一个参数位补 provider 名的子命令。 */
const PROVIDER_CMDS = new Set(['edit', 'remove', 'rm', 'show']);

/**
 * 根据已输入词序列返回补全候选（已按当前光标词前缀过滤）。
 *
 * argv = 去掉 `ccs` 与 `__complete` 后的词，最后一个元素是当前光标词 cur（可为空串）。
 *
 * 注意：第一位置词同时容纳子命令与具名 provider（`ccs <name>` 直接启动），
 * 这是该 CLI「子命令与 provider 名共享第一位置词空间」特性的自然映射。
 */
export function completeCandidates(argv: string[]): string[] {
  const cur = argv[argv.length - 1] ?? '';
  const prev = argv.slice(0, -1);

  // 第一个位置词未输入（prev 为空）→ 子命令 + provider 名 + 全局 flag
  if (prev.length === 0) {
    return filterByPrefix([...SUBCOMMANDS, ...listProviders(), ...GLOBAL_FLAGS], cur);
  }

  const head = prev[0]!; // noUncheckedIndexedAccess：prev 非空，[0] 必存在

  // 子命令的第一个参数位
  if (prev.length === 1) {
    if (PROVIDER_CMDS.has(head)) return filterByPrefix(listProviders(), cur);
    if (head === 'create') return filterByPrefix(presetList().map((p) => p.key), cur);
    if (head === 'config') return filterByPrefix(['locale'], cur);
    // list/presets/common/use 无位置参数补全；ccs <name> 已在 prev.length===0 覆盖
    return [];
  }

  // config locale <cur>（仅当 cur 处于 locale 取值位，即 prev 恰为 ['config','locale']）
  if (head === 'config' && prev.length === 2 && prev[1] === 'locale') {
    return filterByPrefix(['en', 'zh-CN'], cur);
  }

  return [];
}

/** 按前缀过滤候选；空前缀返回全部。 */
function filterByPrefix(cands: string[], prefix: string): string[] {
  if (!prefix) return cands;
  return cands.filter((c) => c.startsWith(prefix));
}

/**
 * bash 补全脚本。`eval "$(ccs completion bash)"` 后生效。
 * ccs 不在 PATH 时静默不注册；__complete 出错时静默返回。
 * 注意：模板字面量中所有 shell 的 ${...} 必须转义为 \${...}，避免被 JS 当成插值。
 */
export const bashCompletionScript = `# ccs bash completion
if command -v ccs >/dev/null 2>&1; then
  _ccs_bash_complete() {
    local cur cands
    cur="\${COMP_WORDS[COMP_CWORD]}"
    # COMP_WORDS[1:] 已含末尾 cur 词，直接传给 ccs __complete
    cands=$(ccs __complete "\${COMP_WORDS[@]:1}" 2>/dev/null) || return
    COMPREPLY=($(compgen -W "$cands" -- "$cur"))
  }
  complete -F _ccs_bash_complete ccs
fi
`;

/**
 * zsh 补全脚本。`eval "$(ccs completion zsh)"` 后生效（需 compinit 已加载）。
 * ccs 不在 PATH 时静默不注册。
 * 注意：模板字面量中所有 shell 的 ${...} 必须转义为 \${...}，避免被 JS 当成插值。
 */
export const zshCompletionScript = `# ccs zsh completion
if command -v ccs >/dev/null 2>&1; then
  _ccs_zsh_complete() {
    local -a cands
    # \${words[@]:1}：去掉 ccs 本身，末尾即当前词
    cands=("\${(@f)\$(ccs __complete "\${words[@]:1}" 2>/dev/null)}")
    compadd -- "\$@" "\${cands[@]}"
  }
  compdef _ccs_zsh_complete ccs
fi
`;

/** 支持的 shell。 */
export const SUPPORTED_SHELLS = ['bash', 'zsh'] as const;

/** 补全脚本按 shell 取；不支持时返回 null。 */
export function completionScript(shell: string): string | null {
  if (shell === 'bash') return bashCompletionScript;
  if (shell === 'zsh') return zshCompletionScript;
  return null;
}

/** `ccs completion` 无参/不支持的 shell 时的提示文本。 */
export function completionHelp(shell?: string): string {
  const supported = SUPPORTED_SHELLS.join(', ');
  if (shell && !SUPPORTED_SHELLS.includes(shell as typeof SUPPORTED_SHELLS[number])) {
    return `Unsupported shell: ${shell}. Supported: ${supported}.`;
  }
  return [
    'Usage: ccs completion <shell>',
    `  Outputs a shell completion script. Supported: ${supported}.`,
    '',
    'Install (bash):  eval "$(ccs completion bash)"   # or append to ~/.bashrc',
    'Install (zsh):   eval "$(ccs completion zsh)"    # or append to ~/.zshrc',
    '',
    'Global install (npm i -g @wayfarer35/ccs) auto-writes the eval line into your rc.',
  ].join('\n');
}
