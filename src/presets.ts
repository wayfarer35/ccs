import { readJSON } from './config.js';
import builtinPresets from './presets.json' with { type: 'json' };
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Preset } from './types.js';

const USER_PRESETS_FILE = join(homedir(), '.ccs', 'presets.json');

export const CUSTOM_KEY = '__custom__';

export function loadBuiltinPresets(): Record<string, Preset> {
  return builtinPresets as Record<string, Preset>;
}

export function loadUserPresets(): Record<string, Preset> {
  return readJSON<Record<string, Preset>>(USER_PRESETS_FILE, {}) || {};
}

/**
 * 合并内置预设与用户预设（~/.ccs/presets.json），用户可覆盖同名预设或新增。
 * 返回 { key: preset }，附带 CUSTOM 选项由调用方处理。
 */
export function getPresets(): Record<string, Preset> {
  const user = loadUserPresets();
  return { ...builtinPresets, ...user } as Record<string, Preset>;
}

export function getPreset(key: string): Preset | null {
  if (key === CUSTOM_KEY || !key) return null;
  return getPresets()[key] || null;
}

export function presetList(): Array<{ key: string } & Preset> {
  const all = getPresets();
  return Object.entries(all).map(([key, p]) => ({ key, ...p }));
}
