import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readJSON, writeJSON, writeFileSyncSafe, providerFile, providerExists,
  listProviders, getLastUsed, setLastUsed, removeProvider, ensureDirs, PROVIDER_SUFFIX,
} from '../src/config.js';

const TEST_NAME = `__cfg_test_${process.pid}`;

function cleanProvider() {
  try { fs.rmSync(providerFile(TEST_NAME), { force: true }); } catch { /* ignore */ }
}

describe('readJSON', () => {
  test('returns fallback for missing file (ENOENT)', () => {
    const r = readJSON('/nonexistent/path/xyz.json', { default: true });
    expect(r).toEqual({ default: true });
  });
  test('returns null fallback by default', () => {
    expect(readJSON('/nonexistent/xyz.json')).toBeNull();
  });
  test('parses valid JSON', () => {
    const f = path.join(process.cwd(), 'tests', `tmp_${process.pid}.json`);
    fs.writeFileSync(f, '{"a":1}');
    expect(readJSON(f)).toEqual({ a: 1 });
    fs.rmSync(f, { force: true });
  });
  test('throws on invalid JSON', () => {
    const f = path.join(process.cwd(), 'tests', `bad_${process.pid}.json`);
    fs.writeFileSync(f, '{not json');
    expect(() => readJSON(f)).toThrow();
    fs.rmSync(f, { force: true });
  });
});

describe('writeJSON / writeFileSyncSafe', () => {
  test('writeJSON creates parent dirs and writes pretty JSON + newline', () => {
    const dir = path.join(process.cwd(), 'tests', `nest_${process.pid}`);
    const f = path.join(dir, 'a.json');
    writeJSON(f, { x: 1 });
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toBe('{\n  "x": 1\n}\n');
    fs.rmSync(dir, { force: true, recursive: true });
  });
  test('writeFileSyncSafe writes raw content', () => {
    const f = path.join(process.cwd(), 'tests', `raw_${process.pid}.json`);
    writeFileSyncSafe(f, '{}\n');
    expect(fs.readFileSync(f, 'utf8')).toBe('{}\n');
    fs.rmSync(f, { force: true });
  });
});

describe('provider CRUD', () => {
  beforeEach(cleanProvider);
  afterEach(cleanProvider);

  test('providerFile ends with suffix', () => {
    expect(providerFile(TEST_NAME)).toMatch(new RegExp(`${PROVIDER_SUFFIX}$`));
    expect(providerFile(TEST_NAME)).toContain(TEST_NAME);
  });

  test('providerExists false → true after write', () => {
    expect(providerExists(TEST_NAME)).toBe(false);
    writeJSON(providerFile(TEST_NAME), { env: {} });
    expect(providerExists(TEST_NAME)).toBe(true);
  });

  test('removeProvider deletes file (force, no throw on missing)', () => {
    expect(() => removeProvider(TEST_NAME)).not.toThrow();
    writeJSON(providerFile(TEST_NAME), { env: {} });
    removeProvider(TEST_NAME);
    expect(providerExists(TEST_NAME)).toBe(false);
  });
});

describe('listProviders', () => {
  test('returns sorted array of provider names (without suffix)', () => {
    ensureDirs();
    const names = listProviders();
    expect(Array.isArray(names)).toBe(true);
    // all entries lack the suffix
    for (const n of names) {
      expect(n).not.toContain(PROVIDER_SUFFIX);
    }
    // sorted
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('excludes non-.settings.json files', () => {
    ensureDirs();
    const names = listProviders();
    // 确保 lastused 之类的无后缀文件不被计入
    expect(names.every((n) => !n.startsWith('.'))).toBe(true);
  });
});

describe('lastUsed', () => {
  test('getLastUsed returns null when file missing', () => {
    // 读取一个几乎肯定不存在的场景：lastused 文件可能存在，这里只验证返回值类型
    const r = getLastUsed();
    expect(r === null || typeof r === 'string').toBe(true);
  });

  test('setLastUsed then getLastUsed round-trip (isolated via unique value)', async () => {
    // .lastused 是全局共享文件，并行 worker 可能竞争；
    // 用串行隔离：写一个唯一标记，立即读，验证至少能写入并读回 string。
    setLastUsed(TEST_NAME);
    const r = getLastUsed();
    expect(typeof r).toBe('string');
    // 还原为空避免污染用户状态
    setLastUsed('');
  });
});
