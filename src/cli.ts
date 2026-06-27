#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SpawnSyncReturns } from 'node:child_process';

import {
  listProviders, providerExists, providerFile, readProvider, writeJSON,
  removeProvider, getLastUsed, writeFileSyncSafe, CLAUDE_SETTINGS_FILE,
} from './config.js';
import { presetList } from './presets.js';
import { providerFormWithPreview, chooseCreateMode, pickBuiltinPreset } from './form.js';
import { launch, dryRun, launchDefault, dryRunDefault, buildProviderSettings, redactSettings } from './launch.js';
import { ui, Cancel } from './tui.js';
import { t, detectLocale, setConfig, LOCALES } from './i18n.js';
import { getVersion } from './version.js';
import { completeCandidates, completionScript, completionHelp } from './completion.js';
import type { Preset } from './types.js';

// 版本号单一真源：运行时从 package.json 读取，不再硬编码。
const VERSION = getVersion();

const helpEn = `ccs ${VERSION} — Claude Code Switch

Switch between multiple provider configs and launch Claude Code.

Usage:
  ccs                        Pick a provider / default / create interactively, then launch
  ccs <name> [args...]       Launch with the named provider; args forwarded to claude
  ccs <name> --dry-run       Print merged config + command without launching
  ccs use [args...]          Pick a provider interactively and launch
  ccs list                   List provider configs
  ccs presets                List built-in presets
  ccs create [name]          Create a new config (duplicate names rejected; built-in prompts for a name, default = preset key)
  ccs edit <name> [--raw]    Guided edit (--raw: edit raw JSON in $EDITOR)
  ccs remove <name>          Remove a provider config
  ccs common                 Edit common config (~/.claude/settings.json) in $EDITOR
  ccs show <name>            Show merged config (secrets redacted)
  ccs config [locale [en|zh-CN]]  Show/set language
  ccs completion <bash|zsh>  Print shell completion script
  ccs -h | --help            Help
  ccs -v | --version         Version

Storage:
  ~/.claude/settings.json    Common config (provider-agnostic); ccs reads, never writes
  ~/.ccs/providers/<name>.settings.json   Per-provider config
  ~/.ccs/config.json         ccs settings (e.g. locale)
  ~/.ccs/presets.json        Custom/override presets (optional)

Environment:
  CCS_CLAUDE_BIN             Path to claude binary (default: claude)
  EDITOR / VISUAL            Editor for --raw / common (default: vi)
  LANG / LC_ALL              Auto-detected for locale before ccs config locale is set

Examples:
  ccs create                 Pick built-in (e.g. deepseek-api) → only API key needed
  ccs create myprov          Create a custom provider named myprov
  ccs deepseek-api           Launch with deepseek-api
  ccs deepseek-api --print "hi"   Forward args to claude
  ccs show deepseek-api      Inspect merged result (common + provider)`;

const helpZh = `ccs ${VERSION} — Claude Code Switch

在多套供应商配置间切换并启动 Claude Code。

用法:
  ccs                        交互选择 供应商 / default / create 并启动
  ccs <name> [args...]       用指定供应商启动；args 透传给 claude
  ccs <name> --dry-run       打印合并结果与命令，不启动
  ccs use [args...]          交互选择供应商并启动
  ccs list                   列出供应商配置
  ccs presets                列出可用预设
  ccs create [name]          创建新配置（重名将被拒绝；内置会询问配置名，默认取预设 key）
  ccs edit <name> [--raw]    引导式编辑（--raw 用编辑器改原始 JSON）
  ccs remove <name>          删除供应商配置
  ccs common                 编辑通用配置（~/.claude/settings.json）
  ccs show <name>            查看合并后的配置（密钥已遮蔽）
  ccs config [locale [en|zh-CN]]  查看/设置语言
  ccs completion <bash|zsh>  输出 shell 补全脚本
  ccs -h | --help            帮助
  ccs -v | --version         版本

配置存放:
  ~/.claude/settings.json    通用配置（与供应商无关）；ccs 只读不写
  ~/.ccs/providers/<name>.settings.json  各供应商配置
  ~/.ccs/config.json         ccs 设置（如语言）
  ~/.ccs/presets.json        自定义/覆盖预设（可选）

环境变量:
  CCS_CLAUDE_BIN             指定 claude 可执行文件路径（默认 claude）
  EDITOR / VISUAL            --raw / common 使用的编辑器（默认 vi）
  LANG / LC_ALL              未设置语言时自动感知系统语言

示例:
  ccs create                 选内置（如 deepseek-api）→ 通常只需填 API Key
  ccs create myprov          创建名为 myprov 的自定义供应商
  ccs deepseek-api           直接用 deepseek-api 启动
  ccs deepseek-api --print "hi"   透传参数给 claude
  ccs show deepseek-api      检查合并结果（含 common 覆盖关系）`;

// 直接作为入口执行时才跑 main；被 import（如测试）时不自动运行。
const isMain = (() => {
  try { return realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (isMain) main();

export {
  main, cmdCreate, cmdEdit, cmdRemove, cmdCommon, cmdShow,
  cmdConfig, cmdConfigLocale, cmdList, cmdPresets, cmdUse, cmdLaunch,
  printHelp, validateName, nameValidator,
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;

  try {
    if (cmd === '-h' || cmd === '--help' || cmd === 'help') return printHelp();
    if (!cmd) return await cmdUse(rest);
    if (cmd === '-v' || cmd === '--version') { console.log(VERSION); return; }
    // 隐藏命令：供 shell 补全脚本回调，输出候选项（每行一个）。
    if (cmd === '__complete') { printCandidates(rest); return; }

    switch (cmd) {
      case 'list': case 'ls': return cmdList();
      case 'presets': return cmdPresets();
      case 'create': { await cmdCreate(rest); return; }
      case 'edit': return await cmdEdit(rest);
      case 'remove': case 'rm': return await cmdRemove(rest);
      case 'common': return cmdCommon();
      case 'show': return cmdShow(rest);
      case 'config': return await cmdConfig(rest);
      case 'use': return await cmdUse(rest);
      case 'completion': return cmdCompletion(rest);
      default:
        if (cmd.startsWith('-')) {
          // 裸 ccs 直接跟参数（如 `ccs --dangerously-skip-permissions`）：
          // 当作 `ccs use <args>` 处理——交互选供应商后透传给 claude。
          // （-h/--help/-v/--version 已在上面先行处理。）
          return cmdUse([cmd, ...rest]);
        }
        return cmdLaunch(cmd, rest);
    }
  } catch (e) {
    if (e instanceof Cancel) { ui.cancel(t('common.cancelled')); process.exit(1); }
    console.error(`\x1b[31m${t('error.generic', { msg: (e as Error).message })}\x1b[0m`);
    process.exit(1);
  }
}

// ---------- launch ----------

function cmdLaunch(name: string, rest: string[]): void {
  const dry = rest.includes('--dry-run');
  const forwarded = rest.filter((a) => a !== '--dry-run');
  if (dry) return dryRun(name, forwarded);
  launch(name, forwarded);
}

function cmdLaunchDefault(rest: string[]): void {
  const dry = rest.includes('--dry-run');
  const forwarded = rest.filter((a) => a !== '--dry-run');
  if (dry) return dryRunDefault(forwarded);
  launchDefault(forwarded);
}

type UsePick =
  | { kind: 'provider'; name: string }
  | { kind: 'default' }
  | { kind: 'create' }
  | { kind: 'edit' }
  | { kind: 'remove' };

/**
 * 让用户从现有配置中挑一个（用于菜单里的 edit / remove）。
 * 无配置时提示并返回 null；取消（Esc）抛 Cancel 由调用方决定是否回菜单。
 */
async function pickExistingProvider(message: string): Promise<string | null> {
  const names = listProviders();
  if (!names.length) {
    ui.log.message(t('list.empty'));
    return null;
  }
  const last = getLastUsed();
  const options = names.map((n) => ({
    value: n,
    label: n,
    hint: n === last ? t('list.lastUsed') : '',
  }));
  return ui.select<string>({ message, options, initialValue: options[0]!.value });
}

async function cmdUse(rest: string[]): Promise<void> {
  // 循环菜单：选供应商/default/create 会启动并返回；
  // 选 edit/remove 完成后回到菜单继续，子流程取消（Esc）也回菜单而非退出。
  for (;;) {
    const names = listProviders();
    const last = getLastUsed();

    // 菜单始终包含现有供应商 + default + create；有配置时再加 edit / remove。
    const options: Array<{ value: UsePick; label: string; hint: string }> = [];
    for (const n of names) {
      options.push({
        value: { kind: 'provider', name: n } as UsePick,
        label: n,
        hint: n === last ? t('list.lastUsed') : '',
      });
    }
    options.push(
      { value: { kind: 'default' } as UsePick, label: t('use.default'), hint: t('use.defaultHint') },
      { value: { kind: 'create' } as UsePick, label: t('use.create'), hint: t('use.createHint') },
    );
    if (names.length) {
      options.push(
        { value: { kind: 'edit' } as UsePick, label: t('use.edit'), hint: t('use.editHint') },
        { value: { kind: 'remove' } as UsePick, label: t('use.remove'), hint: t('use.removeHint') },
      );
    }

    // 默认高亮上次使用的供应商，否则第一项。
    let initialValue: UsePick = options[0]!.value;
    if (last) {
      const li = options.findIndex((o) => o.value.kind === 'provider' && o.value.name === last);
      if (li >= 0) initialValue = options[li]!.value;
    }

    const picked = await ui.select<UsePick>({ message: t('use.select'), options, initialValue });

    if (picked.kind === 'provider') return cmdLaunch(picked.name, rest);
    if (picked.kind === 'default') return cmdLaunchDefault(rest);
    if (picked.kind === 'create') {
      // 创建完成后立即用新供应商启动；创建被取消则回菜单。
      const created = await cmdCreate(rest);
      if (created) return cmdLaunch(created, rest);
      continue;
    }
    if (picked.kind === 'edit') {
      try {
        const name = await pickExistingProvider(t('use.editSelect'));
        if (name) await cmdEdit([name]);
      } catch (e) {
        if (e instanceof Cancel) { ui.cancel(t('common.cancelled')); continue; }
        throw e;
      }
      continue;
    }
    if (picked.kind === 'remove') {
      try {
        const name = await pickExistingProvider(t('use.removeSelect'));
        if (name) await cmdRemove([name]);
      } catch (e) {
        if (e instanceof Cancel) { ui.cancel(t('common.cancelled')); continue; }
        throw e;
      }
      continue;
    }
  }
}

// ---------- listing ----------

function cmdList(): void {
  const names = listProviders();
  if (!names.length) {
    console.log(t('list.empty'));
    return;
  }
  const last = getLastUsed();
  console.log(t('list.header'));
  for (const n of names) console.log(`  ${n === last ? '*' : ' '} ${n}`);
  console.log(`\n${t('list.summary', { count: names.length })}`);
}

function cmdPresets(): void {
  const list = presetList();
  console.log(t('presets.header'));
  for (const p of list) {
    console.log(`  ${p.key.padEnd(20)} ${p.label}  ${p.baseUrl || t('presets.fillUrl')}`);
  }
  console.log(`\n${t('presets.footer')}`);
  console.log(t('presets.userFile'));
}

// ---------- completion ----------

/** 隐藏命令 `ccs __complete <words...>`：逐行打印候选。 */
function printCandidates(words: string[]): void {
  for (const c of completeCandidates(words)) console.log(c);
}

/** `ccs completion <shell>`：输出补全脚本或提示。 */
function cmdCompletion(rest: string[]): void {
  const shell = rest[0];
  if (!shell) { console.log(completionHelp()); return; }
  const script = completionScript(shell);
  if (!script) { console.log(completionHelp(shell)); return; }
  process.stdout.write(script);
}

// ---------- create / edit / remove ----------

function validateName(name: string): void {
  if (!name || /[\\/\s]/.test(name) || name.includes('..')) {
    throw new Error(t('error.invalidName', { name }));
  }
}

/**
 * 配置名校验器（供 clack text 的 validate 内联使用）。
 * 检查非空、非法字符、重名——重名即时提示，引导用户改名而非直接失败。
 * 返回错误消息字符串，或 undefined 表示通过。
 */
function nameValidator(v: string): string | undefined {
  const name = (v || '').trim();
  if (!name) return t('create.customNameValidate');
  if (/[\\/\s]/.test(name) || name.includes('..')) return t('error.invalidName', { name });
  if (providerExists(name)) return t('error.exists', { name });
  return undefined;
}

async function cmdCreate(rest: string[]): Promise<string | undefined> {
  const nameArg = rest[0];
  let name: string;
  let preset: Preset | null = null;

  if (nameArg) {
    // ccs create <name> → 用给定名称创建（自定义空白表单）
    validateName(nameArg);
    name = nameArg;
  } else {
    // 交互：内置 or 自定义
    const mode = await chooseCreateMode();
    if (mode === 'builtin') {
      const picked = await pickBuiltinPreset();
      // 配置名默认取预设 key，可改——同一供应商可建多个账号配置
      // （如 deepseek-api / deepseek-work），不再固定为预设名。
      name = (await ui.text({
        message: t('create.namePrompt', { default: picked.key }),
        initialValue: picked.key,
        validate: nameValidator,
      })).trim();
      preset = picked.preset;
    } else {
      name = (await ui.text({
        message: t('create.customNamePrompt'),
        validate: nameValidator,
      })).trim();
    }
  }

  // create 永远新建：重名直接拒绝。修改既有配置请用 ccs edit，删除用 ccs remove。
  // （交互流程已内联检测；此处兜底覆盖 ccs create <name> 直传名称的情况。）
  if (providerExists(name)) {
    throw new Error(t('error.exists', { name }));
  }

  ui.intro(t('create.kindTitle', { name }));
  const result = await providerFormWithPreview({ initial: {}, preset });
  writeJSON(providerFile(name), result);
  ui.outro(t('create.created', { file: providerFile(name) }));
  return name;
}

async function cmdEdit(rest: string[]): Promise<void> {
  const name = rest[0];
  const raw = rest.includes('--raw');
  if (!name) { console.error(t('usage.editName')); process.exit(1); }
  if (!providerExists(name)) { console.error(t('error.notFound', { name })); process.exit(1); }
  if (raw) return editRaw(providerFile(name));
  ui.intro(t('edit.title', { name }));
  const initial = readProvider(name) || {};
  const result = await providerFormWithPreview({ initial });
  writeJSON(providerFile(name), result);
  ui.outro(t('edit.updated', { file: providerFile(name) }));
}

async function cmdRemove(rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name) { console.error(t('usage.removeName')); process.exit(1); }
  if (!providerExists(name)) { console.error(t('error.notFound', { name })); process.exit(1); }
  ui.intro(t('remove.title', { name }));
  const ok = await ui.confirm({ message: t('remove.confirm', { name }), initialValue: false });
  if (!ok) { ui.cancel(t('common.cancelled')); return; }
  removeProvider(name);
  ui.outro(t('remove.done', { name }));
}

function editRaw(file: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  spawnSync(editor, [file], { stdio: 'inherit' });
}

// ---------- common / show / config ----------

function cmdCommon(): void {
  // 通用配置直接用 ~/.claude/settings.json，ccs 只读不写。
  if (!existsSync(CLAUDE_SETTINGS_FILE)) {
    writeFileSyncSafe(CLAUDE_SETTINGS_FILE, '{}\n');
    console.log(t('common.createdEmpty', { file: CLAUDE_SETTINGS_FILE }));
  }
  console.log(t('common.openEditor'));
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  spawnSync(editor, [CLAUDE_SETTINGS_FILE], { stdio: 'inherit' });
}

function cmdShow(rest: string[]): void {
  const name = rest[0];
  if (!name) { console.error(t('usage.showName')); process.exit(1); }
  const settings = buildProviderSettings(name);
  console.log(JSON.stringify(redactSettings(settings), null, 2));
}

async function cmdConfig(rest: string[]): Promise<void> {
  const [key, val] = rest;
  if (key === 'locale') return cmdConfigLocale(val);
  if (!key) {
    console.log(t('config.localeCurrent', { locale: detectLocale() }));
    console.log(`  ccs config locale [${LOCALES.map((l) => l.value).join(' | ')}]`);
    return;
  }
  console.error(t('config.unknownKey', { key }));
  process.exit(1);
}

async function cmdConfigLocale(val: string | undefined): Promise<void> {
  const valid = LOCALES.map((l) => l.value);
  if (val) {
    if (!valid.includes(val)) {
      console.error(t('config.localeInvalid', { opts: valid.join(', ') }));
      process.exit(1);
    }
    setConfig({ locale: val });
    console.log(t('config.localeSet', { locale: val }));
    return;
  }
  const current = detectLocale();
  const picked = await ui.select<string>({
    message: t('config.localePrompt'),
    options: LOCALES.map((l) => ({ value: l.value, label: l.label, hint: l.value === current ? t('list.lastUsed') : '' })),
    initialValue: valid.includes(current) ? current : 'en',
  });
  setConfig({ locale: picked });
  console.log(t('config.localeSet', { locale: picked }));
}

// ---------- help ----------

function printHelp(): void {
  const locale = detectLocale();
  console.log(locale === 'zh-CN' ? helpZh : helpEn);
}

// 显式标注 SpawnSyncReturns 仅用于类型可用性（避免 verbatim 移除）
export type { SpawnSyncReturns };
