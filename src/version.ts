import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 版本号单一真源：运行时向上查找 package.json 读取 version。
 *
 * 不能用 `import '../package.json'`——tsconfig rootDir=src、include=src/**，
 * package.json 在 rootDir 之外。故用 fs 向上查找，兼容：
 *  - 开发：dist/version.js → 向上到仓库根 package.json
 *  - 全局安装：<prefix>/lib/node_modules/ccs/dist/version.js → 向上到包根 package.json
 *
 * 带模块级缓存；找不到时兜底 '0.0.0'（绝不抛错，保证 --version 可用）。
 */
let cached: string | undefined;

export function getVersion(): string {
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const version = (raw as { version?: unknown })?.version;
      if (typeof version === 'string') { cached = version; return cached; }
    } catch { /* 文件不存在或解析失败，继续向上找 */ }
    const parent = dirname(dir);
    if (parent === dir) break; // 已到文件系统根
    dir = parent;
  }
  return '0.0.0';
}
