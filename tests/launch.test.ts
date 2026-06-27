import { describe, test, expect, afterEach } from 'vitest';
import {
  redactSettings, whichClaude, dryRun, dryRunDefault,
} from '../src/launch.js';
import { writeJSON, providerFile } from '../src/config.js';
import * as fs from 'node:fs';

// 测试用临时 provider，写入真实 ~/.ccs/providers 但用唯一名避免污染
const TEST_NAME = `__ts_refactor_test_${process.pid}`;

function writeTestProvider(obj: unknown) {
  writeJSON(providerFile(TEST_NAME), obj);
}
function cleanup() {
  try { fs.rmSync(providerFile(TEST_NAME), { force: true }); } catch { /* ignore */ }
}

describe('redactSettings', () => {
  test('masks TOKEN/KEY/SECRET/PASSWORD values to last 4', () => {
    const r = redactSettings({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'sk-abcdef1234',
        ANTHROPIC_API_KEY: 'keyXYZ',
        ANTHROPIC_BASE_URL: 'https://api.x.com',
      },
    });
    expect(r.env.ANTHROPIC_AUTH_TOKEN).toBe('****1234');
    expect(r.env.ANTHROPIC_API_KEY).toBe('****yXYZ');
    expect(r.env.ANTHROPIC_BASE_URL).toBe('https://api.x.com');
  });
  test('short values become ****', () => {
    const r = redactSettings({ env: { ANTHROPIC_API_KEY: 'ab' } });
    expect(r.env.ANTHROPIC_API_KEY).toBe('****');
  });
  test('does not mutate input (immutable)', () => {
    const input = { env: { ANTHROPIC_AUTH_TOKEN: 'sk-abcdef1234' } };
    const snapshot = JSON.stringify(input);
    redactSettings(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  test('no env → returns as-is shape', () => {
    const r = redactSettings({ env: {} });
    expect(r.env).toEqual({});
  });
});

// 防止测试遗漏清理导致 ~/.ccs 污染的保险检查
test('cleanup removes test provider file', () => {
  writeTestProvider({ env: {} });
  cleanup();
  expect(fs.existsSync(providerFile(TEST_NAME))).toBe(false);
});

describe('whichClaude', () => {
  test('returns CCS_CLAUDE_BIN when set', () => {
    const orig = process.env.CCS_CLAUDE_BIN;
    process.env.CCS_CLAUDE_BIN = '/custom/claude';
    try { expect(whichClaude()).toBe('/custom/claude'); }
    finally {
      if (orig === undefined) delete process.env.CCS_CLAUDE_BIN;
      else process.env.CCS_CLAUDE_BIN = orig;
    }
  });
  test('defaults to "claude"', () => {
    const orig = process.env.CCS_CLAUDE_BIN;
    delete process.env.CCS_CLAUDE_BIN;
    try { expect(whichClaude()).toBe('claude'); }
    finally {
      if (orig !== undefined) process.env.CCS_CLAUDE_BIN = orig;
    }
  });
});

describe('dryRun / dryRunDefault (no spawn)', () => {
  afterEach(cleanup);

  test('dryRun prints redacted settings + will-run command without launching', () => {
    writeTestProvider({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_AUTH_TOKEN: 'sk-abcdef1234' },
    });
    const out = captureConsole(() => dryRun(TEST_NAME, ['--print', 'hi']));
    expect(out).toContain('https://x');
    expect(out).toContain('****1234');
    expect(out).not.toContain('sk-abcdef1234');
    expect(out).toContain('--settings');
    // --settings 直接指向 provider 配置文件本身（不再写中间文件）
    expect(out).toContain(providerFile(TEST_NAME));
    expect(out).toContain('--print');
    expect(out).toContain('hi');
  });

  test('dryRun throws on missing provider', () => {
    expect(() => dryRun(`__nonexistent_${process.pid}`, [])).toThrow();
  });

  test('dryRunDefault prints default command, no settings file', () => {
    const out = captureConsole(() => dryRunDefault(['--print', 'hi']));
    expect(out).toContain('claude');
    expect(out).toContain('--print');
    expect(out).not.toContain('--settings');
  });
});

// ---------- helper: capture console.log + console.error ----------
function captureConsole(fn: () => void): string {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try { fn(); } finally { console.log = origLog; console.error = origErr; }
  return lines.join('\n');
}
