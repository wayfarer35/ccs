import { Box, render, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useState } from 'react';
import { Cancel } from './tui.js';

const h = React.createElement;

// ink 版基础提示：select / text / confirm。
// 存在原因：ink（picker/表单）卸载后紧接 clack 提示会因 termios 交接损坏
// （clack 的 setRawMode 与 ink 残留状态冲突），故 picker 之后的提示一律用 ink。
// 因 ink TUI 难以单测，本文件排除出覆盖率统计（同 picker.ts/formUi.ts）。

export interface InkSelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface InkSelectParams<T> {
  message: string;
  options: ReadonlyArray<InkSelectOption<T>>;
  initialValue?: T;
}

export interface InkTextParams {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string) => string | Error | undefined;
}

export interface InkConfirmParams {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
}

// ---------- shared helpers ----------

function insertAt(s: string, idx: number, ch: string): string { return s.slice(0, idx) + ch + s.slice(idx); }
function eraseBack(s: string, idx: number): string { return idx > 0 ? s.slice(0, idx - 1) + s.slice(idx) : s; }

function useBlink(deps: unknown[]): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((b) => !b), 530);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setOn(true); }, deps);
  return on;
}

// ---------- inkSelect ----------

function SelectApp<T>({ message, options, initialIndex, onDone, onCancel }: {
  message: string; options: InkSelectOption<T>[]; initialIndex: number;
  onDone: (v: T) => void; onCancel: () => void;
}): React.ReactNode {
  const [index, setIndex] = useState(initialIndex);
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return || input === ' ') { onDone(options[index]!.value); return; }
    if (key.upArrow) { setIndex((i) => (i - 1 + options.length) % options.length); return; }
    if (key.downArrow) { setIndex((i) => (i + 1) % options.length); return; }
  });
  return h(Box, { flexDirection: 'column' },
    h(Text, { color: 'cyan', bold: true }, message),
    ...options.map((opt, i) => {
      const sel = i === index;
      const style = sel ? { backgroundColor: 'cyan' as const, color: 'black' as const } : {};
      return h(Box, { key: i, flexDirection: 'row' },
        h(Text, style, `${sel ? '▸ ' : '  '}${opt.label}`),
        opt.hint ? h(Text, sel ? { backgroundColor: 'cyan', color: 'black' } : { dimColor: true }, `  ${opt.hint}`) : null,
      );
    }),
    h(Text, { dimColor: true }, '↑↓=select  Enter=confirm  Esc=cancel'),
  );
}

export async function inkSelect<T>(opts: InkSelectParams<T>): Promise<T> {
  const { message, options } = opts;
  const arr = [...options];
  if (!arr.length) throw new Cancel();
  let initialIndex = 0;
  if (opts.initialValue !== undefined) {
    const i = arr.findIndex((o) => o.value === opts.initialValue);
    if (i >= 0) initialIndex = i;
  }
  return new Promise<T>((resolve, reject) => {
    let inst: ReturnType<typeof render>;
    const onDone = (v: T) => { inst.unmount(); resolve(v); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    const App = SelectApp as unknown as (p: { message: string; options: InkSelectOption<T>[]; initialIndex: number; onDone: (v: T) => void; onCancel: () => void; }) => React.ReactNode;
    inst = render(h(App, { message, options: arr, initialIndex, onDone, onCancel }));
  });
}

// ---------- inkText ----------

function TextApp({ message, placeholder, initial, validate, onDone, onCancel }: {
  message: string; placeholder?: string; initial: string;
  validate?: (v: string) => string | Error | undefined;
  onDone: (v: string) => void; onCancel: () => void;
}): React.ReactNode {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);
  const [error, setError] = useState<string | null>(null);
  const { stdout } = useStdout();
  const cols = stdout && stdout.columns ? stdout.columns : 60;
  const blinkOn = useBlink([cursor]);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) {
      if (validate) {
        const r = validate(value);
        if (typeof r === 'string') { setError(r); return; }
        if (r instanceof Error) { setError(r.message); return; }
      }
      onDone(value); return;
    }
    setError(null);
    if (key.leftArrow) { setCursor((c) => Math.max(0, c - 1)); return; }
    if (key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return; }
    if (key.backspace || key.delete) { setValue((v) => { const nv = eraseBack(v, cursor); setCursor((c) => Math.max(0, c - 1)); return nv; }); return; }
    if (input && !key.ctrl && !key.meta) {
      let s = '';
      for (const ch of input) { if (ch.charCodeAt(0) >= 32) s += ch; }
      if (s) { setValue((v) => insertAt(v, cursor, s)); setCursor((c) => c + s.length); }
    }
  });

  const cur = Math.min(cursor, value.length);
  const charAt = value.slice(cur, cur + 1);
  const cursorNode = blinkOn ? h(Text, { color: 'cyan' }, '▏') : h(Text, null, charAt || ' ');
  return h(Box, { flexDirection: 'column' },
    h(Text, { color: 'cyan', bold: true }, message),
    h(Box, { flexDirection: 'row' },
      value
        ? h(Text, null, h(Text, { color: 'cyan' }, value.slice(0, cur)), cursorNode, h(Text, { color: 'cyan' }, value.slice(cur + 1)))
        : h(Text, { dimColor: true }, placeholder ?? ''),
    ),
    error ? h(Text, { color: 'red' }, '✗ ' + error) : null,
    h(Text, { dimColor: true }, 'type value  Enter=confirm  Esc=cancel'),
  );
}

export async function inkText(opts: InkTextParams): Promise<string> {
  const { message, initialValue = '' } = opts;
  return new Promise<string>((resolve, reject) => {
    let inst: ReturnType<typeof render>;
    const onDone = (v: string) => { inst.unmount(); resolve(v); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    const props: Parameters<typeof TextApp>[0] = { message, initial: initialValue, onDone, onCancel };
    if (opts.placeholder !== undefined) props.placeholder = opts.placeholder;
    if (opts.validate !== undefined) props.validate = opts.validate;
    inst = render(h(TextApp, props));
  });
}

// ---------- inkConfirm ----------

function ConfirmApp({ message, active, inactive, initial, onDone, onCancel }: {
  message: string; active: string; inactive: string; initial: boolean;
  onDone: (v: boolean) => void; onCancel: () => void;
}): React.ReactNode {
  const [val, setVal] = useState(initial);
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) { onDone(val); return; }
    if (key.leftArrow || key.rightArrow || input === ' ' || input === 'y' || input === 'n') {
      if (input === 'y') { setVal(true); return; }
      if (input === 'n') { setVal(false); return; }
      setVal((v) => !v); return;
    }
  });
  return h(Box, { flexDirection: 'column' },
    h(Box, { flexDirection: 'row' },
      h(Text, { color: 'cyan', bold: true }, message + ' '),
      h(Text, val ? { backgroundColor: 'green', color: 'black' } : { dimColor: true }, val ? `[Y] ${active}` : `[ ] ${active}`),
      h(Text, null, '  '),
      h(Text, !val ? { backgroundColor: 'red', color: 'black' } : { dimColor: true }, !val ? `[N] ${inactive}` : `[ ] ${inactive}`),
    ),
    h(Text, { dimColor: true }, 'y/n or ←→=toggle  Enter=confirm  Esc=cancel'),
  );
}

export async function inkConfirm(opts: InkConfirmParams): Promise<boolean> {
  const { message, active = 'Yes', inactive = 'No', initialValue = false } = opts;
  return new Promise<boolean>((resolve, reject) => {
    let inst: ReturnType<typeof render>;
    const onDone = (v: boolean) => { inst.unmount(); resolve(v); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    inst = render(h(ConfirmApp, { message, active, inactive, initial: initialValue, onDone, onCancel }));
  });
}
