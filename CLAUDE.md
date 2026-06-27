# CCS

CLI 工具 — 基于 Node.js ESM 构建。

## Commands

```bash
# 启动
node src/cli.mjs --help

# 开发（如果配置了）
npm run dev
```

## Project Notes

- **ESM** — `"type": "module"`，所有源文件使用 `.mjs` 扩展名
- **CLI 框架**: `commander`
- **输出样式**: `chalk`
- **Markdown 渲染**: `marked`
- 入口: `src/launch.mjs` → `src/cli.mjs`

## Coding Standards

- 遵循 `.claude/rules/common/` 下的项目规则
- 不可变数据模式（创建新对象，不修改现有对象）
- 测试覆盖率目标: 80%+
