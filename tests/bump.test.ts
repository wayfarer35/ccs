import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BUMP = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'git-hooks', 'bump.mjs');

// ---------- 纯函数 ----------

describe('bumpVersion', () => {
  test('patch bumps third segment and carries (0.1.9 → 0.1.10)', async () => {
    const { bumpVersion } = await import('../scripts/git-hooks/bump.mjs');
    expect(bumpVersion('0.1.9', 'patch')).toBe('0.1.10');
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1');
  });

  test('minor bumps second segment and resets patch (0.1.9 → 0.2.0)', async () => {
    const { bumpVersion } = await import('../scripts/git-hooks/bump.mjs');
    expect(bumpVersion('0.1.9', 'minor')).toBe('0.2.0');
    expect(bumpVersion('0.1.0', 'minor')).toBe('0.2.0');
    expect(bumpVersion('1.9.9', 'minor')).toBe('1.10.0');
  });

  test('strips prerelease/build metadata before bumping', async () => {
    const { bumpVersion } = await import('../scripts/git-hooks/bump.mjs');
    expect(bumpVersion('0.1.0-rc.1', 'patch')).toBe('0.1.1');
  });

  test('throws on invalid version', async () => {
    const { bumpVersion } = await import('../scripts/git-hooks/bump.mjs');
    expect(() => bumpVersion('not-a-version', 'patch')).toThrow(/invalid version/);
    expect(() => bumpVersion('1.2', 'patch')).toThrow(/invalid version/);
  });

  test("throws on 'major' (never auto-bumped by hook)", async () => {
    const { bumpVersion } = await import('../scripts/git-hooks/bump.mjs');
    expect(() => bumpVersion('0.1.0', 'major')).toThrow(/unsupported kind/);
  });
});

describe('parseBumpKind', () => {
  test('fix: / fix(scope): → patch', async () => {
    const { parseBumpKind } = await import('../scripts/git-hooks/bump.mjs');
    expect(parseBumpKind('fix: x')).toBe('patch');
    expect(parseBumpKind('fix(api): x')).toBe('patch');
    expect(parseBumpKind('  fix: x')).toBe('patch'); // 前导空白
    expect(parseBumpKind('FIX: x')).toBe('patch'); // 大小写不敏感
    expect(parseBumpKind('fix(scope): x')).toBe('patch');
  });

  test('其它前缀 / 无前缀 → minor', async () => {
    const { parseBumpKind } = await import('../scripts/git-hooks/bump.mjs');
    expect(parseBumpKind('feat: x')).toBe('minor');
    expect(parseBumpKind('chore: x')).toBe('minor');
    expect(parseBumpKind('docs: x')).toBe('minor');
    expect(parseBumpKind('refactor: x')).toBe('minor');
    expect(parseBumpKind('plain message')).toBe('minor');
    expect(parseBumpKind('')).toBe('minor');
    expect(parseBumpKind('fixiate: x')).toBe('minor'); // 非 fix 前缀
  });
});

// ---------- 集成：临时 git repo 跑 bump.mjs 主流程 ----------

let repo: string | null = null;

afterEach(() => {
  if (repo) { rmSync(repo, { recursive: true, force: true }); repo = null; }
});

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ccs-bump-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t.com', { cwd: dir });
  execSync('git config user.name T', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  writePkg(dir, '0.1.0');
  execSync('git add package.json', { cwd: dir });
  execSync('git commit -q -m init', { cwd: dir });
  repo = dir;
  return dir;
}

function writePkg(dir: string, version: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't', version }, null, 2) + '\n');
}

function readPkgVersion(dir: string): string {
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}

function writeMsg(dir: string, text: string): string {
  const f = join(dir, 'MSG');
  writeFileSync(f, text);
  return f;
}

function runBump(dir: string, msgFile: string, source: string | undefined, env: Record<string, string> = {}): void {
  const args = [BUMP, msgFile];
  if (source !== undefined) args.push(source);
  const res = spawnSync('node', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`bump.mjs failed (exit ${res.status}):\nstderr: ${res.stderr}\nstdout: ${res.stdout}`);
}

function stagedFiles(dir: string): string {
  return execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf8' }).trim();
}

describe('bump.mjs main (integration)', () => {
  test('fix: → patch+1 and stages package.json', () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix: a bug\n\nbody');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.1.1');
    expect(stagedFiles(dir)).toBe('package.json');
  });

  test('feat: → minor+1, patch reset, stages package.json', () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'feat: new thing');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.2.0');
    expect(stagedFiles(dir)).toBe('package.json');
  });

  test('fix(scope): → patch+1', () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix(api): scope bug');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.1.1');
  });

  test('patch carry: 0.1.9 --fix:--> 0.1.10', () => {
    const dir = newRepo();
    writePkg(dir, '0.1.9');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m bump', { cwd: dir });
    const msg = writeMsg(dir, 'fix: carry');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.1.10');
  });

  test('minor carry: 0.1.9 --feat:--> 0.2.0', () => {
    const dir = newRepo();
    writePkg(dir, '0.1.9');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m bump', { cwd: dir });
    const msg = writeMsg(dir, 'feat: carry');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.2.0');
  });

  test("source='commit' (amend) → no bump", () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix: should not bump');
    runBump(dir, msg, 'commit');
    expect(readPkgVersion(dir)).toBe('0.1.0');
    expect(stagedFiles(dir)).toBe('');
  });

  test("source='merge' → no bump", () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix: merge msg');
    runBump(dir, msg, 'merge');
    expect(readPkgVersion(dir)).toBe('0.1.0');
  });

  test("source='squash' → no bump", () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix: squash');
    runBump(dir, msg, 'squash');
    expect(readPkgVersion(dir)).toBe('0.1.0');
  });

  test('CCS_NO_BUMP=1 → no bump', () => {
    const dir = newRepo();
    const msg = writeMsg(dir, 'fix: nope');
    runBump(dir, msg, 'message', { CCS_NO_BUMP: '1' });
    expect(readPkgVersion(dir)).toBe('0.1.0');
  });

  test('CHERRY_PICK_HEAD present → no bump', () => {
    const dir = newRepo();
    writeFileSync(join(dir, '.git', 'CHERRY_PICK_HEAD'), 'deadbeef\n');
    const msg = writeMsg(dir, 'fix: cherry');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.1.0');
  });

  test('manually staged version change → respected, no bump', () => {
    const dir = newRepo();
    // 手动改 version 行并 stage
    writePkg(dir, '0.5.0');
    execSync('git add package.json', { cwd: dir });
    const msg = writeMsg(dir, 'fix: manual version');
    runBump(dir, msg, 'message');
    expect(readPkgVersion(dir)).toBe('0.5.0'); // 尊重手动值
  });
});
