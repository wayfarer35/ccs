import { describe, test, expect, vi, beforeEach } from 'vitest';

// 用内存存储隔离 ccs config，避免污染用户真实 ~/.ccs/config.json 且避免并行测试竞争
const { store } = vi.hoisted(() => ({ store: { value: {} as Record<string, unknown> } }));

vi.mock('../src/config.js', () => ({
  CONFIG_FILE: '/tmp/__ccs_i18n_test_config.json',
  readJSON: (_file: string, fallback: unknown = null) => {
    try {
      const raw = store.value['config'];
      return raw === undefined ? fallback : JSON.parse(JSON.stringify(raw));
    } catch { return fallback; }
  },
  writeJSON: (_file: string, obj: unknown) => { store.value['config'] = JSON.parse(JSON.stringify(obj)); },
}));

import { t, detectLocale, getConfig, setConfig, LOCALES } from '../src/i18n.js';

beforeEach(() => { store.value = {}; });

describe('LOCALES', () => {
  test('contains en and zh-CN', () => {
    const vals = LOCALES.map((l) => l.value);
    expect(vals).toContain('en');
    expect(vals).toContain('zh-CN');
  });
});

describe('detectLocale', () => {
  test('config.locale takes priority', () => {
    setConfig({ locale: 'zh-CN' });
    expect(detectLocale()).toBe('zh-CN');
  });

  test('falls back to en when no config and non-zh env', () => {
    const orig = { ...process.env };
    delete process.env.LC_ALL; delete process.env.LC_MESSAGES; process.env.LANG = 'en_US.UTF-8';
    try { expect(detectLocale()).toBe('en'); } finally { process.env = orig; }
  });

  test('zh env → zh-CN', () => {
    const orig = { ...process.env };
    delete process.env.LC_ALL; delete process.env.LC_MESSAGES; process.env.LANG = 'zh_CN.UTF-8';
    try { expect(detectLocale()).toBe('zh-CN'); } finally { process.env = orig; }
  });

  test('LC_ALL takes precedence over LANG', () => {
    const orig = { ...process.env };
    process.env.LC_ALL = 'zh_TW.UTF-8'; process.env.LANG = 'en_US.UTF-8';
    try { expect(detectLocale()).toBe('zh-CN'); } finally { process.env = orig; }
  });
});

describe('t (translation + interpolation)', () => {
  beforeEach(() => setConfig({ locale: 'en' }));

  test('returns key when unknown', () => {
    expect(t('__no_such_key__')).toBe('__no_such_key__');
  });

  test('interpolates {vars}', () => {
    expect(t('error.notFound', { name: 'foo' })).toBe('Not found: foo');
  });

  test('zh-CN translation selected when locale set', () => {
    setConfig({ locale: 'zh-CN' });
    expect(t('error.notFound', { name: 'foo' })).toBe('未找到: foo');
  });

  test('multiple vars interpolated', () => {
    expect(t('error.exists', { name: 'bar' })).toContain('bar');
  });

  test('stringifies numeric vars', () => {
    expect(t('list.summary', { count: 5 })).toContain('5');
  });

  test('falls back to en when locale invalid in config', () => {
    setConfig({ locale: 'klingon' } as never);
    // detectLocale 对不支持的 locale 走 env 回退
    const orig = { ...process.env };
    delete process.env.LC_ALL; delete process.env.LC_MESSAGES; process.env.LANG = 'en_US.UTF-8';
    try { expect(t('error.notFound', { name: 'x' })).toBe('Not found: x'); }
    finally { process.env = orig; }
  });
});

describe('config persistence', () => {
  test('setConfig merges patch', () => {
    setConfig({ locale: 'en' });
    setConfig({} as never);
    expect(getConfig().locale).toBe('en');
  });

  test('getConfig returns empty object when unset', () => {
    expect(getConfig()).toEqual({});
  });
});
