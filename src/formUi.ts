import { Box, render, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import {
  ALIAS_TIERS,
  buildResult,
  EFFORT_LEVELS,
  initState,
  TIERS,
  validateState,
} from './form.js';
import { t } from './i18n.js';
import { redactSettings } from './launch.js';
import { Cancel } from './tui.js';
import { clearScreen } from './screen.js';
import type { EffortLevel, FormState, Preset, ProviderSettings } from './types.js';

const h = React.createElement;

// ---------- field model ----------

type FieldKind = 'text' | 'password' | 'toggle' | 'select' | 'number' | 'button';
type FieldId =
  | 'baseUrl' | 'token' | 'authMethod' | 'singleModel'
  | `alias_${typeof ALIAS_TIERS[number]}`
  | 'autoCompactWindow' | 'tier' | 'effort' | 'customParams'
  | 'attributionHeader' | 'disableNonEssentialTraffic'
  | 'aliases' | 'nextTab' | 'submit' | 'cancel';

interface Field {
  id: FieldId;
  kind: FieldKind;
  /** 若提供，则该 text 字段聚焦时在下方展开可搜索下拉（输入即过滤）。 */
  support?: string[] | undefined;
}

const TAB_IDS = ['apikey', 'models', 'options', 'review'] as const;
type TabId = typeof TAB_IDS[number];

/** 表单运行态：autoCompactWindow 以字符串编辑，提交时校验/转换。 */
export interface RuntimeForm extends Omit<FormState, 'options'> {
  options: Omit<FormState['options'], 'autoCompactWindow'> & { autoCompactWindow: string };
  /** 供应商支持的模型列表（用于模型字段的内联下拉）。 */
  modelSupport?: string[] | undefined;
}

interface FormState_ {
  tabIndex: number;
  fieldIndex: number;
  cursor: number;
  form: RuntimeForm;
  status: 'editing' | 'done' | 'cancel';
  error: string | null;
  /** 内联下拉选中索引；当前聚焦字段无 support 时为 null。 */
  ac: { index: number } | null;
}

type Action =
  | { type: 'NEXT_TAB' }
  | { type: 'PREV_TAB' }
  | { type: 'NEXT_FIELD' }
  | { type: 'PREV_FIELD' }
  | { type: 'CURSOR_MOVE'; delta: number }
  | { type: 'INSERT'; field: Field; char: string }
  | { type: 'ERASE'; dir: number }
  | { type: 'TOGGLE'; field: Field }
  | { type: 'SELECT_DELTA'; field: Field; delta: number }
  | { type: 'ACTIVATE'; field: Field }
  | { type: 'CANCEL' }
  | { type: 'AC_NEXT' }
  | { type: 'AC_PREV' }
  | { type: 'AC_ACCEPT' };

// ---------- search helpers ----------

function filterModels(all: string[], filter: string): string[] {
  const q = filter.trim().toLowerCase();
  if (!q) return all;
  return all.filter((m) => m.toLowerCase().includes(q));
}

/** 当前聚焦字段是否带可搜索下拉。 */
function fieldHasSupport(field: Field | undefined): field is Field & { support: string[] } {
  return !!field && field.kind === 'text' && !!field.support && field.support.length > 0;
}

// ---------- field value accessors ----------

function getTextValue(form: RuntimeForm, field: Field): string {
  switch (field.id) {
    case 'baseUrl': return form.baseUrl;
    case 'token': return form.apiKey;
    case 'authMethod': return form.authMethod;
    case 'singleModel': return form.singleModel;
    case 'alias_FABLE': return form.aliases.FABLE ?? '';
    case 'alias_OPUS': return form.aliases.OPUS ?? '';
    case 'alias_SONNET': return form.aliases.SONNET ?? '';
    case 'alias_HAIKU': return form.aliases.HAIKU ?? '';
    case 'autoCompactWindow': return String(form.options.autoCompactWindow);
    case 'customParams': return form.customParams;
    default: return '';
  }
}

function setTextValue(form: RuntimeForm, field: Field, v: string): RuntimeForm {
  switch (field.id) {
    case 'baseUrl': return { ...form, baseUrl: v };
    case 'token': return { ...form, apiKey: v, keepExistingKey: v ? false : form.keepExistingKey };
    case 'authMethod': return { ...form, authMethod: v as 'auth_token' | 'api_key' };
    case 'singleModel': return { ...form, singleModel: v };
    case 'alias_FABLE': return { ...form, aliases: { ...form.aliases, FABLE: v } };
    case 'alias_OPUS': return { ...form, aliases: { ...form.aliases, OPUS: v } };
    case 'alias_SONNET': return { ...form, aliases: { ...form.aliases, SONNET: v } };
    case 'alias_HAIKU': return { ...form, aliases: { ...form.aliases, HAIKU: v } };
    case 'autoCompactWindow': return { ...form, options: { ...form.options, autoCompactWindow: v } };
    case 'customParams': return { ...form, customParams: v };
    default: return form;
  }
}

function getBoolValue(form: RuntimeForm, field: Field): boolean {
  if (field.id === 'aliases') return form.mode === 'alias';
  if (field.id === 'attributionHeader') return form.options.attributionHeader;
  if (field.id === 'disableNonEssentialTraffic') return form.options.disableNonEssentialTraffic;
  return false;
}

function setBoolValue(form: RuntimeForm, field: Field): RuntimeForm {
  if (field.id === 'aliases') {
    return { ...form, mode: form.mode === 'alias' ? 'single' : 'alias' };
  }
  if (field.id === 'attributionHeader') {
    return { ...form, options: { ...form.options, attributionHeader: !form.options.attributionHeader } };
  }
  if (field.id === 'disableNonEssentialTraffic') {
    return { ...form, options: { ...form.options, disableNonEssentialTraffic: !form.options.disableNonEssentialTraffic } };
  }
  return form;
}

interface SelectConfig {
  values: readonly string[];
  get: (f: RuntimeForm) => string;
  set: (f: RuntimeForm, v: string) => RuntimeForm;
}

/**
 * select 字段的取值集合与读写器。新增 select 字段在此登记即可，
 * 无需改动 reducer 与渲染逻辑。
 */
function selectConfig(fieldId: FieldId): SelectConfig | null {
  if (fieldId === 'authMethod') {
    return {
      values: ['auth_token', 'api_key'] as const,
      get: (f) => f.authMethod,
      set: (f, v) => ({ ...f, authMethod: v as 'auth_token' | 'api_key' }),
    };
  }
  if (fieldId === 'tier') {
    return {
      values: TIERS.map((x) => x.value),
      get: (f) => f.tier,
      set: (f, v) => ({ ...f, tier: v }),
    };
  }
  if (fieldId === 'effort') {
    return {
      values: EFFORT_LEVELS,
      get: (f) => f.options.effort,
      set: (f, v) => ({ ...f, options: { ...f.options, effort: v as EffortLevel } }),
    };
  }
  return null;
}

// ---------- text editing helpers ----------

function insertAt(s: string, idx: number, ch: string): string { return s.slice(0, idx) + ch + s.slice(idx); }
function eraseBack(s: string, idx: number): string { return idx > 0 ? s.slice(0, idx - 1) + s.slice(idx) : s; }
function eraseFwd(s: string, idx: number): string { return idx < s.length ? s.slice(0, idx) + s.slice(idx + 1) : s; }

// ---------- labels ----------

function fieldLabel(field: Field): string {
  switch (field.id) {
    case 'baseUrl': return t('form.fBaseUrl');
    case 'authMethod': return t('form.fAuthMethod');
    case 'token': return t('form.fToken');
    case 'aliases': return t('form.fAliases');
    case 'singleModel': return t('form.fModel');
    case 'tier': return t('form.fTier');
    case 'alias_FABLE': return t('form.fAliasShort', { tier: 'FABLE' });
    case 'alias_OPUS': return t('form.fAliasShort', { tier: 'OPUS' });
    case 'alias_SONNET': return t('form.fAliasShort', { tier: 'SONNET' });
    case 'alias_HAIKU': return t('form.fAliasShort', { tier: 'HAIKU' });
    case 'attributionHeader': return t('form.fAttr');
    case 'disableNonEssentialTraffic': return t('form.fNonEss');
    case 'effort': return t('form.fEffort');
    case 'autoCompactWindow': return t('form.fAutoCompact');
    case 'customParams': return t('form.fCustomParams');
    case 'submit': return t('tab.submit');
    case 'cancel': return t('tab.cancel');
    case 'nextTab': return t('tab.next');
    default: return field.id;
  }
}

function tabLabel(id: TabId): string {
  if (id === 'review') return t('tab.review');
  return t(`tab.${id}`);
}

// ---------- tabFields ----------

/** 当前 tab 的可聚焦字段列表（review 的 preview 是静态展示，不参与聚焦）。 */
export function tabFields(form: RuntimeForm, tabIndex: number): Field[] {
  const id = TAB_IDS[tabIndex];
  if (id === undefined) return [];
  if (id === 'apikey') {
    return [
      { id: 'baseUrl', kind: 'text' },
      { id: 'authMethod', kind: 'select' },
      { id: 'token', kind: 'password' },
      { id: 'nextTab', kind: 'button' },
    ];
  }
  if (id === 'models') {
    const base: Field[] = [{ id: 'aliases', kind: 'toggle' }];
    if (form.mode === 'single') {
      return [
        ...base,
        { id: 'singleModel', kind: 'text', support: form.modelSupport },
        { id: 'nextTab', kind: 'button' },
      ];
    }
    return [
      ...base,
      { id: 'tier', kind: 'select' },
      ...ALIAS_TIERS.map((tier): Field => ({
        id: `alias_${tier}`,
        kind: 'text',
        support: form.modelSupport,
      })),
      { id: 'nextTab', kind: 'button' },
    ];
  }
  if (id === 'options') {
    return [
      { id: 'attributionHeader', kind: 'toggle' },
      { id: 'disableNonEssentialTraffic', kind: 'toggle' },
      { id: 'effort', kind: 'select' },
      { id: 'autoCompactWindow', kind: 'number' },
      { id: 'customParams', kind: 'text' },
      { id: 'nextTab', kind: 'button' },
    ];
  }
  // review
  return [
    { id: 'submit', kind: 'button' },
    { id: 'cancel', kind: 'button' },
  ];
}

function isTextKind(kind: FieldKind): boolean {
  return kind === 'text' || kind === 'password' || kind === 'number';
}

// ---------- reducer ----------

function init(form: RuntimeForm): FormState_ {
  return withAc(sanitize({ tabIndex: 0, fieldIndex: 0, cursor: 0, form, status: 'editing', error: null, ac: null }), true);
}

/** 夹紧 fieldIndex、并在聚焦到文本字段时把光标置到末尾。 */
function sanitize(s: FormState_): FormState_ {
  const fs = tabFields(s.form, s.tabIndex);
  let fi = s.fieldIndex;
  if (fi < 0) fi = 0;
  if (fs.length && fi >= fs.length) fi = fs.length - 1;
  if (!fs.length) fi = 0;
  const f = fs[fi];
  const cursor = f && isTextKind(f.kind) ? (getTextValue(s.form, f) || '').length : 0;
  return { ...s, fieldIndex: fi, cursor };
}

/**
 * 同步内联下拉状态：聚焦字段带 support 时打开（reset=true 重置到首条），
 * 否则关闭。filter 始终取字段当前文本值，故无需单独存储。
 */
function withAc(s: FormState_, reset: boolean): FormState_ {
  const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
  if (!fieldHasSupport(f)) return { ...s, ac: null };
  const filtered = filterModels(f.support, getTextValue(s.form, f));
  let index = reset ? 0 : (s.ac ? s.ac.index : 0);
  if (filtered.length > 0) {
    if (index > filtered.length - 1) index = filtered.length - 1;
    if (index < 0) index = 0;
  } else {
    index = 0;
  }
  return { ...s, ac: { index } };
}

function reduce(state: FormState_, action: Action): FormState_ {
  const next = reduceRaw(state, action);
  // AC 导航保留已算好的 index（仅夹紧）；其余动作重新同步（聚焦/文本变化时重置到首条）。
  return action.type === 'AC_NEXT' || action.type === 'AC_PREV'
    ? withAc(next, false)
    : withAc(next, true);
}

function reduceRaw(state: FormState_, action: Action): FormState_ {
  const s = state;
  switch (action.type) {
    case 'NEXT_TAB':
      return sanitize({ ...s, tabIndex: (s.tabIndex + 1) % TAB_IDS.length, fieldIndex: 0, error: null });
    case 'PREV_TAB':
      return sanitize({ ...s, tabIndex: (s.tabIndex + TAB_IDS.length - 1) % TAB_IDS.length, fieldIndex: 0, error: null });
    case 'NEXT_FIELD': {
      const fs = tabFields(s.form, s.tabIndex);
      return sanitize({ ...s, fieldIndex: (s.fieldIndex + 1) % fs.length, error: null });
    }
    case 'PREV_FIELD': {
      const fs = tabFields(s.form, s.tabIndex);
      return sanitize({ ...s, fieldIndex: (s.fieldIndex + fs.length - 1) % fs.length, error: null });
    }
    case 'CURSOR_MOVE': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      if (!f || !isTextKind(f.kind)) return s;
      const len = (getTextValue(s.form, f) || '').length;
      return { ...s, cursor: Math.max(0, Math.min(s.cursor + action.delta, len)) };
    }
    case 'INSERT': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      if (!f || !isTextKind(f.kind)) return s;
      const v = getTextValue(s.form, f) || '';
      const nv = insertAt(v, s.cursor, action.char);
      return { ...s, form: setTextValue(s.form, f, nv), cursor: s.cursor + 1, error: null };
    }
    case 'ERASE': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      if (!f || !isTextKind(f.kind)) return s;
      const v = getTextValue(s.form, f) || '';
      if (action.dir < 0) {
        if (s.cursor <= 0) return s;
        return { ...s, form: setTextValue(s.form, f, eraseBack(v, s.cursor)), cursor: s.cursor - 1 };
      }
      if (s.cursor >= v.length) return s;
      return { ...s, form: setTextValue(s.form, f, eraseFwd(v, s.cursor)) };
    }
    case 'TOGGLE':
      return sanitize({ ...s, form: setBoolValue(s.form, action.field), error: null });
    case 'SELECT_DELTA': {
      const cfg = selectConfig(action.field.id);
      if (!cfg) return s;
      const arr = cfg.values;
      const i = arr.indexOf(cfg.get(s.form));
      const ni = (i + action.delta + arr.length) % arr.length;
      const nv = arr[ni];
      if (nv === undefined) return s;
      return { ...s, form: cfg.set(s.form, nv), error: null };
    }
    case 'AC_NEXT': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      const fs = tabFields(s.form, s.tabIndex);
      if (!f) return s;
      const filtered = filterModels(f.support || [], getTextValue(s.form, f));
      const cur = s.ac ? s.ac.index : 0;
      // 无候选项 或 已到末条 → 跳到下一字段
      if (!filtered.length || cur >= filtered.length - 1) {
        return sanitize({ ...s, fieldIndex: (s.fieldIndex + 1) % fs.length, ac: { index: 0 }, error: null });
      }
      return { ...s, ac: { index: cur + 1 } };
    }
    case 'AC_PREV': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      const fs = tabFields(s.form, s.tabIndex);
      if (!f) return s;
      const filtered = filterModels(f.support || [], getTextValue(s.form, f));
      const cur = s.ac ? s.ac.index : 0;
      // 无候选项 或 已到首条 → 跳到上一字段
      if (!filtered.length || cur <= 0) {
        return sanitize({ ...s, fieldIndex: (s.fieldIndex + fs.length - 1) % fs.length, ac: { index: 0 }, error: null });
      }
      return { ...s, ac: { index: cur - 1 } };
    }
    case 'AC_ACCEPT': {
      const f = tabFields(s.form, s.tabIndex)[s.fieldIndex];
      const fs = tabFields(s.form, s.tabIndex);
      if (f) {
        const filtered = filterModels(f.support || [], getTextValue(s.form, f));
        const cur = s.ac ? s.ac.index : 0;
        const item = filtered[cur];
        // 有高亮候选 → 填回字段值
        if (item) {
          const nf = setTextValue(s.form, f, item);
          return sanitize({ ...s, form: nf, fieldIndex: (s.fieldIndex + 1) % fs.length, cursor: (getTextValue(nf, f) || '').length, error: null });
        }
      }
      // 无候选 → 保留已输入文本，跳到下一字段
      return sanitize({ ...s, fieldIndex: (s.fieldIndex + 1) % fs.length, error: null });
    }
    case 'ACTIVATE': {
      if (action.field.id === 'cancel') return { ...s, status: 'cancel' };
      if (action.field.id === 'nextTab') {
        return sanitize({ ...s, tabIndex: (s.tabIndex + 1) % TAB_IDS.length, fieldIndex: 0, error: null });
      }
      if (action.field.id === 'submit') {
        const err = validateForSubmit(s.form);
        if (err) return { ...s, error: err };
        return { ...s, status: 'done', error: null };
      }
      return s;
    }
    case 'CANCEL':
      return { ...s, status: 'cancel' };
    default:
      return s;
  }
}

/** 把运行态表单转回标准 FormState（autoCompactWindow 转数字）。 */
function toFormState(form: RuntimeForm): FormState {
  const { autoCompactWindow, ...restOptions } = form.options;
  return {
    ...form,
    options: { ...restOptions, autoCompactWindow: Number(autoCompactWindow) || 0 },
  };
}

function validateForSubmit(form: RuntimeForm): string | null {
  const e = validateState(toFormState(form));
  if (e) return e;
  const ac = String(form.options.autoCompactWindow).trim();
  if (!/^\d+$/.test(ac) || Number(ac) <= 0) return t('form.autoCompactValidate');
  return null;
}

// ---------- rendering ----------

interface FieldRowProps {
  field: Field;
  form: RuntimeForm;
  focused: boolean;
  cursor: number;
  blinkOn: boolean;
  /** 聚焦字段的下拉选中索引；非聚焦字段传 null。 */
  acIndex: number | null;
}

function FieldRow({ field, form, focused, cursor, blinkOn, acIndex }: FieldRowProps): React.ReactNode {
  const prefix = focused ? h(Text, { color: 'cyan' }, '▸ ') : h(Text, null, '  ');

  if (field.kind === 'text' || field.kind === 'password' || field.kind === 'number') {
    const raw = getTextValue(form, field) || '';
    const disp = field.kind === 'password' ? '*'.repeat(raw.length) : raw;
    const keptHint = field.kind === 'password' && form.existingKey && !raw
      ? h(Text, { dimColor: true }, '  ' + t('form.fTokenKept'))
      : null;
    const label = h(Text, null, fieldLabel(field) + ': ');

    // text 且有 support：提示内联下拉的用法
    const hasSupport = field.kind === 'text' && !!field.support && field.support.length > 0;
    const acHint = hasSupport
      ? h(Text, { dimColor: true }, '  ' + t('form.acHint'))
      : null;

    const renderText = () => {
      if (!focused) {
        return h(Text, null, prefix, label, h(Text, null, disp), keptHint, acHint);
      }
      // 闪烁的细竖线光标：blinkOn 时显示 ▏（遮住光标位字符），否则正常显示该字符。
      const cur = Math.min(cursor, disp.length);
      const charAt = disp.slice(cur, cur + 1);
      const cursorNode = blinkOn
        ? h(Text, { color: 'cyan' }, '▏')
        : h(Text, null, charAt || ' ');
      return h(Text, null,
        prefix,
        label,
        h(Text, { color: 'cyan' }, disp.slice(0, cur)),
        cursorNode,
        h(Text, { color: 'cyan' }, disp.slice(cur + 1)),
        keptHint,
        acHint,
      );
    };

    // 聚焦且带 support：在输入框下方展开内联下拉
    if (focused && hasSupport && acIndex !== null) {
      return h(Box, { flexDirection: 'column' },
        renderText(),
        h(ModelDropdown, { field, form, acIndex }),
      );
    }
    return renderText();
  }

  if (field.kind === 'toggle') {
    const on = getBoolValue(form, field);
    // 只用 ✓/✗，不留空，避免「空」的歧义。
    return h(Text, null,
      prefix,
      h(Text, on ? { color: 'green' } : {}, on ? '[✓]' : '[✗]'),
      ' ',
      fieldLabel(field),
    );
  }

  if (field.kind === 'select') {
    // 左右不再改值，仅用空格循环切换；去掉 ◀▶ 以免误导。
    const cfg = selectConfig(field.id);
    const val = cfg ? cfg.get(form) : '';
    return h(Text, null,
      prefix,
      fieldLabel(field),
      ': ',
      h(Text, { color: 'cyan' }, val),
      ' ',
      h(Text, { dimColor: true }, t('form.spaceHint')),
    );
  }

  // button
  return h(Text, focused ? { backgroundColor: 'cyan', color: 'black' } : {},
    ` ${fieldLabel(field)} `);
}

interface ModelDropdownProps {
  field: Field;
  form: RuntimeForm;
  acIndex: number;
}

/**
 * 模型字段内联下拉：以字段当前文本为 filter，最多显示 5 条可滚动，
 * 高亮 acIndex。memo 化以隔离光标闪烁导致的父级重渲染（防闪烁）。
 */
const ModelDropdown = React.memo(function ModelDropdown({ field, form, acIndex }: ModelDropdownProps): React.ReactNode {
  const support = field.support || [];
  const filtered = filterModels(support, getTextValue(form, field));
  if (!filtered.length) return null;
  const maxItems = 5;
  const startIdx = Math.max(0, Math.min(acIndex, filtered.length - maxItems));
  const visible = filtered.slice(startIdx, startIdx + maxItems);
  return h(Box, { flexDirection: 'column' },
    ...visible.map((model, i) => {
      const abs = startIdx + i;
      const sel = abs === acIndex;
      return h(Text, sel ? { backgroundColor: 'cyan', color: 'black' } : { dimColor: true },
        (sel ? '▸ ' : '  ') + model);
    }),
    filtered.length > maxItems
      ? h(Text, { dimColor: true }, `  (${startIdx + 1}-${startIdx + visible.length}/${filtered.length})`)
      : null,
  );
});

interface ReviewBodyProps {
  form: RuntimeForm;
  state: FormState_;
  blinkOn: boolean;
}

function ReviewBody({ form, state, blinkOn }: ReviewBodyProps): React.ReactNode {
  const redacted = JSON.stringify(redactSettings(buildResult(toFormState(form))), null, 2);
  const fs = tabFields(form, 3); // review
  return h(Box, { flexDirection: 'column' },
    h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', paddingLeft: 1, paddingRight: 1, marginBottom: 1 },
      h(Text, { dimColor: true }, t('tab.previewTitle')),
      h(Text, null, redacted),
    ),
    h(Box, { flexDirection: 'row', gap: 2 },
      h(FieldRow, { field: fs[0]!, form, focused: state.fieldIndex === 0, cursor: state.cursor, blinkOn, acIndex: null }),
      h(FieldRow, { field: fs[1]!, form, focused: state.fieldIndex === 1, cursor: state.cursor, blinkOn, acIndex: null }),
    ),
  );
}

interface FormAppProps {
  initialForm: RuntimeForm;
  title?: string;
  onDone: (form: RuntimeForm) => void;
  onCancel: () => void;
}

function FormApp({ initialForm, title, onDone, onCancel }: FormAppProps): React.ReactNode {
  const [state, dispatch] = useReducer(reduce, initialForm, init);
  const { stdout } = useStdout();
  const cols = stdout && stdout.columns ? stdout.columns : 60;

  // 文本字段光标闪烁；移动光标/切字段时立即重显示。
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlinkOn((b) => !b), 530);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setBlinkOn(true); }, [state.cursor, state.fieldIndex, state.tabIndex]);

  useEffect(() => {
    if (state.status === 'done') onDone(state.form);
    else if (state.status === 'cancel') onCancel();
  }, [state.status]);

  useInput((input, key) => {
    if (state.status !== 'editing') return;
    if (key.escape) { dispatch({ type: 'CANCEL' }); return; }

    const field = tabFields(state.form, state.tabIndex)[state.fieldIndex];
    if (!field) return;

    const hasSupport = field.kind === 'text' && !!field.support && field.support.length > 0;

    // Tab = 切换 tab（模型字段已内联下拉，不再用单独覆盖层）
    if (key.tab) { dispatch({ type: key.shift ? 'PREV_TAB' : 'NEXT_TAB' }); return; }

    if (key.return) {
      if (field.kind === 'button') dispatch({ type: 'ACTIVATE', field });
      else if (hasSupport) dispatch({ type: 'AC_ACCEPT' });
      else dispatch({ type: 'NEXT_FIELD' });
      return;
    }

    if (isTextKind(field.kind)) {
      // 文本字段内：左右 = 光标移动。
      if (key.leftArrow) { dispatch({ type: 'CURSOR_MOVE', delta: -1 }); return; }
      if (key.rightArrow) { dispatch({ type: 'CURSOR_MOVE', delta: 1 }); return; }
      // ink 把 \x7f（Linux/WSL 的 Backspace 键）映射成 key.delete 而非 key.backspace，
      // 且无法与真正的 Delete 键区分。两者都按「向后删除」处理，否则光标在末尾时退格无效。
      if (key.backspace || key.delete) { dispatch({ type: 'ERASE', dir: -1 }); return; }
      // 模型字段：上下导航内联下拉（到底/到顶则继续切字段）；普通文本字段：上下切字段。
      if (hasSupport) {
        if (key.upArrow) { dispatch({ type: 'AC_PREV' }); return; }
        if (key.downArrow) { dispatch({ type: 'AC_NEXT' }); return; }
      } else {
        if (key.upArrow) { dispatch({ type: 'PREV_FIELD' }); return; }
        if (key.downArrow) { dispatch({ type: 'NEXT_FIELD' }); return; }
      }
      // ink 可能把快速连按的多个字符合并成一次 input（如 "abc"），逐字符处理。
      if (input && !key.ctrl && !key.meta) {
        for (const ch of input) {
          if (ch.charCodeAt(0) < 32) continue;
          if (field.kind === 'number' && !/^\d$/.test(ch)) continue;
          dispatch({ type: 'INSERT', field, char: ch });
        }
      }
      return;
    }

    // 非文本字段：上下/左右用于切换字段（review 的提交/取消按钮横向排列时尤其有用）。
    if (key.upArrow) { dispatch({ type: 'PREV_FIELD' }); return; }
    if (key.downArrow) { dispatch({ type: 'NEXT_FIELD' }); return; }
    if (key.leftArrow) { dispatch({ type: 'PREV_FIELD' }); return; }
    if (key.rightArrow) { dispatch({ type: 'NEXT_FIELD' }); return; }

    // 'n' 快捷键：跳到下一个 tab（review 是最后一个，不往后切）。
    if (input === 'n' && TAB_IDS[state.tabIndex] !== 'review') {
      dispatch({ type: 'NEXT_TAB' });
      return;
    }

    // 选值只通过空格切换，避免左右改值与「横向切字段」语义冲突。
    if (field.kind === 'toggle') {
      if (input === ' ') dispatch({ type: 'TOGGLE', field });
      return;
    }

    if (field.kind === 'select') {
      if (input === ' ') dispatch({ type: 'SELECT_DELTA', field, delta: 1 });
      return;
    }
  });

  const tabId = TAB_IDS[state.tabIndex];
  // memo 化字段列表：blink 仅改 blinkOn（不在 reducer state 内），form/tabIndex 不变时
  // 返回同一组 field 引用，使 ModelDropdown 的 memo 生效，避免下拉随光标闪烁重绘。
  const fields = useMemo(() => tabFields(state.form, state.tabIndex), [state.form, state.tabIndex]);
  const acIndex = state.ac ? state.ac.index : null;

  return h(Box, { flexDirection: 'column' },
    title ? h(Text, { color: 'cyan', bold: true }, title) : null,
    // tab bar
    h(Box, { flexDirection: 'row', gap: 1 },
      ...TAB_IDS.map((id, i) => {
        const active = i === state.tabIndex;
        return h(Text, active ? { backgroundColor: 'cyan', color: 'black' } : { dimColor: true },
          ` ${tabLabel(id)} `);
      }),
    ),
    h(Text, { dimColor: true }, '─'.repeat(Math.min(cols, 64))),

    // content
    h(Box, { flexDirection: 'column' },
      tabId === 'review'
        ? h(ReviewBody, { form: state.form, state, blinkOn })
        : h(Box, { flexDirection: 'column' },
            ...fields.map((f, i) => h(FieldRow, {
              key: f.id, field: f, form: state.form, focused: i === state.fieldIndex, cursor: state.cursor, blinkOn,
              acIndex: i === state.fieldIndex ? acIndex : null,
            })),
          ),
    ),

    // footer
    h(Text, { dimColor: true }, t('form.help')),
    state.error ? h(Text, { color: 'red' }, '✗ ' + state.error) : null,
  );
}

// ---------- entry ----------

interface RunOpts {
  initial?: { env?: Record<string, string>; model?: string };
  preset?: Preset | null;
  title?: string;
}

export function runProviderForm(opts: RunOpts = {}): Promise<ProviderSettings> {
  const { initial = {}, preset = null, title } = opts;
  const base = initState(initial, preset);
  // 携带供应商支持的模型列表（用于模型字段内联下拉）。
  const modelSupport = preset?.model?.support;
  // autoCompactWindow 以字符串形式编辑，提交时再校验/转换。
  const initialForm: RuntimeForm = {
    ...base,
    modelSupport,
    options: { ...base.options, autoCompactWindow: String(base.options.autoCompactWindow) },
  };
  return new Promise<ProviderSettings>((resolve, reject) => {
    let inst: ReturnType<typeof render>;
    const onDone = (form: RuntimeForm) => { inst.unmount(); resolve(buildResult(toFormState(form))); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    const props: FormAppProps = { initialForm, onDone, onCancel };
    if (title !== undefined) props.title = title;
    clearScreen();
    inst = render(h(FormApp, props));
  });
}
