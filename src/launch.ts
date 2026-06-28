import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  readProvider, providerFile, providerExists, setLastUsed,
} from './config.js';
import { t } from './i18n.js';
import type { ProviderSettings } from './types.js';

/** 展示用：遮蔽疑似密钥的 env 值（仅保留末 4 位）。 */
export function redactSettings(obj: ProviderSettings): ProviderSettings {
  const clone: ProviderSettings = JSON.parse(JSON.stringify(obj));
  if (clone && typeof clone === 'object' && clone.env) {
    for (const k of Object.keys(clone.env)) {
      if (/TOKEN|KEY|SECRET|PASSWORD/i.test(k) && typeof clone.env[k] === 'string') {
        const v = clone.env[k] as string;
        clone.env[k] = v.length > 4 ? `****${v.slice(-4)}` : '****';
      }
    }
  }
  return clone;
}

export function whichClaude(): string {
  return process.env.CCS_CLAUDE_BIN || 'claude';
}

/**
 * 清屏并擦除滚动缓冲，让 claude 接管一个干净窗口——视觉上与直接在命令行运行 claude 一致。
 * 仅在交互式 TTY 下生效；非 TTY（管道/重定向）时跳过，避免向非终端写入转义序列。
 */
function clearScreen() {
  if (process.stdout.isTTY) {
    // \x1b[3J 清滚动缓冲，\x1b[H 光标归位，\x1b[2J 清可见屏幕。
    process.stdout.write('\x1b[3J\x1b[H\x1b[2J');
  }
}

/**
 * 打印 provider 配置片段与将要执行的命令，不启动 claude。
 * `--settings` 直接指向 provider 配置文件本身——ccs 不再产出中间文件。
 * 注意：展示的是 provider 片段，非 claude 最终加载的完整 settings（后者还会与
 * ~/.claude/settings.json 深合，片段里未出现的 key 由下层继承）。
 */
export function dryRun(name: string, forwardedArgs: string[] = []) {
  const provider = readProvider<ProviderSettings>(name);
  if (!provider) {
    throw new Error(t('error.providerMissing', { name }));
  }
  const file = providerFile(name);
  const args = ['--settings', file, ...forwardedArgs];
  console.log(JSON.stringify(redactSettings(provider), null, 2));
  console.log(`\n${t('launch.willRun', { cmd: `${whichClaude()} ${args.join(' ')}` })}`);
  console.log(t('launch.dryTmp', { file }));
}

/**
 * 直接启动 claude，使用 Claude Code 默认配置（~/.claude/settings.json）。
 * 不做合并、不写临时文件、不记录 lastUsed。
 */
export function launchDirect(forwardedArgs: string[] = []) {
  const bin = whichClaude();
  const args = [...forwardedArgs];
  // 擦除 ccs 自身 TUI 残留，给 claude 一个干净窗口（等同命令行直接启动）。
  clearScreen();
  let res: SpawnSyncReturns<Buffer>;
  try {
    res = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(t('error.claudeBin', { bin }));
    }
    throw e;
  }
  if (res.status !== null && res.status !== 0) {
    process.exitCode = res.status;
  }
}

/**
 * 打印 direct 模式将执行的命令，不启动。
 */
export function dryRunDirect(forwardedArgs: string[] = []) {
  const bin = whichClaude();
  const args = [...forwardedArgs];
  console.log(t('launch.willRun', { cmd: `${bin} ${args.join(' ')}` }));
  console.log(t('launch.dryDirect'));
}

/**
 * 以 provider 配置文件作为 --settings 目标直接启动 claude（claude 自行与 ~/.claude/settings.json 深合）。
 * 不解析 provider 对象、不写中间文件、不注入子进程 env——claude 加载 --settings 时自行读取 env。
 * @param name  供应商名
 * @param forwardedArgs  透传给 claude 的参数
 */
export function launch(name: string, forwardedArgs: string[] = []) {
  if (!providerExists(name)) {
    throw new Error(t('error.providerMissing', { name }));
  }
  const file = providerFile(name);
  const bin = whichClaude();
  const args = ['--settings', file, ...forwardedArgs];

  setLastUsed(name);

  // 擦除 ccs 自身 TUI 残留，给 claude 一个干净窗口（等同命令行直接启动）。
  clearScreen();
  let res: SpawnSyncReturns<Buffer>;
  try {
    res = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(t('error.claudeBin', { bin }));
    }
    throw e;
  }
  if (res.status !== null && res.status !== 0) {
    process.exitCode = res.status;
  }
}
