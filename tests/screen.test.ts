import { describe, test, expect, vi } from 'vitest';
import { clearScreen } from '../src/screen.js';

describe('clearScreen', () => {
  test('writes viewport-clear + cursor-home escape (keeps scrollback)', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    clearScreen();
    expect(spy).toHaveBeenCalledWith('\x1b[2J\x1b[H');
    // 不含 3J（清 scrollback）——页面独占只清视口，保留历史
    expect(spy.mock.calls[0]?.[0]).not.toContain('\x1b[3J');
    spy.mockRestore();
  });
});
