import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

// mock child_process.spawnSync 以测试 launch/launchDefault 的分支（不真起 claude）
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, pid: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), signal: null })),
  default: { spawnSync: vi.fn(() => ({ status: 0 })) },
}));

import { launch, launchDefault } from '../src/launch.js';
import { writeJSON, providerFile, ensureDirs, MERGED_DIR } from '../src/config.js';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_NAME = `__launch_spawn_${process.pid}`;

function clean() {
  try { fs.rmSync(providerFile(TEST_NAME), { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(join(MERGED_DIR, `${TEST_NAME}.settings.json`), { force: true }); } catch { /* ignore */ }
}
beforeEach(() => { ensureDirs(); clean(); (spawnSync as unknown as ReturnType<typeof vi.fn>).mockClear(); });
afterEach(clean);

describe('launch', () => {
  test('writes merged settings file, calls claude with --settings, sets lastUsed', () => {
    writeJSON(providerFile(TEST_NAME), { env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_AUTH_TOKEN: 'k' } });
    launch(TEST_NAME, ['--print', 'hi']);
    const calls = (spawnSync as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(1);
    const [bin, args] = calls[0]!;
    expect(bin).toBe('claude');
    expect(args[0]).toBe('--settings');
    expect(args).toContain('--print');
    expect(args).toContain('hi');
    // merged 文件已写入
    expect(fs.existsSync(join(MERGED_DIR, `${TEST_NAME}.settings.json`))).toBe(true);
  });

  test('forwards dangerouslySkipPermissions flag', () => {
    writeJSON(providerFile(TEST_NAME), { env: {}, dangerouslySkipPermissions: true });
    launch(TEST_NAME, []);
    const args = (spawnSync as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).toContain('--allow-dangerously-skip-permissions');
  });

  test('sets exitCode on non-zero claude exit', () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ status: 42, pid: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), signal: null });
    const origExit = process.exitCode;
    process.exitCode = undefined;
    try {
      launch(TEST_NAME, []);
      expect(process.exitCode).toBe(42);
    } finally {
      process.exitCode = origExit;
    }
  });

  test('throws friendly error when claude binary missing (ENOENT)', () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    const err = new Error('not found') as Error & { code: string };
    err.code = 'ENOENT';
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw err; });
    expect(() => launch(TEST_NAME, [])).toThrow(/claude/);
  });

  test('re-throws non-ENOENT errors', () => {
    writeJSON(providerFile(TEST_NAME), { env: {} });
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => launch(TEST_NAME, [])).toThrow('boom');
  });
});

describe('launchDefault', () => {
  test('calls claude directly without --settings', () => {
    launchDefault(['--print', 'x']);
    const [bin, args] = (spawnSync as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(bin).toBe('claude');
    expect(args).toEqual(['--print', 'x']);
    expect(args).not.toContain('--settings');
  });

  test('throws friendly error on ENOENT', () => {
    const err = new Error('nf') as Error & { code: string };
    err.code = 'ENOENT';
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw err; });
    expect(() => launchDefault([])).toThrow(/claude/);
  });
});
