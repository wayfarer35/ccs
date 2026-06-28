/**
 * 清屏 helper：擦除当前视口并将光标归位，**保留 scrollback**（历史可上滚）。
 *
 * 为什么需要：ink 默认（非 experimental）模式不在首次渲染时清屏，且卸载时
 * 保留最后一帧（log.done()）。连续的 ink 屏幕（picker → 选预设 → 表单 …）
 * 因此向下堆叠。每个顶层屏幕在 render() 前调用本函数，即可让视口一次只见一屏。
 *
 * 用 `\x1b[2J\x1b[H`（擦视口 + 归位）而非 `\x1b[3J`（清 scrollback）——
 * 后者会抹掉终端历史，过度破坏；"页面独占"只需视口干净。
 * 直接写 process.stdout，绕过 ink 的 patchConsole。
 */
export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}
