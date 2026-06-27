import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync,
} from 'node:fs';

export const CCS_DIR = join(homedir(), '.ccs');
export const PROVIDERS_DIR = join(CCS_DIR, 'providers');
export const CONFIG_FILE = join(CCS_DIR, 'config.json');
export const LASTUSED_FILE = join(CCS_DIR, '.lastused');
export const CACHE_DIR = join(CCS_DIR, '.cache');
/** 合并后的最终配置持久化目录，供用户审查 claude 实际加载的 settings。 */
export const MERGED_DIR = join(CCS_DIR, 'merged');

/** 通用配置来源：直接用 Claude Code 自身的 settings.json，ccs 只读不写。 */
export const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export const PROVIDER_SUFFIX = '.settings.json';

export function ensureDirs() {
  mkdirSync(PROVIDERS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(MERGED_DIR, { recursive: true });
}

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Failed to parse JSON / 解析 JSON 失败: ${file}\n${e.message}`);
  }
}

export function writeJSON(file, obj) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

/** 写入原始字符串内容（自动创建父目录），用于编辑 ~/.claude/settings.json 等已有文件。 */
export function writeFileSyncSafe(file, content) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

export function providerFile(name) {
  return join(PROVIDERS_DIR, `${name}${PROVIDER_SUFFIX}`);
}

export function readProvider(name) {
  return readJSON(providerFile(name), null);
}

export function providerExists(name) {
  return existsSync(providerFile(name));
}

export function listProviders() {
  ensureDirs();
  let entries = [];
  try { entries = readdirSync(PROVIDERS_DIR); } catch { /* dir missing */ }
  return entries
    .filter((f) => f.endsWith(PROVIDER_SUFFIX))
    .map((f) => f.slice(0, -PROVIDER_SUFFIX.length))
    .sort((a, b) => a.localeCompare(b));
}

export function getLastUsed() {
  try { return readFileSync(LASTUSED_FILE, 'utf8').trim() || null; } catch { return null; }
}

export function setLastUsed(name) {
  try { writeFileSync(LASTUSED_FILE, name); } catch { /* best-effort */ }
}

export function removeProvider(name) {
  rmSync(providerFile(name), { force: true });
}
