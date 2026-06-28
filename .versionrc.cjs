// standard-version 配置：默认只自动递增 patch。
// 用法：
//   npm run release              → patch bump（日常发布）
//   npm run release-minor        → minor bump（功能更新）
//   npm run release-major        → major bump（破坏性更新）

module.exports = {
  types: [
    { type: 'feat',     section: 'Features' },
    { type: 'fix',      section: 'Bug Fixes' },
    { type: 'docs',     section: 'Documentation' },
    { type: 'refactor', section: 'Refactoring' },
    { type: 'test',     section: 'Tests' },
    { type: 'chore',    section: 'Chores' },
  ],
  commitUrlFormatConfig: {
    issuePrefixes: ['issue', 'pr'],
  },
}
