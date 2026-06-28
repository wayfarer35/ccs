import { runPicker } from './picker.js';
import { inkSelect, inkText, inkConfirm } from './inkPrompts.js';

/** 用户取消时抛出，由顶层捕获统一退出。 */
export class Cancel extends Error {
  constructor() { super('cancel'); this.name = 'Cancel'; }
}

// 交互层完全由 ink 承担（runPicker / inkSelect / inkText / inkConfirm / 表单）。
// 此处仅保留 ui 表面：cancel/log 走纯 console（不进 raw mode），其余交互一律 ink。
export const ui = {
  /** 取消提示（如顶层 Cancel 兜底）。纯 console 输出一行。 */
  cancel: (t: string) => console.log(t),
  log: {
    message: (t: string) => console.log(t),
    info: (t: string) => console.info(t),
    step: (t: string) => console.log(t),
    warning: (t: string) => console.warn(t),
    error: (t: string) => console.error(t),
  },
  /** 搜索选择器（ink）：输入过滤 + 可滚动下拉。 */
  picker: runPicker,
  /** ink 版 select/text/confirm：交互提示一律用 ink。 */
  inkSelect,
  inkText,
  inkConfirm,
};

export type { PickerItem, PickerOpts } from './picker.js';
