import { describe, test, expect } from 'vitest';
import { getPresets, getPreset, presetList, loadBuiltinPresets, CUSTOM_KEY } from '../src/presets.js';

describe('presets', () => {
  test('builtin presets load with expected shape', () => {
    const all = loadBuiltinPresets();
    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const [key, p] of Object.entries(all)) {
      expect(typeof p.label).toBe('string');
      expect(typeof p.baseUrl).toBe('string');
    }
  });

  test('getPresets merges builtin + user (no throw)', () => {
    const all = getPresets();
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  test('getPreset returns null for CUSTOM_KEY / empty', () => {
    expect(getPreset(CUSTOM_KEY)).toBeNull();
    expect(getPreset('')).toBeNull();
  });

  test('getPreset returns the preset for a known key', () => {
    const all = getPresets();
    const firstKey = Object.keys(all)[0]!;
    expect(getPreset(firstKey)).toEqual(all[firstKey]);
  });

  test('getPreset returns null for unknown key', () => {
    expect(getPreset('__definitely_not_a_preset__')).toBeNull();
  });

  test('presetList returns array with key + preset fields', () => {
    const list = presetList();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('key');
    expect(list[0]).toHaveProperty('label');
    expect(list[0]).toHaveProperty('baseUrl');
  });
});
