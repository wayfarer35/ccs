import { describe, test, expect, vi } from 'vitest';

// 固定 provider/preset 集，保证候选生成测试确定性。
vi.mock('../src/config.js', () => ({
  listProviders: () => ['deepseek-api', 'myprov'],
  providerExists: () => false,
  providerFile: () => '',
  readProvider: () => null,
  writeJSON: () => undefined,
  removeProvider: () => undefined,
  getLastUsed: () => null,
  writeFileSyncSafe: () => undefined,
  CLAUDE_SETTINGS_FILE: '',
}));
vi.mock('../src/presets.js', () => ({
  presetList: () => [
    { key: 'ark-coding-plan', label: 'Ark', baseUrl: 'u' },
    { key: 'deepseek-api', label: 'DeepSeek', baseUrl: 'u' },
  ],
}));

import {
  completeCandidates, bashCompletionScript, zshCompletionScript,
  completionScript, completionHelp, SUPPORTED_SHELLS,
} from '../src/completion.js';

const SUBCOMMANDS = ['list', 'ls', 'presets', 'create', 'edit', 'remove', 'rm', 'common', 'show', 'config', 'use'];
const FLAGS = ['-h', '--help', '-v', '--version'];

describe('completeCandidates — first positional word', () => {
  test("[] / [''] → subcommands + providers + flags", () => {
    expect(completeCandidates([])).toEqual([...SUBCOMMANDS, 'deepseek-api', 'myprov', ...FLAGS]);
    expect(completeCandidates([''])).toEqual([...SUBCOMMANDS, 'deepseek-api', 'myprov', ...FLAGS]);
  });

  test("['de'] → prefix-filtered (providers + subcommands)", () => {
    const got = completeCandidates(['de']);
    expect(got).toEqual(['deepseek-api']); // 子命令无 de 前缀；provider 有
  });

  test("['--'] → flags only", () => {
    expect(completeCandidates(['--'])).toEqual(['--help', '--version']);
  });
});

describe('completeCandidates — provider-arg commands', () => {
  for (const cmd of ['show', 'edit', 'remove', 'rm']) {
    test(`${cmd} <Tab> → provider names`, () => {
      expect(completeCandidates([cmd, ''])).toEqual(['deepseek-api', 'myprov']);
    });
    test(`${cmd} my<Tab> → prefix-filtered providers`, () => {
      expect(completeCandidates([cmd, 'my'])).toEqual(['myprov']);
    });
  }
});

describe('completeCandidates — create', () => {
  test("create <Tab> → preset keys", () => {
    expect(completeCandidates(['create', ''])).toEqual(['ark-coding-plan', 'deepseek-api']);
  });
  test("create ar<Tab> → prefix-filtered preset keys", () => {
    expect(completeCandidates(['create', 'ar'])).toEqual(['ark-coding-plan']);
  });
});

describe('completeCandidates — config', () => {
  test("config <Tab> → ['locale']", () => {
    expect(completeCandidates(['config', ''])).toEqual(['locale']);
  });
  test("config locale <Tab> → ['en','zh-CN']", () => {
    expect(completeCandidates(['config', 'locale', ''])).toEqual(['en', 'zh-CN']);
  });
  test("config locale zh<Tab> → ['zh-CN']", () => {
    expect(completeCandidates(['config', 'locale', 'zh'])).toEqual(['zh-CN']);
  });
});

describe('completeCandidates — no completion', () => {
  test("use <Tab> → [] (passthrough args)", () => {
    expect(completeCandidates(['use', ''])).toEqual([]);
  });
  test("list <Tab> → [] (no positional)", () => {
    expect(completeCandidates(['list', ''])).toEqual([]);
  });
  test("show foo bar <Tab> → [] (beyond first arg)", () => {
    expect(completeCandidates(['show', 'foo', 'bar', ''])).toEqual([]);
  });
  test("config locale en <Tab> → [] (beyond locale value)", () => {
    expect(completeCandidates(['config', 'locale', 'en', ''])).toEqual([]);
  });
});

describe('completion scripts', () => {
  test('bash script references __complete and registers complete -F', () => {
    expect(bashCompletionScript).toContain('ccs __complete');
    expect(bashCompletionScript).toContain('complete -F _ccs_bash_complete ccs');
    expect(bashCompletionScript).toContain('command -v ccs'); // 降级守卫
  });
  test('zsh script references __complete and registers compdef', () => {
    expect(zshCompletionScript).toContain('ccs __complete');
    expect(zshCompletionScript).toContain('compdef _ccs_zsh_complete ccs');
    expect(zshCompletionScript).toContain('command -v ccs');
  });
  test('completionScript returns script for supported shells, null otherwise', () => {
    expect(completionScript('bash')).toBe(bashCompletionScript);
    expect(completionScript('zsh')).toBe(zshCompletionScript);
    expect(completionScript('fish')).toBeNull();
  });
});

describe('completionHelp', () => {
  test('no arg → usage text', () => {
    expect(completionHelp()).toContain('Usage: ccs completion <shell>');
    expect(completionHelp()).toContain('bash');
  });
  test('unsupported shell → unsupported text', () => {
    expect(completionHelp('fish')).toContain('Unsupported shell: fish');
  });
  test('SUPPORTED_SHELLS is bash+zsh', () => {
    expect([...SUPPORTED_SHELLS]).toEqual(['bash', 'zsh']);
  });
});
