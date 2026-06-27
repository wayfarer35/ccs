import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const POSTINSTALL = join(process.cwd(), 'scripts', 'postinstall.mjs');
const MARK_BEGIN = '# >>> ccs completion >>>';

let home: string;

function newHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ccs-postinstall-'));
  home = dir;
  return dir;
}

afterEach(() => {
  if (home) { rmSync(home, { recursive: true, force: true }); home = undefined as unknown as string; }
});

// 直接测纯函数 injectCompletionRc
async function importFresh() {
  return import('../scripts/postinstall.mjs');
}

describe('injectCompletionRc', () => {
  beforeEach(() => newHome());

  test('creates rc when absent and injects bash eval block', async () => {
    const { injectCompletionRc } = await importFresh();
    const rc = join(home, '.bashrc');
    const wrote = injectCompletionRc(rc, 'bash');
    expect(wrote).toBe(true);
    const content = readFileSync(rc, 'utf8');
    expect(content).toContain(MARK_BEGIN);
    expect(content).toContain('eval "$(ccs completion bash)"');
    expect(content).toContain('# <<< ccs completion <<<');
  });

  test('appends to existing rc with separating newline', async () => {
    const { injectCompletionRc } = await importFresh();
    const rc = join(home, '.zshrc');
    writeFileSync(rc, 'export FOO=bar\n'); // 末尾已有换行
    injectCompletionRc(rc, 'zsh');
    const content = readFileSync(rc, 'utf8');
    expect(content.startsWith('export FOO=bar\n')).toBe(true);
    expect(content).toContain('eval "$(ccs completion zsh)"');
  });

  test('appends to existing rc missing trailing newline', async () => {
    const { injectCompletionRc } = await importFresh();
    const rc = join(home, '.bashrc');
    writeFileSync(rc, 'export FOO=bar'); // 无尾换行
    injectCompletionRc(rc, 'bash');
    const content = readFileSync(rc, 'utf8');
    expect(content).toContain('bar\n# >>> ccs completion >>>');
  });

  test('idempotent: second call does not duplicate', async () => {
    const { injectCompletionRc } = await importFresh();
    const rc = join(home, '.bashrc');
    injectCompletionRc(rc, 'bash');
    const first = readFileSync(rc, 'utf8');
    const wrote = injectCompletionRc(rc, 'bash');
    expect(wrote).toBe(false);
    expect(readFileSync(rc, 'utf8')).toBe(first);
  });
});

describe('postinstall main — global guard', () => {
  beforeEach(() => newHome());

  test('non-global: does not touch any rc', () => {
    // npm_config_global 未设 → 直接退出，不创建 rc
    execFileSync('node', [POSTINSTALL], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home, npm_config_global: undefined },
      encoding: 'utf8',
    });
    expect(existsSync(join(home, '.bashrc'))).toBe(false);
    expect(existsSync(join(home, '.zshrc'))).toBe(false);
  });

  test('global: writes both rc files', () => {
    const out = execFileSync('node', [POSTINSTALL], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home, npm_config_global: 'true' },
      encoding: 'utf8',
    });
    expect(out).toContain('added completion');
    const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
    const zshrc = readFileSync(join(home, '.zshrc'), 'utf8');
    expect(bashrc).toContain('eval "$(ccs completion bash)"');
    expect(zshrc).toContain('eval "$(ccs completion zsh)"');
  });

  test('global second run: idempotent (skipped)', () => {
    const env = { ...process.env, HOME: home, npm_config_global: 'true' };
    execFileSync('node', [POSTINSTALL], { cwd: process.cwd(), env, encoding: 'utf8' });
    const out = execFileSync('node', [POSTINSTALL], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(out).toContain('already in');
    // 仍只各含一个标记块
    const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
    expect(bashrc.split(MARK_BEGIN).length - 1).toBe(1);
  });
});
