import React, { useReducer, useEffect, useState } from 'react';
import { render, Text, Box, useInput, useStdout } from 'ink';
import {
  initState,
  buildResult,
  validateState,
  TIERS,
  ALIAS_TIERS,
  EFFORT_LEVELS,
} from './form.mjs';
import { redactSettings } from './launch.mjs';
import { t } from './i18n.mjs';
import { Cancel } from './tui.mjs';

const h = React.createElement;

// ---------- tabs & field model ----------

const TAB_IDS = ['apikey', 'models', 'options', 'review'];

/** 当前 tab 的可聚焦字段列表（review 的 preview 是静态展示，不参与聚焦）。 */
function tabFields(form, tabIndex) {
  const id = TAB_IDS[tabIndex];
  if (id === 'apikey') {
    return [
      { id: 'baseUrl', kind: 'text' },
      { id: 'token', kind: 'password' },
      { id: 'nextTab', kind: 'button' },
    ];
  }
  if (id === 'models') {
    const base = [{ id: 'aliases', kind: 'toggle' }];
    if (form.mode === 'single') {
      return [...base, { id: 'singleModel', kind: 'text' }, { id: 'nextTab', kind: 'button' }];
    }
    return [
      ...base,
      { id: 'tier', kind: 'select' },
      ...ALIAS_TIERS.map((tier) => ({ id: `alias_${tier}`, kind: 'text' })),
      { id: 'nextTab', kind: 'button' },
    ];
  }
  if (id === 'options') {
    return [
      { id: 'attributionHeader', kind: 'toggle' },
      { id: 'disableNonEssentialTraffic', kind: 'toggle' },
      { id: 'dangerouslySkipPermissions', kind: 'toggle' },
      { id: 'effort', kind: 'select' },
      { id: 'autoCompactWindow', kind: 'number' },
      { id: 'nextTab', kind: 'button' },
    ];
  }
  // review
  return [
    { id: 'submit', kind: 'button' },
    { id: 'cancel', kind: 'button' },
  ];
}

function isTextKind(kind) {
  return kind === 'text' || kind === 'password' || kind === 'number';
}

// ---------- field value accessors ----------

function getTextValue(form, field) {
  switch (field.id) {
    case 'baseUrl': return form.baseUrl;
    case 'token': return form.apiKey;
    case 'singleModel': return form.singleModel;
    case 'alias_FABLE': return form.aliases.FABLE;
    case 'alias_OPUS': return form.aliases.OPUS;
    case 'alias_SONNET': return form.aliases.SONNET;
    case 'alias_HAIKU': return form.aliases.HAIKU;
    case 'autoCompactWindow': return String(form.options.autoCompactWindow);
    default: return '';
  }
}

function setTextValue(form, field, v) {
  switch (field.id) {
    case 'baseUrl': return { ...form, baseUrl: v };
    case 'token': return { ...form, apiKey: v, keepExistingKey: v ? false : form.keepExistingKey };
    case 'singleModel': return { ...form, singleModel: v };
    case 'alias_FABLE': return { ...form, aliases: { ...form.aliases, FABLE: v } };
    case 'alias_OPUS': return { ...form, aliases: { ...form.aliases, OPUS: v } };
    case 'alias_SONNET': return { ...form, aliases: { ...form.aliases, SONNET: v } };
    case 'alias_HAIKU': return { ...form, aliases: { ...form.aliases, HAIKU: v } };
    case 'autoCompactWindow': return { ...form, options: { ...form.options, autoCompactWindow: v } };
    default: return form;
  }
}

function getBoolValue(form, field) {
  if (field.id === 'aliases') return form.mode === 'alias';
  return !!form.options[field.id];
}

function setBoolValue(form, field) {
  if (field.id === 'aliases') {
    return { ...form, mode: form.mode === 'alias' ? 'single' : 'alias' };
  }
  return { ...form, options: { ...form.options, [field.id]: !form.options[field.id] } };
}

/**
 * select 字段的取值集合与读写器。新增 select 字段在此登记即可，
 * 无需改动 reducer 与渲染逻辑。
 */
function selectConfig(fieldId) {
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
      set: (f, v) => ({ ...f, options: { ...f.options, effort: v } }),
    };
  }
  return null;
}

// ---------- text editing helpers ----------

function insertAt(s, idx, ch) { return s.slice(0, idx) + ch + s.slice(idx); }
function eraseBack(s, idx) { return idx > 0 ? s.slice(0, idx - 1) + s.slice(idx) : s; }
function eraseFwd(s, idx) { return idx < s.length ? s.slice(0, idx) + s.slice(idx + 1) : s; }

// ---------- labels ----------

function fieldLabel(field) {
  switch (field.id) {
    case 'baseUrl': return t('form.fBaseUrl');
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
    case 'dangerouslySkipPermissions': return t('form.fDanger');
    case 'effort': return t('form.fEffort');
    case 'autoCompactWindow': return t('form.fAutoCompact');
    case 'submit': return t('tab.submit');
    case 'cancel': return t('tab.cancel');
    case 'nextTab': return t('tab.next');
    default: return field.id;
  }
}

function tabLabel(id) {
  if (id === 'review') return t('tab.review');
  return t(`tab.${id}`);
}

// ---------- reducer ----------

function init(form) {
  return sanitize({ tabIndex: 0, fieldIndex: 0, cursor: 0, form, status: 'editing', error: null });
}

/** 夹紧 fieldIndex、并在聚焦到文本字段时把光标置到末尾。 */
function sanitize(s) {
  const fs = tabFields(s.form, s.tabIndex);
  let fi = s.fieldIndex;
  if (fi < 0) fi = 0;
  if (fs.length && fi >= fs.length) fi = fs.length - 1;
  if (!fs.length) fi = 0;
  const f = fs[fi];
  const cursor = (f && isTextKind(f.kind)) ? (getTextValue(s.form, f) || '').length : 0;
  return { ...s, fieldIndex: fi, cursor };
}

function reduce(state, action) {
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
      return { ...s, form: cfg.set(s.form, arr[ni]), error: null };
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

function validateForSubmit(form) {
  const e = validateState(form);
  if (e) return e;
  const ac = String(form.options.autoCompactWindow).trim();
  if (!/^\d+$/.test(ac) || Number(ac) <= 0) return t('form.autoCompactValidate');
  return null;
}

// ---------- rendering ----------

function FieldRow({ field, form, focused, cursor, blinkOn }) {
  const prefix = focused ? h(Text, { color: 'cyan' }, '▸ ') : h(Text, null, '  ');

  if (field.kind === 'text' || field.kind === 'password' || field.kind === 'number') {
    const raw = getTextValue(form, field) || '';
    const disp = field.kind === 'password' ? '*'.repeat(raw.length) : raw;
    const keptHint = field.kind === 'password' && form.existingKey && !raw
      ? h(Text, { dimColor: true }, '  ' + t('form.fTokenKept'))
      : null;
    const label = h(Text, null, fieldLabel(field) + ': ');
    if (!focused) {
      return h(Text, null, prefix, label, h(Text, null, disp), keptHint);
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
    );
  }

  if (field.kind === 'toggle') {
    const on = getBoolValue(form, field);
    // 只用 ✓/✗，不留空，避免「空」的歧义。
    return h(Text, null,
      prefix,
      h(Text, { color: on ? 'green' : undefined }, on ? '[✓]' : '[✗]'),
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

function ReviewBody({ form, state, blinkOn }) {
  const redacted = JSON.stringify(redactSettings(buildResult(form)), null, 2);
  const fs = tabFields(form, 3); // review
  return h(Box, { flexDirection: 'column' },
    h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', paddingLeft: 1, paddingRight: 1, marginBottom: 1 },
      h(Text, { dimColor: true }, t('tab.previewTitle')),
      h(Text, null, redacted),
    ),
    h(Box, { flexDirection: 'row', gap: 2 },
      h(FieldRow, { field: fs[0], form, focused: state.fieldIndex === 0, cursor: state.cursor, blinkOn }),
      h(FieldRow, { field: fs[1], form, focused: state.fieldIndex === 1, cursor: state.cursor, blinkOn }),
    ),
  );
}

function FormApp({ initialForm, onDone, onCancel }) {
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
    if (key.tab) { dispatch({ type: key.shift ? 'PREV_TAB' : 'NEXT_TAB' }); return; }
    if (key.upArrow) { dispatch({ type: 'PREV_FIELD' }); return; }
    if (key.downArrow) { dispatch({ type: 'NEXT_FIELD' }); return; }

    const field = tabFields(state.form, state.tabIndex)[state.fieldIndex];
    if (!field) return;

    if (key.return) {
      if (field.kind === 'button') dispatch({ type: 'ACTIVATE', field });
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

    // 非文本字段：左右用于横向切换字段（review 的提交/取消按钮横向排列时尤其有用）。
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
  const fields = tabFields(state.form, state.tabIndex);

  return h(Box, { flexDirection: 'column' },
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
            })),
          ),
    ),

    // footer
    h(Text, { dimColor: true }, t('form.help')),
    state.error ? h(Text, { color: 'red' }, '✗ ' + state.error) : null,
  );
}

// ---------- entry ----------

export function runProviderForm({ initial = {}, preset = null } = {}) {
  const base = initState(initial, preset);
  // autoCompactWindow 以字符串形式编辑，提交时再校验/转换。
  const initialForm = {
    ...base,
    options: { ...base.options, autoCompactWindow: String(base.options.autoCompactWindow) },
  };
  return new Promise((resolve, reject) => {
    let inst;
    const onDone = (form) => { inst.unmount(); resolve(buildResult(form)); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    inst = render(h(FormApp, { initialForm, onDone, onCancel }));
  });
}
