import { describe, test, expect, vi, beforeEach } from 'vitest';

// 测 main() 的 argv 分发与 printHelp/version 分支
const M = vi.hoisted(() => ({
  uiMock: {
    intro: vi.fn(), outro: vi.fn(), cancel: vi.fn(), note: vi.fn(),
    log: { message: vi.fn(), info: vi.fn(), step: vi.fn(), warning: vi.fn(), error: vi.fn() },
    select: vi.fn(), confirm: vi.fn(), text: vi.fn(), password: vi.fn(),
  },
  launchMock: {
    launch: vi.fn(), dryRun: vi.fn(), launchDefault: vi.fn(), dryRunDefault: vi.fn(),
    buildProviderSettings: vi.fn(() => ({ env: {} })), redactSettings: vi.fn((o: unknown) => o),
  },
  formMock: {
    providerFormWithPreview: vi.fn(async () => ({ env: {} })),
    chooseCreateMode: vi.fn(), pickBuiltinPreset: vi.fn(),
  },
}));

vi.mock('../src/tui.js', () => ({
  ui: M.uiMock,
  Cancel: class Cancel extends Error { constructor() { super('cancel'); this.name = 'Cancel'; } },
  clack: {},
}));
vi.mock('../src/launch.js', () => M.launchMock);
vi.mock('../src/form.js', () => M.formMock);

import { main, printHelp } from '../src/cli.js';

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 use 菜单选 default 避免交互卡住
  M.uiMock.select.mockResolvedValue({ kind: 'default' });
});

async function runMain(args: string[]) {
  const orig = process.argv;
  process.argv = ['node', 'ccs', ...args];
  try { await main(); } finally { process.argv = orig; }
}

describe('main argv dispatch', () => {
  test('-h/--help/help → printHelp', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runMain(['--help']);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test('-v/--version → prints version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runMain(['--version']);
    expect(log).toHaveBeenCalledWith('0.1.0');
    log.mockRestore();
  });

  test('list / ls → cmdList', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runMain(['list']);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test('presets → cmdPresets', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runMain(['presets']);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test('<name> → cmdLaunch', async () => {
    await runMain(['myprov', '--print', 'hi']);
    expect(M.launchMock.launch).toHaveBeenCalledWith('myprov', ['--print', 'hi']);
  });

  test('<name> --dry-run → dryRun', async () => {
    await runMain(['myprov', '--dry-run']);
    expect(M.launchMock.dryRun).toHaveBeenCalledWith('myprov', []);
  });

  test('bare flag (e.g. --foo) → treated as use <args>', async () => {
    await runMain(['--dangerously-skip-permissions']);
    // use 菜单选 default → launchDefault
    expect(M.launchMock.launchDefault).toHaveBeenCalledWith(['--dangerously-skip-permissions']);
  });

  test('no args → cmdUse', async () => {
    await runMain([]);
    expect(M.launchMock.launchDefault).toHaveBeenCalled();
  });
});

describe('printHelp', () => {
  test('prints help text', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printHelp();
    expect(log).toHaveBeenCalled();
    const text = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(text).toContain('ccs');
    expect(text).toContain('Usage') ;
    log.mockRestore();
  });
});
