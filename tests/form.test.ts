import { describe, test, expect } from 'vitest';
import {
  initState, buildResult, validateState,
  parseBoolEnv, parseNumEnv, parseEffortEnv,
  ALIAS_TIERS, EFFORT_LEVELS,
} from '../src/form.js';
import type { Preset, ProviderSettings } from '../src/types.js';

// ---------- env parsers ----------

describe('parseBoolEnv', () => {
  test('returns default for empty/undefined', () => {
    expect(parseBoolEnv(undefined, true)).toBe(true);
    expect(parseBoolEnv('', false)).toBe(false);
  });
  test('parses truthy values case-insensitively', () => {
    expect(parseBoolEnv('1', false)).toBe(true);
    expect(parseBoolEnv('TRUE', false)).toBe(true);
    expect(parseBoolEnv('true', false)).toBe(true);
  });
  test('parses falsy values', () => {
    expect(parseBoolEnv('0', true)).toBe(false);
    expect(parseBoolEnv('false', true)).toBe(false);
  });
  test('falls back to default on garbage', () => {
    expect(parseBoolEnv('yes', true)).toBe(true);
    expect(parseBoolEnv('yes', false)).toBe(false);
  });
});

describe('parseNumEnv', () => {
  test('returns default for empty/undefined', () => {
    expect(parseNumEnv(undefined, 100)).toBe(100);
    expect(parseNumEnv('', 200)).toBe(200);
  });
  test('parses positive integers', () => {
    expect(parseNumEnv('200000', 0)).toBe(200000);
  });
  test('rejects non-positive / non-integer', () => {
    expect(parseNumEnv('0', 100)).toBe(100);
    expect(parseNumEnv('-5', 100)).toBe(100);
    expect(parseNumEnv('1.5', 100)).toBe(100);
    expect(parseNumEnv('abc', 100)).toBe(100);
  });
});

describe('parseEffortEnv', () => {
  test('returns default for empty/undefined', () => {
    expect(parseEffortEnv(undefined, 'max')).toBe('max');
  });
  test('parses valid effort levels case-insensitively', () => {
    expect(parseEffortEnv('low', 'max')).toBe('low');
    expect(parseEffortEnv('HIGH', 'max')).toBe('high');
    expect(parseEffortEnv('XHigh', 'max')).toBe('xhigh');
  });
  test('rejects invalid → default', () => {
    expect(parseEffortEnv('turbo', 'max')).toBe('max');
  });
  test('all EFFORT_LEVELS are accepted', () => {
    for (const e of EFFORT_LEVELS) {
      expect(parseEffortEnv(e, 'low')).toBe(e);
    }
  });
});

// ---------- initState / buildResult / validateState (the state machine) ----------

const FULL_PRESET: Preset = {
  label: 'Test',
  baseUrl: 'https://api.test.com',
  model: 'test-model',
  models: { opus: 'opus-m', sonnet: 'sonnet-m', haiku: 'haiku-m', fable: 'fable-m' },
  options: { attributionHeader: false, disableNonEssentialTraffic: true, autoCompactWindow: 100000, effort: 'high' },
};

describe('initState', () => {
  test('create from preset → alias mode by default', () => {
    const s = initState({}, FULL_PRESET);
    expect(s.mode).toBe('alias');
    expect(s.baseUrl).toBe('https://api.test.com');
    expect(s.tier).toBe('opus');
    expect(s.options.effort).toBe('high');
    expect(s.options.autoCompactWindow).toBe(100000);
  });

  test('edit existing single-model config → single mode', () => {
    const s = initState({ env: { ANTHROPIC_MODEL: 'single-m' } }, null);
    expect(s.mode).toBe('single');
    expect(s.singleModel).toBe('single-m');
  });

  test('edit existing alias config → alias mode', () => {
    const s = initState({ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm' } }, null);
    expect(s.mode).toBe('alias');
  });

  test('existing key kept when editing', () => {
    const s = initState({ env: { ANTHROPIC_AUTH_TOKEN: 'secret123' } }, null);
    expect(s.existingKey).toBe('secret123');
    expect(s.keepExistingKey).toBe(true);
  });

  test('option priority: existing env > preset.options > defaults', () => {
    const s = initState(
      { env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } },
      { label: 'p', baseUrl: 'https://x', options: { effort: 'high' } },
    );
    expect(s.options.effort).toBe('low');
  });

  test('aliases prefilled from preset.models', () => {
    const s = initState({}, FULL_PRESET);
    expect(s.aliases.OPUS).toBe('opus-m');
    expect(s.aliases.FABLE).toBe('fable-m');
  });
});

describe('buildResult', () => {
  test('single mode writes ANTHROPIC_MODEL, no aliases', () => {
    const s = initState({ env: { ANTHROPIC_MODEL: 'm' } }, null);
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_MODEL).toBe('m');
    expect(r.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
    expect(r.model).toBeUndefined();
  });

  test('alias mode writes empty ANTHROPIC_MODEL + all tier aliases + display names', () => {
    const s = initState({}, FULL_PRESET);
    s.tier = 'opus';
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_MODEL).toBe('');
    expect(r.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('opus-m');
    expect(r.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME).toBe('opus-m');
    expect(r.model).toBe('opus');
    // all tiers written (incl empty)
    for (const tier of ALIAS_TIERS) {
      expect(r.env).toHaveProperty(`ANTHROPIC_DEFAULT_${tier}_MODEL`);
    }
  });

  test('alias mode strips [1m] suffix in display name only', () => {
    const s = initState({}, null);
    s.mode = 'alias';
    s.tier = 'opus';
    s.aliases.OPUS = 'glm-5.2[1m]';
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('glm-5.2[1m]');
    expect(r.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME).toBe('glm-5.2');
  });

  test('new api key overrides existing', () => {
    const s = initState({ env: { ANTHROPIC_AUTH_TOKEN: 'old' } }, null);
    s.apiKey = 'newkey';
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_AUTH_TOKEN).toBe('newkey');
  });

  test('keeps existing key when no new key entered', () => {
    const s = initState({ env: { ANTHROPIC_AUTH_TOKEN: 'old' } }, null);
    s.apiKey = '';
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_AUTH_TOKEN).toBe('old');
  });

  test('drops token entirely if not kept and empty', () => {
    const s = initState({}, null);
    s.apiKey = '';
    s.keepExistingKey = false;
    const r = buildResult(s);
    expect(r.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  test('dangerouslySkipPermissions only written when true', () => {
    const s = initState({}, null);
    s.dangerouslySkipPermissions = false;
    expect(buildResult(s).dangerouslySkipPermissions).toBeUndefined();
    s.dangerouslySkipPermissions = true;
    expect(buildResult(s).dangerouslySkipPermissions).toBe(true);
  });

  test('CLAUDE_CODE_* always serialized to env strings', () => {
    const s = initState({}, FULL_PRESET);
    const r: ProviderSettings = buildResult(s);
    expect(r.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe('0');
    expect(r.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(r.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('100000');
    expect(r.env.CLAUDE_CODE_EFFORT_LEVEL).toBe('high');
  });

  test('buildResult is pure — does not mutate input state', () => {
    const s = initState({}, FULL_PRESET);
    const snapshot = JSON.stringify(s);
    buildResult(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('validateState', () => {
  test('requires baseUrl', () => {
    const s = initState({}, null);
    s.baseUrl = '';
    expect(validateState(s)).not.toBeNull();
  });
  test('requires singleModel in single mode', () => {
    const s = initState({}, null);
    s.mode = 'single';
    s.singleModel = '';
    s.baseUrl = 'https://x';
    expect(validateState(s)).not.toBeNull();
  });
  test('passes with valid alias state', () => {
    const s = initState({}, FULL_PRESET);
    expect(validateState(s)).toBeNull();
  });
  test('passes with valid single state', () => {
    const s = initState({ env: { ANTHROPIC_MODEL: 'm' } }, null);
    s.baseUrl = 'https://x';
    expect(validateState(s)).toBeNull();
  });
});
