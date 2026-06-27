import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
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
    expect(parseBumpKind('  fix: x')).toBe('patch');
    expect(parseBumpKind('FIX: x')).toBe('patch');
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
    expect(parseBumpKind('fixiate: x')).toBe('minor');
  });
});

// ---------- 集成：临时 git repo 跑 post-commit bump ----------
//
// post-commit hook 在 commit 创建后运行，读 git log -1 message 并 amend version 进本次提交。
// 测试方式：在临时 repo 装好 post-commit hook，做真实 git commit，验证 HEAD 内 version 已 bump。

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

function headVersion(dir: string): string {
  const v = execSync('git show HEAD:package.json', { cwd: dir, encoding: 'utf8' });
  return (JSON.parse(v) as { version: string }).version;
}

function installHook(dir: string): void {
  const hooksDir = join(dir, '.git', 'hooks');
  writeFileSync(join(hooksDir, 'post-commit'), `#!/bin/sh\nexec node "${BUMP}"\n`);
  execSync(`chmod +x ${join(hooksDir, 'post-commit')}`);
}

function commitFile(dir: string, path: string, content: string, message: string, env: Record<string, string> = {}): void {
  writeFileSync(join(dir, path), content);
  execSync(`git add ${path}`, { cwd: dir });
  execSync(`git commit -q -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: dir,
    env: { ...process.env, ...env },
  });
}

describe('bump.mjs main (integration via real git commit)', () => {
  test('fix: → patch+1, version lands in HEAD commit', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'fix: a bug');
    expect(readPkgVersion(dir)).toBe('0.1.1');
    expect(headVersion(dir)).toBe('0.1.1'); // 关键：进了 HEAD
  });

  test('feat: → minor+1, patch reset, lands in HEAD', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'feat: new thing');
    expect(readPkgVersion(dir)).toBe('0.2.0');
    expect(headVersion(dir)).toBe('0.2.0');
  });

  test('fix(scope): → patch+1', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'fix(api): scope bug');
    expect(headVersion(dir)).toBe('0.1.1');
  });

  test('patch carry: 0.1.9 --fix:--> 0.1.10', () => {
    const dir = newRepo();
    writePkg(dir, '0.1.9');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m bump', { cwd: dir });
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'fix: carry');
    expect(headVersion(dir)).toBe('0.1.10');
  });

  test('minor carry: 0.1.9 --feat:--> 0.2.0', () => {
    const dir = newRepo();
    writePkg(dir, '0.1.9');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m bump', { cwd: dir });
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'feat: carry');
    expect(headVersion(dir)).toBe('0.2.0');
  });

  test('CCS_NO_BUMP=1 → no bump', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'fix: nope', { CCS_NO_BUMP: '1' });
    expect(headVersion(dir)).toBe('0.1.0');
  });

  test('manually staged version change → respected, no bump', () => {
    const dir = newRepo();
    installHook(dir);
    writePkg(dir, '0.5.0'); // 手动改 version
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m "fix: manual version"', { cwd: dir });
    expect(headVersion(dir)).toBe('0.5.0'); // 尊重手动值，不再 bump
  });

  test('amend does not double-bump (CCS_BUMPING guard)', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'fix: first'); // → 0.1.1
    expect(headVersion(dir)).toBe('0.1.1');
    // 手动 amend 带 CCS_BUMPING：不应再 bump
    execSync('git commit --amend --no-edit -q', { cwd: dir, env: { ...process.env, CCS_BUMPING: '1' } });
    expect(headVersion(dir)).toBe('0.1.1');
  });

  test('plain message (no prefix) → minor', () => {
    const dir = newRepo();
    installHook(dir);
    commitFile(dir, 'a.txt', 'x', 'just a plain commit');
    expect(headVersion(dir)).toBe('0.2.0');
  });
});
