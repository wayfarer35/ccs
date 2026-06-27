import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { CONFIG_FILE } from '../src/config.js';

// 所有 mock 对象用 vi.hoisted 提升，避免 vi.mock factory 引用未初始化变量
const M = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
  uiMock: {
    intro: vi.fn(), outro: vi.fn(), cancel: vi.fn(), note: vi.fn(),
    log: { message: vi.fn(), info: vi.fn(), step: vi.fn(), warning: vi.fn(), error: vi.fn() },
    select: vi.fn(), confirm: vi.fn(), text: vi.fn(), password: vi.fn(),
  },
  launchMock: {
    launch: vi.fn(), dryRun: vi.fn(), launchDefault: vi.fn(), dryRunDefault: vi.fn(),
    buildProviderSettings: vi.fn(() => ({ env: { ANTHROPIC_BASE_URL: 'https://x' } })),
    redactSettings: vi.fn((o: unknown) => o),
  },
  formMock: {
    providerFormWithPreview: vi.fn(async () => ({ env: { ANTHROPIC_BASE_URL: 'https://x' } })),
    chooseCreateMode: vi.fn(), pickBuiltinPreset: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({ spawnSync: M.spawnSync, default: { spawnSync: M.spawnSync } }));
vi.mock('../src/tui.js', () => ({
  ui: M.uiMock,
  Cancel: class Cancel extends Error { constructor() { super('cancel'); this.name = 'Cancel'; } },
  clack: {},
}));
vi.mock('../src/launch.js', () => M.launchMock);
vi.mock('../src/form.js', () => M.formMock);

const { spawnSync, uiMock, launchMock, formMock } = M;

import {
  cmdUse, cmdCreate, cmdEdit, cmdRemove, cmdConfig, cmdConfigLocale, cmdCommon,
} from '../src/cli.js';
import { providerFile, writeJSON } from '../src/config.js';

const TEST_NAME = `__cli_int_${process.pid}`;
function clean() { try { fs.rmSync(providerFile(TEST_NAME), { force: true }); } catch { /* ignore */ } }

// cmdConfig 等会写真实 ~/.ccs/config.json，备份/恢复避免污染用户设置（本文件内串行，安全）
let configBackup: string | null = null;
beforeEach(() => {
  clean(); vi.clearAllMocks();
  configBackup = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null;
});
afterEach(() => {
  clean();
  if (configBackup !== null) fs.writeFileSync(CONFIG_FILE, configBackup);
  else if (fs.existsSync(CONFIG_FILE)) fs.rmSync(CONFIG_FILE, { force: true });
});

describe('cmdUse', () => {
  test('picks existing provider → launches', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.select.mockResolvedValueOnce({ kind: 'provider', name: TEST_NAME });
    await cmdUse([]);
    expect(launchMock.launch).toHaveBeenCalledWith(TEST_NAME, []);
  });

  test('picks default → launchDefault', async () => {
    uiMock.select.mockResolvedValueOnce({ kind: 'default' });
    await cmdUse([]);
    expect(launchMock.launchDefault).toHaveBeenCalledWith([]);
  });

  test('picks create → cmdCreate then launch created name', async () => {
    uiMock.select.mockResolvedValueOnce({ kind: 'create' });
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: {} });
    // cmdCreate 内部走 custom 分支
    formMock.chooseCreateMode.mockResolvedValueOnce('custom');
    uiMock.text.mockResolvedValueOnce(TEST_NAME);
    await cmdUse([]);
    expect(launchMock.launch).toHaveBeenCalledWith(TEST_NAME, []);
  });

  test('picks edit → loops back to menu after edit', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.select
      .mockResolvedValueOnce({ kind: 'edit' })        // 选 edit
      .mockResolvedValueOnce(TEST_NAME)               // pickExistingProvider
      .mockResolvedValueOnce({ kind: 'default' });    // 回菜单选 default
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: {} });
    await cmdUse([]);
    expect(launchMock.launchDefault).toHaveBeenCalled();
  });

  test('picks remove then loops back', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.select
      .mockResolvedValueOnce({ kind: 'remove' })
      .mockResolvedValueOnce(TEST_NAME)               // pickExistingProvider
      .mockResolvedValueOnce({ kind: 'default' });
    uiMock.confirm.mockResolvedValueOnce(true);
    await cmdUse([]);
    expect(fs.existsSync(providerFile(TEST_NAME))).toBe(false);
    expect(launchMock.launchDefault).toHaveBeenCalled();
  });

  test('remove cancelled → loops back, provider kept', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.select
      .mockResolvedValueOnce({ kind: 'remove' })
      .mockResolvedValueOnce(TEST_NAME)
      .mockResolvedValueOnce({ kind: 'default' });
    uiMock.confirm.mockResolvedValueOnce(false);
    await cmdUse([]);
    expect(fs.existsSync(providerFile(TEST_NAME))).toBe(true);
  });

  test('cancel in edit subflow (Esc) → back to menu not exit', async () => {
    const { Cancel } = await import('../src/tui.js');
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.select
      .mockResolvedValueOnce({ kind: 'edit' })
      .mockRejectedValueOnce(new Cancel())            // pickExistingProvider Esc
      .mockResolvedValueOnce({ kind: 'default' });
    await cmdUse([]);
    expect(launchMock.launchDefault).toHaveBeenCalled();
  });
});

describe('cmdCreate', () => {
  test('create <name> with explicit arg → writes file', async () => {
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: { ANTHROPIC_BASE_URL: 'https://x' } });
    const name = await cmdCreate([TEST_NAME]);
    expect(name).toBe(TEST_NAME);
    expect(fs.existsSync(providerFile(TEST_NAME))).toBe(true);
  });

  test('create <name> rejects duplicate', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    await expect(cmdCreate([TEST_NAME])).rejects.toThrow();
  });

  test('create <name> rejects invalid name', async () => {
    await expect(cmdCreate(['a/b'])).rejects.toThrow();
  });

  test('builtin flow → name from text, preset prefilled', async () => {
    formMock.chooseCreateMode.mockResolvedValueOnce('builtin');
    formMock.pickBuiltinPreset.mockResolvedValueOnce({ key: 'deepseek-api', preset: { label: 'l', baseUrl: 'https://x' } });
    uiMock.text.mockResolvedValueOnce(TEST_NAME);
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: {} });
    const name = await cmdCreate([]);
    expect(name).toBe(TEST_NAME);
    expect(formMock.pickBuiltinPreset).toHaveBeenCalled();
  });

  test('custom flow → name from text prompt', async () => {
    formMock.chooseCreateMode.mockResolvedValueOnce('custom');
    uiMock.text.mockResolvedValueOnce(TEST_NAME);
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: {} });
    const name = await cmdCreate([]);
    expect(name).toBe(TEST_NAME);
  });
});

describe('cmdEdit', () => {
  test('guided edit writes updated config', async () => {
    writeJSON(providerFile(TEST_NAME), { env: { ANTHROPIC_BASE_URL: 'https://old' } });
    formMock.providerFormWithPreview.mockResolvedValueOnce({ env: { ANTHROPIC_BASE_URL: 'https://new' } });
    await cmdEdit([TEST_NAME]);
    const written = JSON.parse(fs.readFileSync(providerFile(TEST_NAME), 'utf8'));
    expect(written.env.ANTHROPIC_BASE_URL).toBe('https://new');
  });

  test('missing name → exit', async () => {
    const exit = interceptExit();
    try { await cmdEdit([]); } catch { /* exit thrown */ } finally { restoreExit(exit); }
    expect(exit.called).toBe(true);
  });

  test('unknown name → exit', async () => {
    const exit = interceptExit();
    try { await cmdEdit([`__nope_${process.pid}`]); } catch { /* exit thrown */ } finally { restoreExit(exit); }
    expect(exit.called).toBe(true);
  });

  test('--raw opens editor', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    spawnSync.mockClear();
    process.env.EDITOR = 'true'; // no-op editor
    try { await cmdEdit([TEST_NAME, '--raw']); } finally { delete process.env.EDITOR; }
    expect(spawnSync).toHaveBeenCalled();
  });
});

describe('cmdRemove', () => {
  test('confirm yes → removes', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.confirm.mockResolvedValueOnce(true);
    await cmdRemove([TEST_NAME]);
    expect(fs.existsSync(providerFile(TEST_NAME))).toBe(false);
  });

  test('confirm no → keeps', async () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    uiMock.confirm.mockResolvedValueOnce(false);
    await cmdRemove([TEST_NAME]);
    expect(fs.existsSync(providerFile(TEST_NAME))).toBe(true);
    expect(uiMock.cancel).toHaveBeenCalled();
  });

  test('missing name → exit', async () => {
    const exit = interceptExit();
    try { await cmdRemove([]); } catch { /* exit thrown */ } finally { restoreExit(exit); }
    expect(exit.called).toBe(true);
  });
});

describe('cmdConfig', () => {
  test('no key → prints current locale', async () => {
    await expect(cmdConfig([])).resolves.toBeUndefined();
  });

  test('unknown key → calls process.exit(1)', async () => {
    const err = interceptExit();
    try { await cmdConfig(['bogus']); } catch (e) { expect(String(e)).toContain('exit:1'); }
    finally { restoreExit(err); }
    expect(err.called).toBe(true);
  });

  test('locale <val> sets locale', async () => {
    await expect(cmdConfig(['locale', 'en'])).resolves.toBeUndefined();
  });

  test('locale invalid → calls process.exit(1)', async () => {
    const err = interceptExit();
    try { await cmdConfig(['locale', 'klingon']); } catch (e) { expect(String(e)).toContain('exit:1'); }
    finally { restoreExit(err); }
    expect(err.called).toBe(true);
  });

  test('locale with no val → interactive select', async () => {
    uiMock.select.mockResolvedValueOnce('en');
    await cmdConfigLocale(undefined);
    expect(uiMock.select).toHaveBeenCalled();
  });
});

// ---------- process.exit 拦截 ----------
function interceptExit(): { called: boolean } {
  const state = { called: false };
  const orig = process.exit;
  (process as { exit: unknown }).exit = ((code?: number) => {
    state.called = true;
    throw new Error(`exit:${code ?? 0}`);
  }) as never;
  (state as { _orig: unknown })._orig = orig;
  return state;
}
function restoreExit(state: { called: boolean }) {
  (process as { exit: unknown }).exit = (state as { _orig: unknown })._orig as never;
}

describe('cmdCommon', () => {
  test('opens existing ~/.claude/settings.json in editor', () => {
    spawnSync.mockClear();
    process.env.EDITOR = 'true';
    try { cmdCommon(); } finally { delete process.env.EDITOR; }
    expect(spawnSync).toHaveBeenCalled();
  });
});
