import * as clack from '@clack/prompts';
import { runPicker } from './picker.js';
import { inkSelect, inkText, inkConfirm } from './inkPrompts.js';

/** 用户取消时抛出，由顶层捕获统一退出。 */
export class Cancel extends Error {
  constructor() { super('cancel'); this.name = 'Cancel'; }
}

function unwrap<T>(v: T | symbol): T {
  if (clack.isCancel(v)) throw new Cancel();
  return v;
}

/** 选择项。value 为对象时 label 必填；为字符串/数字/布尔时 label 可选。 */
export interface SelectOption<T> {
  value: T;
  label?: string;
  hint?: string;
}

export interface SelectParams<T> {
  message: string;
  options: ReadonlyArray<SelectOption<T>>;
  initialValue?: T;
  maxItems?: number;
}

interface ConfirmParams {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
}

interface TextParams {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string) => string | Error | undefined;
}

interface PasswordParams {
  message: string;
  mask?: string;
  validate?: (value: string) => string | Error | undefined;
}

export const ui = {
  intro: (t: string) => clack.intro(t),
  outro: (t: string) => clack.outro(t),
  note: (body: string, title?: string) => clack.note(body, title),
  cancel: (t: string) => clack.cancel(t),
  log: {
    message: (t: string) => clack.log.message(t),
    info: (t: string) => clack.log.info(t),
    step: (t: string) => clack.log.step(t),
    warning: (t: string) => clack.log.warn(t),
    error: (t: string) => clack.log.error(t),
  },
  async select<T>(opts: SelectParams<T>): Promise<T> {
    return unwrap<T>(await clack.select<T>(opts as Parameters<typeof clack.select<T>>[0]));
  },
  /** 搜索选择器（ink）：输入过滤 + 可滚动下拉。 */
  picker: runPicker,
  /**
   * ink 版 select/text/confirm：用于 ink（picker/表单）之后的提示。
   * ink→clack 提示会因 termios 交接损坏，故这些场景一律用 ink 版。
   * 非混合场景（无前序 ink）仍可继续用 select/confirm/text（clack）。
   */
  inkSelect,
  inkText,
  inkConfirm,
  async confirm(opts: ConfirmParams): Promise<boolean> {
    return unwrap<boolean>(await clack.confirm(opts));
  },
  async text(opts: TextParams): Promise<string> {
    return unwrap<string>(await clack.text(opts));
  },
  async password(opts: PasswordParams): Promise<string> {
    return unwrap<string>(await clack.password(opts));
  },
};

export { clack };
export type { PickerItem, PickerOpts } from './picker.js';
