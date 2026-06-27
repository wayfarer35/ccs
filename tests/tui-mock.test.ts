import { describe, test, expect, vi, beforeEach } from 'vitest';

// ESM 命名空间不可 spyOn，用 vi.mock 整体替换 @clack/prompts
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  logMessage: vi.fn(),
  logInfo: vi.fn(),
  logStep: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  select: mocks.select, confirm: mocks.confirm, text: mocks.text, password: mocks.password, isCancel: mocks.isCancel,
  intro: mocks.intro, outro: mocks.outro, cancel: mocks.cancel, note: mocks.note,
  log: { message: mocks.logMessage, info: mocks.logInfo, step: mocks.logStep, warn: mocks.logWarn, error: mocks.logError },
}));

const { select, confirm, text, password, isCancel, intro, outro, cancel, note,
  logMessage, logInfo, logStep, logWarn, logError } = mocks;

import { ui, Cancel } from '../src/tui.js';

describe('ui.unwrap behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  test('select throws Cancel when clack returns cancel symbol', async () => {
    const cancelSym = Symbol('cancel');
    select.mockResolvedValueOnce(cancelSym);
    isCancel.mockReturnValueOnce(true);
    await expect(ui.select({ message: 'm', options: [{ value: 1 }] })).rejects.toBeInstanceOf(Cancel);
  });

  test('select returns value on normal pick', async () => {
    select.mockResolvedValueOnce('picked');
    isCancel.mockReturnValueOnce(false);
    await expect(ui.select({ message: 'm', options: [{ value: 'picked' }] })).resolves.toBe('picked');
  });

  test('confirm throws Cancel on cancel', async () => {
    confirm.mockResolvedValueOnce(Symbol('c'));
    isCancel.mockReturnValueOnce(true);
    await expect(ui.confirm({ message: 'm' })).rejects.toBeInstanceOf(Cancel);
  });

  test('confirm returns boolean', async () => {
    confirm.mockResolvedValueOnce(true);
    isCancel.mockReturnValueOnce(false);
    await expect(ui.confirm({ message: 'm' })).resolves.toBe(true);
  });

  test('text throws Cancel on cancel', async () => {
    text.mockResolvedValueOnce(Symbol('c'));
    isCancel.mockReturnValueOnce(true);
    await expect(ui.text({ message: 'm' })).rejects.toBeInstanceOf(Cancel);
  });

  test('text returns string', async () => {
    text.mockResolvedValueOnce('hello');
    isCancel.mockReturnValueOnce(false);
    await expect(ui.text({ message: 'm' })).resolves.toBe('hello');
  });

  test('password throws Cancel on cancel', async () => {
    password.mockResolvedValueOnce(Symbol('c'));
    isCancel.mockReturnValueOnce(true);
    await expect(ui.password({ message: 'm' })).rejects.toBeInstanceOf(Cancel);
  });

  test('password returns string', async () => {
    password.mockResolvedValueOnce('secret');
    isCancel.mockReturnValueOnce(false);
    await expect(ui.password({ message: 'm' })).resolves.toBe('secret');
  });
});

describe('ui passthrough helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  test('intro/outro/cancel/note/log.* delegate to clack', () => {
    ui.intro('i'); ui.outro('o'); ui.cancel('c'); ui.note('b', 't');
    ui.log.message('m'); ui.log.info('i'); ui.log.step('s'); ui.log.warning('w'); ui.log.error('e');
    expect(intro).toHaveBeenCalledWith('i');
    expect(outro).toHaveBeenCalledWith('o');
    expect(cancel).toHaveBeenCalledWith('c');
    expect(note).toHaveBeenCalledWith('b', 't');
    expect(logMessage).toHaveBeenCalledWith('m');
    expect(logInfo).toHaveBeenCalledWith('i');
    expect(logStep).toHaveBeenCalledWith('s');
    expect(logWarn).toHaveBeenCalledWith('w');
    expect(logError).toHaveBeenCalledWith('e');
  });
});
