import * as clack from '@clack/prompts';

/** 用户取消时抛出，由顶层捕获统一退出。 */
export class Cancel extends Error {
  constructor() { super('cancel'); this.name = 'Cancel'; }
}

function unwrap(v) {
  if (clack.isCancel(v)) throw new Cancel();
  return v;
}

export const ui = {
  intro: (t) => clack.intro(t),
  outro: (t) => clack.outro(t),
  note: (body, title) => clack.note(body, title),
  cancel: (t) => clack.cancel(t),
  log: {
    message: (t) => clack.log.message(t),
    info: (t) => clack.log.info(t),
    step: (t) => clack.log.step(t),
    warning: (t) => clack.log.warn(t),
    error: (t) => clack.log.error(t),
  },
  async select(opts) { return unwrap(await clack.select(opts)); },
  async confirm(opts) { return unwrap(await clack.confirm(opts)); },
  async text(opts) { return unwrap(await clack.text(opts)); },
  async password(opts) { return unwrap(await clack.password(opts)); },
};

export { clack };
