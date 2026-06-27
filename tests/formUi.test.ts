import { describe, test, expect } from 'vitest';
import { tabFields } from '../src/formUi.js';
import { initState } from '../src/form.js';
import type { Preset } from '../src/types.js';
import type { RuntimeForm } from '../src/formUi.js';
// RuntimeForm 未导出——用 initState + string autoCompactWindow 构造

const PRESET: Preset = {
  label: 't', baseUrl: 'https://x',
  options: { attributionHeader: false, disableNonEssentialTraffic: true, autoCompactWindow: 200000, effort: 'max' },
};

// 复刻 runProviderForm 内部对 initState 的字符串化（autoCompactWindow → string）
function makeForm(preset: Preset | null = PRESET, initial: { env?: Record<string, string> } = {}): RuntimeForm {
  const base = initState(initial, preset);
  return { ...base, options: { ...base.options, autoCompactWindow: String(base.options.autoCompactWindow) } } as unknown as RuntimeForm;
}

describe('tabFields', () => {
  test('apikey tab: baseUrl(text) + token(password) + nextTab(button)', () => {
    const f = makeForm();
    const fs = tabFields(f, 0);
    expect(fs.map((x) => x.id)).toEqual(['baseUrl', 'token', 'nextTab']);
    expect(fs[0]!.kind).toBe('text');
    expect(fs[1]!.kind).toBe('password');
    expect(fs[2]!.kind).toBe('button');
  });

  test('models tab in alias mode: aliases + tier + 4 alias fields + nextTab', () => {
    const f = makeForm(); // alias by default
    const fs = tabFields(f, 1);
    const ids = fs.map((x) => x.id);
    expect(ids).toContain('aliases');
    expect(ids).toContain('tier');
    expect(ids).toContain('alias_FABLE');
    expect(ids).toContain('alias_OPUS');
    expect(ids).toContain('alias_SONNET');
    expect(ids).toContain('alias_HAIKU');
    expect(ids[ids.length - 1]).toBe('nextTab');
    expect(fs.find((x) => x.id === 'tier')!.kind).toBe('select');
  });

  test('models tab in single mode: aliases + singleModel + nextTab (no tier/aliases)', () => {
    const f = makeForm(null, { env: { ANTHROPIC_MODEL: 'm' } }); // single mode
    const fs = tabFields(f, 1);
    const ids = fs.map((x) => x.id);
    expect(ids).toEqual(['aliases', 'singleModel', 'nextTab']);
    expect(ids).not.toContain('tier');
  });

  test('options tab: 2 toggles + effort(select) + autoCompact(number) + nextTab', () => {
    const f = makeForm();
    const fs = tabFields(f, 2);
    const ids = fs.map((x) => x.id);
    expect(ids).toEqual([
      'attributionHeader', 'disableNonEssentialTraffic',
      'effort', 'autoCompactWindow', 'nextTab',
    ]);
    expect(fs.find((x) => x.id === 'attributionHeader')!.kind).toBe('toggle');
    expect(fs.find((x) => x.id === 'effort')!.kind).toBe('select');
    expect(fs.find((x) => x.id === 'autoCompactWindow')!.kind).toBe('number');
  });

  test('review tab: submit + cancel buttons only', () => {
    const f = makeForm();
    const fs = tabFields(f, 3);
    expect(fs.map((x) => x.id)).toEqual(['submit', 'cancel']);
    expect(fs.every((x) => x.kind === 'button')).toBe(true);
  });

  test('returns empty for out-of-range tabIndex', () => {
    const f = makeForm();
    expect(tabFields(f, 99)).toEqual([]);
    expect(tabFields(f, -1)).toEqual([]);
  });
});
