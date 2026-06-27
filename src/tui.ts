import * as clack from '@clack/prompts';

/** 用户取消时抛出，由顶层捕获统一退出。 */
export class Cancel extends Error {
  constructor() { super('cancel'); this.name = 'Cancel'; }
}

function unwrap<T>(v: T | symbol): T {
  if (clack.isCancel(v)) throw new Cancel();
  return v;
}

/**
 * 选择项。value 为对象时 label 必填；为字符串/数字/布尔时 label 可选。
 * 显式定义以避免 clack 的 Option<Value> 分布式条件类型对联合 value 展开导致赋值困难。
 */
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
