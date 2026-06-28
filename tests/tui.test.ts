import { describe, test, expect } from 'vitest';
import { Cancel, ui } from '../src/tui.js';

describe('Cancel', () => {
  test('is an Error with name Cancel', () => {
    const c = new Cancel();
    expect(c).toBeInstanceOf(Error);
    expect(c.name).toBe('Cancel');
    expect(c.message).toBe('cancel');
  });
});

describe('ui surface', () => {
  test('exposes ink prompt helpers and console-backed cancel/log', () => {
    expect(typeof ui.picker).toBe('function');
    expect(typeof ui.inkSelect).toBe('function');
    expect(typeof ui.inkText).toBe('function');
    expect(typeof ui.inkConfirm).toBe('function');
    expect(typeof ui.cancel).toBe('function');
    expect(typeof ui.log.message).toBe('function');
  });

  test('cancel/log do not throw', () => {
    const noop = (): void => {
      ui.cancel('c');
      ui.log.message('m');
      ui.log.info('i');
      ui.log.step('s');
      ui.log.warning('w');
      ui.log.error('e');
    };
    expect(noop).not.toThrow();
  });
});
