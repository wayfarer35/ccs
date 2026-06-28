import { Box, render, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';
import { t } from './i18n.js';
import { Cancel } from './tui.js';

const h = React.createElement;

// ink 搜索选择器。两个版块：
//   - items：可过滤、可滚动（默认最多 maxItems 行），打字即时过滤
//   - actions：固定在下方，永不过滤、永不隐藏（功能菜单）
// 单一光标贯穿两区，↑↓ 选择、Enter 确认、Esc 取消（抛 Cancel）。
// 因 ink TUI 难以单测，本文件排除出覆盖率统计（同 formUi.ts）。

/** picker 的一项。 */
export interface PickerItem<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface PickerOpts<T> {
  message: string;
  /** 可过滤、可滚动的列表（如供应商配置）。 */
  items: ReadonlyArray<PickerItem<T>>;
  /** 固定在下方、不过滤的操作项（如 direct/create/edit/remove）。 */
  actions?: ReadonlyArray<PickerItem<T>>;
  /** 初始高亮项（按值相等定位）。 */
  initialValue?: T;
  /** items 区最多可见行数，默认 5。 */
  maxItems?: number;
}

interface PickerAppProps<T> {
  message: string;
  items: PickerItem<T>[];
  actions: PickerItem<T>[];
  initialIndex: number;
  maxItems: number;
  onDone: (v: T) => void;
  onCancel: () => void;
}

function PickerApp<T>({ message, items, actions, initialIndex, maxItems, onDone, onCancel }: PickerAppProps<T>): React.ReactNode {
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState(initialIndex);
  const { stdout } = useStdout();
  const cols = stdout && stdout.columns ? stdout.columns : 60;

  // items 区按 label+hint 大小写不敏感包含匹配；actions 区不过滤。
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.hint ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  // 合并可见列表：过滤后的 items ++ 全部 actions（单一光标贯穿）。
  const combined = useMemo(() => [...filtered, ...actions], [filtered, actions]);

  // 光标闪烁
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlinkOn((b) => !b), 530);
    return () => clearInterval(id);
  }, []);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) {
      const it = combined[Math.min(index, combined.length - 1)];
      if (it) onDone(it.value);
      return;
    }
    if (key.upArrow) { setIndex((i) => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setIndex((i) => Math.min(combined.length - 1, i + 1)); return; }
    // ink 把 \x7f（Linux/WSL 的 Backspace）映射成 key.delete；与 Delete 一并按退格处理。
    // 打字/退格只影响 filter（仅过滤 items 区）；光标重置到首位（标准 fuzzy 行为）。
    if (key.backspace || key.delete) { setFilter((f) => f.slice(0, -1)); setIndex(0); return; }
    if (input && !key.ctrl && !key.meta) {
      let s = '';
      for (const ch of input) { if (ch.charCodeAt(0) >= 32) s += ch; }
      if (s) { setFilter((f) => f + s); setIndex(0); }
    }
  });

  const safeIndex = combined.length ? Math.min(index, combined.length - 1) : 0;

  // items 区滚动窗口：仅在 items 区滚动，actions 区始终全部显示。
  const cursorInItems = safeIndex < filtered.length;
  let startIdx = 0;
  if (filtered.length > maxItems) {
    if (cursorInItems) {
      startIdx = Math.max(0, Math.min(safeIndex - Math.floor(maxItems / 2), filtered.length - maxItems));
    } else {
      // 光标在 actions 区 → 显示 items 区最后一页，紧接 actions。
      startIdx = Math.max(0, filtered.length - maxItems);
    }
  }
  const visibleFiltered = filtered.slice(startIdx, startIdx + maxItems);

  const renderRow = (it: PickerItem<T>, abs: number, sel: boolean) => {
    const style = sel ? { backgroundColor: 'cyan' as const, color: 'black' as const } : {};
    return h(Box, { key: abs, flexDirection: 'row' },
      h(Text, style, `${sel ? '▸ ' : '  '}${it.label}`),
      it.hint
        ? h(Text, sel ? { backgroundColor: 'cyan', color: 'black' } : { dimColor: true }, `  ${it.hint}`)
        : null,
    );
  };

  const hasItems = items.length > 0;

  return h(Box, { flexDirection: 'column' },
    h(Text, { color: 'cyan', bold: true }, message),
    h(Text, { dimColor: true }, '─'.repeat(Math.min(cols, 64))),

    // 过滤输入框：仅当存在可过滤的 items 时显示。
    hasItems
      ? h(Box, { flexDirection: 'row' },
          h(Text, { color: 'cyan' }, '▸ '),
          filter
            ? h(Text, { color: 'cyan' }, filter)
            : h(Text, { dimColor: true }, t('picker.placeholder')),
          h(Text, { color: 'cyan' }, blinkOn ? '▏' : ' '),
        )
      : null,

    // items 区（可过滤、可滚动）
    hasItems
      ? h(Box, { flexDirection: 'column' },
          h(Text, { dimColor: true }, t('picker.providers', { count: filtered.length })),
          visibleFiltered.length
            ? visibleFiltered.map((it, i) => renderRow(it, startIdx + i, startIdx + i === safeIndex))
            : h(Text, { dimColor: true }, '  ' + t('picker.noMatch')),
          filtered.length > maxItems
            ? h(Text, { dimColor: true }, `  (${startIdx + 1}-${startIdx + visibleFiltered.length}/${filtered.length})`)
            : null,
        )
      : null,

    // actions 区（固定、不过滤）
    actions.length
      ? h(Box, { flexDirection: 'column' },
          h(Text, { dimColor: true }, t('picker.actions')),
          ...actions.map((it, i) => renderRow(it, filtered.length + i, filtered.length + i === safeIndex)),
        )
      : null,

    h(Text, { dimColor: true }, t('picker.help')),
  );
}

/**
 * 搜索选择器（ink）：items 区可过滤可滚动，actions 区固定不过滤。
 * ↑↓ 选择、Enter 确认、Esc 取消（抛 Cancel）。
 */
export async function runPicker<T>(opts: PickerOpts<T>): Promise<T> {
  const { message, items, actions = [], initialValue, maxItems = 5 } = opts;
  const arr = [...items];
  const act = [...actions];
  const combined = [...arr, ...act];
  let initialIndex = 0;
  if (initialValue !== undefined) {
    const i = combined.findIndex((it) => it.value === initialValue);
    if (i >= 0) initialIndex = i;
  }
  return new Promise<T>((resolve, reject) => {
    let inst: ReturnType<typeof render>;
    const onDone = (v: T) => { inst.unmount(); resolve(v); };
    const onCancel = () => { inst.unmount(); reject(new Cancel()); };
    // 泛型函数组件在 createElement 处无法推断 T，显式具化后再渲染。
    const App = PickerApp as unknown as (props: PickerAppProps<T>) => React.ReactNode;
    inst = render(h(App, { message, items: arr, actions: act, initialIndex, maxItems, onDone, onCancel }));
  });
}
