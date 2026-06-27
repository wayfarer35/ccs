import { describe, test, expect } from 'vitest';
import { Cancel, clack } from '../src/tui.js';

describe('Cancel', () => {
  test('is an Error with name Cancel', () => {
    const c = new Cancel();
    expect(c).toBeInstanceOf(Error);
    expect(c.name).toBe('Cancel');
    expect(c.message).toBe('cancel');
  });
});

describe('clack re-export', () => {
  test('clack is the @clack/prompts namespace', () => {
    expect(clack).toBeTruthy();
    expect(typeof clack.select).toBe('function');
    expect(typeof clack.isCancel).toBe('function');
  });
});
