import { describe, test, expect, vi, beforeEach } from 'vitest';

// mock tui.ui 与 presets 以测 form.ts 的交互函数（chooseCreateMode/pickBuiltinPreset/pickPreset/providerFormWithPreview）
const M = vi.hoisted(() => ({
  uiMock: {
    intro: vi.fn(), outro: vi.fn(), cancel: vi.fn(), note: vi.fn(),
    log: { message: vi.fn(), info: vi.fn(), step: vi.fn(), warning: vi.fn(), error: vi.fn() },
    select: vi.fn(), confirm: vi.fn(), text: vi.fn(), password: vi.fn(),
    inkSelect: vi.fn(), inkText: vi.fn(), inkConfirm: vi.fn(), picker: vi.fn(),
  },
  runProviderForm: vi.fn(async () => ({ env: {} })),
  presets: {
    getPresets: vi.fn(() => ({
      'deepseek-api': { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/anthropic', model: 'm' },
      'glm': { label: 'GLM', baseUrl: 'https://x', models: {} },
    })),
    CUSTOM_KEY: '__custom__',
  },
}));

vi.mock('../src/tui.js', () => ({ ui: M.uiMock, Cancel: class Cancel extends Error {}, clack: {} }));
vi.mock('../src/formUi.js', () => ({ runProviderForm: M.runProviderForm }));
vi.mock('../src/presets.js', () => M.presets);
vi.mock('../src/i18n.js', () => ({ t: (k: string) => k }));

import { chooseCreateMode, pickBuiltinPreset, pickPreset, providerFormWithPreview } from '../src/form.js';

beforeEach(() => vi.clearAllMocks());

describe('chooseCreateMode', () => {
  test('returns selected mode', async () => {
    M.uiMock.inkSelect.mockResolvedValueOnce('builtin');
    await expect(chooseCreateMode()).resolves.toBe('builtin');
  });
  test('returns custom when selected', async () => {
    M.uiMock.inkSelect.mockResolvedValueOnce('custom');
    await expect(chooseCreateMode()).resolves.toBe('custom');
  });
});

describe('pickBuiltinPreset', () => {
  test('returns { key, preset } from selection', async () => {
    M.uiMock.inkSelect.mockResolvedValueOnce('glm');
    const r = await pickBuiltinPreset();
    expect(r.key).toBe('glm');
    expect(r.preset.label).toBe('GLM');
  });
});

describe('pickPreset', () => {
  test('builtin mode → delegates to pickBuiltinPreset', async () => {
    M.uiMock.inkSelect.mockResolvedValueOnce('builtin').mockResolvedValueOnce('glm');
    const r = await pickPreset();
    expect(r.key).toBe('glm');
    expect(r.preset).toBeTruthy();
  });
  test('custom mode → returns CUSTOM_KEY with null preset', async () => {
    M.uiMock.inkSelect.mockResolvedValueOnce('custom');
    const r = await pickPreset();
    expect(r.key).toBe('__custom__');
    expect(r.preset).toBeNull();
  });
});

describe('providerFormWithPreview', () => {
  test('delegates to runProviderForm with initial + preset', async () => {
    await providerFormWithPreview({ initial: { env: { A: '1' } }, preset: { label: 'p', baseUrl: 'https://x' } });
    expect(M.runProviderForm).toHaveBeenCalledWith({ initial: { env: { A: '1' } }, preset: { label: 'p', baseUrl: 'https://x' } });
  });
  test('defaults initial={} preset=null', async () => {
    await providerFormWithPreview();
    expect(M.runProviderForm).toHaveBeenCalledWith({ initial: {}, preset: null });
  });
});
