import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  readProvider, ensureDirs, MERGED_DIR, setLastUsed,
  PROVIDER_SUFFIX,
} from './config.mjs';
import { t } from './i18n.mjs';

/** 展示用：遮蔽疑似密钥的 env 值（仅保留末 4 位）。 */
export function redactSettings(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  if (clone && typeof clone === 'object' && clone.env) {
    for (const k of Object.keys(clone.env)) {
      if (/TOKEN|KEY|SECRET|PASSWORD/i.test(k) && typeof clone.env[k] === 'string') {
        const v = clone.env[k];
        clone.env[k] = v.length > 4 ? `****${v.slice(-4)}` : '****';
      }
    }
  }
  return clone;
}

/** ccs 自管 key（非 Claude settings 字段），从写进 --settings 的片段中剥离。 */
const CCS_ONLY_KEYS = ['dangerouslySkipPermissions'];

function stripCcsKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const next = { ...obj };
  for (const k of CCS_ONLY_KEYS) delete next[k];
  return next;
}

/** 读取 provider 的 ccs 启动开关（如 dangerouslySkipPermissions），不进入 --settings 片段。 */
function readCcsFlags(name) {
  const provider = readProvider(name) || {};
  return {
    dangerouslySkipPermissions: !!provider.dangerouslySkipPermissions,
  };
}

/** 根据 ccs 启动开关构造要透传给 claude 的 CLI 参数。 */
function ccsFlagArgs(flags) {
  const args = [];
  // 用 --allow-dangerously-skip-permissions 而非 --dangerously-skip-permissions：
  // 前者只是「允许」bypass，默认不开启，用户可在会话里用 shift+tab 切到 bypassPermissions；
  // 后者会直接全程绕过权限。
  if (flags.dangerouslySkipPermissions) args.push('--allow-dangerously-skip-permissions');
  return args;
}

/**
 * 构建写进 --settings 的 provider 片段：只剥离 ccs 自管 key，不与 ~/.claude/settings.json 合并。
 *
 * 不做合并的原因：claude 加载 `--settings <file>` 时会自行与 user/project settings 深合
 * （--settings 优先级最高，同 key 覆盖下层）。ccs 只要保证 provider 片段里把「需要覆盖的 key」
 * 填全（各档位 ANTHROPIC_*、CLAUDE_CODE_* 等），claude 自合即可得到正确的最终配置。
 * 反而由 ccs 手动合并会引入「common 残留 ANTHROPIC_* 是否泄露」的复杂判断——交给 claude 更简单可靠。
 *
 * 注意：本函数返回的是 provider 片段，并非 claude 实际加载的最终 settings（后者还含
 * ~/.claude/settings.json 的非覆盖 key）。ccs show / dry-run 展示的也仅是此片段。
 */
export function buildProviderSettings(name) {
  const provider = readProvider(name);
  if (!provider) {
    throw new Error(t('error.providerMissing', { name }));
  }
  return stripCcsKeys(provider);
}

/** 向后兼容旧名。等价于 {@link buildProviderSettings}。 */
export const buildMerged = buildProviderSettings;

function whichClaude() {
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
 * 合并后配置的持久化路径：~/.ccs/merged/<name>.settings.json。
 * 文件名与供应商配置文件保持一致，便于审查 claude 实际加载的最终 settings。
 * 该文件同时作为 `--settings` 透传目标，启动后保留不删。
 */
function mergedPath(name) {
  return join(MERGED_DIR, `${name}${PROVIDER_SUFFIX}`);
}

/**
 * 打印将写进 --settings 的 provider 片段与将要执行的命令，不启动 claude。
 * 注意：展示的是 provider 片段，非 claude 最终加载的完整 settings（后者还会与
 * ~/.claude/settings.json 深合，片段里未出现的 key 由下层继承）。
 */
export function dryRun(name, forwardedArgs = []) {
  const settings = buildProviderSettings(name);
  const tmp = mergedPath(name);
  const flags = readCcsFlags(name);
  const args = ['--settings', tmp, ...ccsFlagArgs(flags), ...forwardedArgs];
  console.log(JSON.stringify(redactSettings(settings), null, 2));
  console.log(`\n${t('launch.willRun', { cmd: `${whichClaude()} ${args.join(' ')}` })}`);
  console.log(t('launch.dryTmp', { file: tmp }));
}

/**
 * 直接启动 claude，使用 Claude Code 默认配置（~/.claude/settings.json）。
 * 不做合并、不写临时文件、不记录 lastUsed。
 */
export function launchDefault(forwardedArgs = []) {
  const bin = whichClaude();
  const args = [...forwardedArgs];
  // 擦除 ccs 自身 TUI 残留，给 claude 一个干净窗口（等同命令行直接启动）。
  clearScreen();
  let res;
  try {
    res = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(t('error.claudeBin', { bin }));
    }
    throw e;
  }
  if (res.status !== null && res.status !== 0) {
    process.exitCode = res.status;
  }
}

/**
 * 打印 default 模式将执行的命令，不启动。
 */
export function dryRunDefault(forwardedArgs = []) {
  const bin = whichClaude();
  const args = [...forwardedArgs];
  console.log(t('launch.willRun', { cmd: `${bin} ${args.join(' ')}` }));
  console.log(t('launch.dryDefault'));
}

/**
 * 构建 provider 片段并以 --settings 启动 claude（claude 自行与 ~/.claude/settings.json 深合）。
 * @param {string} name  供应商名
 * @param {string[]} forwardedArgs  透传给 claude 的参数
 */
export function launch(name, forwardedArgs = []) {
  const settings = buildProviderSettings(name);
  ensureDirs();
  // provider 片段持久化到 ~/.ccs/merged/<name>.settings.json，既是 --settings 目标，
  // 也保留下来供用户审查（文件名与供应商配置一致）。
  const tmp = mergedPath(name);
  writeFileSync(tmp, JSON.stringify(settings, null, 2));

  const flags = readCcsFlags(name);
  // env 同时注入子进程环境，保证 claude 在解析 --settings 之外也能直接读到
  // （claude 读 settings 的 env 后会注入会话，此处双保险，行为与原实现一致）。
  const childEnv = { ...process.env, ...(settings.env || {}) };
  const bin = whichClaude();
  const args = ['--settings', tmp, ...ccsFlagArgs(flags), ...forwardedArgs];

  setLastUsed(name);

  // 擦除 ccs 自身 TUI 残留，给 claude 一个干净窗口（等同命令行直接启动）。
  clearScreen();
  let res;
  try {
    res = spawnSync(bin, args, { stdio: 'inherit', env: childEnv });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(t('error.claudeBin', { bin }));
    }
    throw e;
  }
  if (res.status !== null && res.status !== 0) {
    process.exitCode = res.status;
  }
}
