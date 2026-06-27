// postinstall：全局安装 ccs 时自动把补全 eval 行写入 ~/.bashrc 和 ~/.zshrc（幂等）。
// 非全局安装（被作为依赖安装）跳过，不污染使用者环境。
//
// 幂等：用标记块 # >>> ccs completion >>> / # <<< ccs completion <<< 包裹，
// 已存在标记则跳过；升级时 ccs completion 输出已更新，无需重写 rc 行。

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARK_BEGIN = '# >>> ccs completion >>>';
const MARK_END = '# <<< ccs completion <<<';

/**
 * 向 rc 文件注入补全 eval 标记块（幂等）。
 * - rc 不存在 → 创建并写入。
 * - 已含 MARK_BEGIN → 返回 false（不变更）。
 * - 否则追加标记块，返回 true。
 */
export function injectCompletionRc(rcPath, shell) {
  const evalLine = `eval "$(ccs completion ${shell})"`;
  const block = `${MARK_BEGIN}\n${evalLine}\n${MARK_END}\n`;

  let content = '';
  if (existsSync(rcPath)) content = readFileSync(rcPath, 'utf8');
  if (content.includes(MARK_BEGIN)) return false; // 已注入，幂等跳过

  mkdirSync(dirname(rcPath), { recursive: true });
  // 确保与原内容之间有换行分隔（原内容非空且无尾换行时补一个）
  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  writeFileSync(rcPath, content + prefix + block);
  return true;
}

function main() {
  // 仅全局安装触发；本地依赖安装 / 开发 npm install 跳过。
  if (process.env.npm_config_global !== 'true') process.exit(0);

  const home = homedir();
  const targets = [
    { rc: join(home, '.bashrc'), shell: 'bash' },
    { rc: join(home, '.zshrc'), shell: 'zsh' },
  ];

  for (const { rc, shell } of targets) {
    try {
      const wrote = injectCompletionRc(rc, shell);
      console.log(wrote ? `  ccs: added completion to ${rc}` : `  ccs: completion already in ${rc} (skipped)`);
    } catch (e) {
      // 写 rc 失败不应中断安装；降级为提示用户手动 eval。
      console.warn(`  ccs: could not update ${rc}: ${(e).message}`);
      console.warn(`  ccs: run \`eval "$(ccs completion ${shell})"\` manually.`);
    }
  }
  console.log('  ccs: restart your shell or open a new terminal to enable completion.');
}

// 仅当直接执行（非被 import 测试）时跑 main：import 时不触发 process.exit，
// 使纯函数 injectCompletionRc 可被单测导入。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

