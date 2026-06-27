import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVersion } from '../src/version.js';

// 单一真源：getVersion() 必须等于 package.json 的 version。
const pkgVersion = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;

describe('getVersion', () => {
  test('returns the package.json version (walks up from module dir)', () => {
    // 首次调用：src/ 下无 package.json → ENOENT → 向上一级命中仓库根
    expect(getVersion()).toBe(pkgVersion);
  });

  test('hits the module cache on repeat calls', () => {
    // 第二次调用走 if (cached) 分支
    expect(getVersion()).toBe(pkgVersion);
  });

  test('matches a \\d+.\\d+.\\d+ shape', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('getVersion fallback', () => {
  test("returns '0.0.0' when no package.json has a string version", async () => {
    // 用全新模块实例 + mocked fs 模拟「找不到 string version」：
    // 覆盖 typeof !== 'string'、parent === dir break、兜底 '0.0.0' 三条分支。
    vi.resetModules();
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return { ...actual, readFileSync: () => '{}' }; // 无 version 字段
    });
    const mod = await import('../src/version.js');
    expect(mod.getVersion()).toBe('0.0.0');
    vi.doUnmock('node:fs');
    vi.resetModules();
  });
});
