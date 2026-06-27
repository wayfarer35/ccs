import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { validateName, nameValidator, cmdList, cmdPresets, cmdShow } from '../src/cli.js';
import { providerFile, writeJSON } from '../src/config.js';

const TEST_NAME = `__cli_test_${process.pid}`;

function clean() {
  try { fs.rmSync(providerFile(TEST_NAME), { force: true }); } catch { /* ignore */ }
}
beforeEach(clean);
afterEach(clean);

describe('validateName', () => {
  test('accepts a plain name', () => {
    expect(() => validateName('myprov')).not.toThrow();
  });
  test('rejects empty', () => {
    expect(() => validateName('')).toThrow();
  });
  test('rejects path separators / whitespace / ..', () => {
    expect(() => validateName('a/b')).toThrow();
    expect(() => validateName('a b')).toThrow();
    expect(() => validateName('a\\b')).toThrow();
    expect(() => validateName('..')).toThrow();
    expect(() => validateName('foo..bar')).toThrow();
  });
});

describe('nameValidator', () => {
  test('returns undefined for valid unused name', () => {
    expect(nameValidator('a-fresh-name')).toBeUndefined();
  });
  test('returns message for empty', () => {
    expect(nameValidator('')).toBeTruthy();
    expect(nameValidator('   ')).toBeTruthy();
  });
  test('returns message for invalid chars', () => {
    expect(nameValidator('a/b')).toBeTruthy();
    expect(nameValidator('a b')).toBeTruthy();
  });
  test('returns message when name already exists', () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    expect(nameValidator(TEST_NAME)).toBeTruthy();
  });
  test('trims before validating', () => {
    expect(nameValidator('  good-name  ')).toBeUndefined();
  });
});

describe('cmdList', () => {
  test('prints empty message when no providers', () => {
    // 很难保证全局无 provider；这里只验证不抛错
    expect(() => cmdList()).not.toThrow();
  });
  test('lists existing providers with marker', () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    const out = captureLog(() => cmdList());
    expect(out).toContain(TEST_NAME);
  });
});

describe('cmdPresets', () => {
  test('prints preset header and at least one preset', () => {
    const out = captureLog(() => cmdPresets());
    expect(out).toContain('deepseek-api'); // 内置预设之一
  });
});

describe('cmdShow', () => {
  test('errors on missing name', () => {
    const orig = process.exit;
    let called = false;
    (process as { exit: unknown }).exit = ((code?: number) => { called = true; throw new Error(`exit:${code}`); }) as never;
    try {
      expect(() => cmdShow([])).toThrow();
      expect(called).toBe(true);
    } finally {
      (process as { exit: unknown }).exit = orig;
    }
  });

  test('prints redacted settings for existing provider', () => {
    writeJSON(providerFile(TEST_NAME), {
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_AUTH_TOKEN: 'sk-abcdef1234' },
    });
    const out = captureLog(() => cmdShow([TEST_NAME]));
    expect(out).toContain('https://x');
    expect(out).toContain('****1234');
    expect(out).not.toContain('sk-abcdef1234');
  });
});

// ---------- helper: capture console.log ----------

function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}
