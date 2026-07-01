import { readJSON, writeJSON, CONFIG_FILE } from './config.js';

export interface LocaleOption {
  value: string;
  label: string;
}

export const LOCALES: readonly LocaleOption[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
];

const SUPPORTED: readonly string[] = LOCALES.map((l) => l.value);

interface CcsConfig {
  locale?: string;
}

/** 读取 ~/.ccs/config.json（不存在则空对象）。 */
export function getConfig(): CcsConfig {
  return readJSON<CcsConfig>(CONFIG_FILE, {}) || {};
}

/** 合并写入 ~/.ccs/config.json。 */
export function setConfig(patch: Partial<CcsConfig>): CcsConfig {
  const next = { ...getConfig(), ...patch };
  writeJSON(CONFIG_FILE, next);
  return next;
}

/**
 * 语言探测顺序：config.locale → LC_ALL → LC_MESSAGES → LANG → 'en'。
 * 形如 zh_CN / zh_TW / zh-Hans 均归为 zh-CN，其余归 en。
 */
export function detectLocale(): string {
  const cfg = getConfig();
  if (cfg.locale && SUPPORTED.includes(cfg.locale)) return cfg.locale;
  const envVal = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  return /^zh/i.test(envVal) ? 'zh-CN' : 'en';
}

type LocaleEntry = { en: string; 'zh-CN': string };

const DICT: Record<string, LocaleEntry> = {
  // ---------- generic ----------
  'common.cancelled': { en: 'Cancelled', 'zh-CN': '已取消' },
  'common.yes': { en: 'Yes', 'zh-CN': '是' },
  'common.no': { en: 'No', 'zh-CN': '否' },

  // ---------- errors ----------
  'error.unknownArg': { en: 'Unknown argument: {arg}', 'zh-CN': '未知参数: {arg}' },
  'error.generic': { en: 'Error: {msg}', 'zh-CN': '错误: {msg}' },
  'error.invalidName': { en: 'Invalid config name: {name}', 'zh-CN': '非法配置名: {name}' },
  'error.exists': { en: 'Already exists: {name}. Use `ccs edit {name}` to modify, or pick another name.', 'zh-CN': '已存在: {name}。用 ccs edit {name} 修改，或换个名字。' },
  'error.notFound': { en: 'Not found: {name}', 'zh-CN': '未找到: {name}' },
  'error.providerMissing': {
    en: 'Provider config not found: {name}\nRun `ccs list` to see available configs, or `ccs create` to create one.',
    'zh-CN': '未找到供应商配置: {name}\n运行 ccs list 查看可用配置，或 ccs create 创建。',
  },
  'error.claudeBin': {
    en: 'claude executable not found: {bin}\nMake sure Claude Code is installed, or set CCS_CLAUDE_BIN.',
    'zh-CN': '未找到 claude 可执行文件: {bin}\n请确认 Claude Code 已安装，或用 CCS_CLAUDE_BIN 指定路径。',
  },
  'error.jsonParse': { en: 'Failed to parse JSON: {file}\n{msg}', 'zh-CN': '解析 JSON 失败: {file}\n{msg}' },

  // ---------- usage ----------
  'usage.createName': { en: 'Usage: ccs create [name]', 'zh-CN': '用法: ccs create [name]' },
  'usage.editName': { en: 'Usage: ccs edit <name> [--raw]', 'zh-CN': '用法: ccs edit <name> [--raw]' },
  'usage.removeName': { en: 'Usage: ccs remove <name>', 'zh-CN': '用法: ccs remove <name>' },
  'usage.showName': { en: 'Usage: ccs show <name>', 'zh-CN': '用法: ccs show <name>' },

  // ---------- list ----------
  'list.empty': {
    en: 'No provider configs yet. Run `ccs create` or `ccs init` to create one.',
    'zh-CN': '暂无供应商配置。运行 ccs create 或 ccs init 创建。',
  },
  'list.header': { en: 'Available provider configs:', 'zh-CN': '可用供应商配置:' },
  'list.summary': {
    en: '{count} total. Use `ccs <name>` to launch, or just `ccs` to pick interactively.',
    'zh-CN': '共 {count} 个。用 ccs <name> 启动，或直接 ccs 交互选择。',
  },
  'list.lastUsed': { en: 'last used', 'zh-CN': '上次使用' },

  // ---------- presets ----------
  'presets.header': { en: 'Available presets:', 'zh-CN': '可用预设:' },
  'presets.fillUrl': { en: '(Base URL required)', 'zh-CN': '(需填写 Base URL)' },
  'presets.footer': {
    en: 'Use `ccs create` and pick a built-in provider to create from a preset.',
    'zh-CN': '用 ccs create 并选择内置供应商来快速创建。',
  },
  'presets.userFile': { en: 'Custom/override presets: ~/.ccs/presets.json', 'zh-CN': '自定义/覆盖预设: ~/.ccs/presets.json' },

  // ---------- create flow ----------
  'create.kindTitle': { en: 'Create provider config', 'zh-CN': '创建供应商配置' },
  'create.kindPrompt': { en: 'Built-in provider or custom?', 'zh-CN': '选择内置供应商或自定义' },
  'create.kindBuiltin': { en: 'Built-in provider (preset prefilled, name customizable)', 'zh-CN': '内置供应商（预填预设，名称可自定义）' },
  'create.kindCustom': { en: 'Custom (your own name, blank form)', 'zh-CN': '自定义（自定义名称，空白表单）' },
  'create.builtinPrompt': { en: 'Select a built-in provider', 'zh-CN': '选择内置供应商' },
  'create.namePrompt': { en: 'Config name (default: {default})', 'zh-CN': '配置名（默认: {default}）' },
  'create.customNamePrompt': { en: 'Config name (e.g. glm / deepseek / myprov)', 'zh-CN': '配置名 (如 glm / deepseek / myprov)' },
  'create.customNameValidate': { en: 'Name cannot be empty', 'zh-CN': '名称不能为空' },
  'create.created': { en: 'Created: {file}', 'zh-CN': '已创建: {file}' },

  // ---------- edit / remove ----------
  'edit.title': { en: 'Edit provider config: {name}', 'zh-CN': '编辑供应商配置: {name}' },
  'edit.updated': { en: 'Updated: {file}', 'zh-CN': '已更新: {file}' },
  'remove.title': { en: 'Remove provider config: {name}', 'zh-CN': '删除供应商配置: {name}' },
  'remove.confirm': { en: 'Confirm remove {name}?', 'zh-CN': '确认删除 {name}?' },
  'remove.done': { en: 'Removed: {name}', 'zh-CN': '已删除: {name}' },

  // ---------- form ----------
  'form.baseUrl': { en: 'Base URL (ANTHROPIC_BASE_URL)', 'zh-CN': 'Base URL (ANTHROPIC_BASE_URL)' },
  'form.baseUrlValidate': { en: 'Base URL cannot be empty', 'zh-CN': 'Base URL 不能为空' },
  'form.placeholderUrl': { en: 'https://...', 'zh-CN': 'https://...' },
  'form.apiKeyKeep': { en: 'API Key (leave empty to keep current)', 'zh-CN': 'API Key (留空保留原值)' },
  'form.apiKey': { en: 'API Key', 'zh-CN': 'API Key' },
  'form.model': { en: 'Default model (ANTHROPIC_MODEL)', 'zh-CN': '默认模型 (ANTHROPIC_MODEL)' },
  'form.modelValidate': { en: 'Model cannot be empty', 'zh-CN': '模型不能为空' },
  'form.tier': { en: 'Default tier (settings.model)', 'zh-CN': '默认档位 (settings.model)' },
  'form.aliasesPrompt': { en: 'Use tier-alias mode? (Yes: settings.model=opus + per-tier ANTHROPIC_DEFAULT_*_MODEL, /model switches between them. No: single ANTHROPIC_MODEL.)', 'zh-CN': '使用档位别名模式？（是：settings.model=opus + 各档位 ANTHROPIC_DEFAULT_*_MODEL，可用 /model 切换；否：单一 ANTHROPIC_MODEL）' },
  'form.aliasModel': { en: '{tier} model ({var})', 'zh-CN': '{tier} 模型 ({var})' },

  // ---------- options (tab 3) ----------
  'form.optionsAttribution': { en: 'Enable CLAUDE_CODE_ATTRIBUTION_HEADER? (adds attribution to git commits)', 'zh-CN': '启用 CLAUDE_CODE_ATTRIBUTION_HEADER？（向 git 提交追加归属信息）' },
  'form.optionsNonEssential': { en: 'Enable CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC? (disables telemetry/analytics traffic)', 'zh-CN': '启用 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC？（禁用遥测/分析流量）' },
  'form.optionsAutoCompact': { en: 'Auto-compact window in tokens (CLAUDE_CODE_AUTO_COMPACT_WINDOW)', 'zh-CN': '自动压缩窗口（token 数，CLAUDE_CODE_AUTO_COMPACT_WINDOW）' },
  'form.autoCompactValidate': { en: 'Enter a positive integer', 'zh-CN': '请输入正整数' },
  'form.autoCompactPlaceholder': { en: '200000', 'zh-CN': '200000' },

  // ---------- tab navigation ----------
  'tab.apikey': { en: 'API Key', 'zh-CN': 'API Key' },
  'tab.models': { en: 'Models', 'zh-CN': '模型' },
  'tab.options': { en: 'Options', 'zh-CN': '其他配置' },
  'tab.review': { en: 'Review', 'zh-CN': '预览/提交' },
  'tab.preview': { en: 'Preview', 'zh-CN': '预览' },
  'tab.submit': { en: 'Submit', 'zh-CN': '提交保存' },
  'tab.cancel': { en: 'Cancel', 'zh-CN': '取消' },
  'tab.filled': { en: 'filled', 'zh-CN': '已填' },
  'tab.unfilled': { en: 'not filled', 'zh-CN': '未填' },
  'tab.previewTitle': { en: 'Preview (secrets redacted)', 'zh-CN': '配置预览（密钥已遮蔽）' },
  'tab.submitConfirm': { en: 'Save this provider config?', 'zh-CN': '保存该供应商配置？' },

  // ---------- inline form field labels & help ----------
  'form.fBaseUrl': { en: 'Base URL', 'zh-CN': 'Base URL' },
  'form.fToken': { en: 'API Key', 'zh-CN': 'API Key' },
  'form.fTokenKeep': { en: 'API Key (leave empty to keep current)', 'zh-CN': 'API Key (留空保留原值)' },
  'form.fTokenKept': { en: '(keeping current)', 'zh-CN': '(保留原值)' },
  'form.fAliases': { en: 'Tier-alias mode', 'zh-CN': '档位别名模式' },
  'form.fModel': { en: 'Default model', 'zh-CN': '默认模型' },
  'form.fTier': { en: 'Default tier', 'zh-CN': '默认档位' },
  'form.fAliasShort': { en: '{tier} model', 'zh-CN': '{tier} 模型' },
  'form.fAttr': { en: 'Attribution header (CLAUDE_CODE_ATTRIBUTION_HEADER)', 'zh-CN': '归属信息 (CLAUDE_CODE_ATTRIBUTION_HEADER)' },
  'form.fNonEss': { en: 'Disable non-essential traffic (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)', 'zh-CN': '禁用非必要流量 (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)' },
  'form.fAutoCompact': { en: 'Auto-compact window (CLAUDE_CODE_AUTO_COMPACT_WINDOW)', 'zh-CN': '自动压缩窗口 (CLAUDE_CODE_AUTO_COMPACT_WINDOW)' },
  'form.fEffort': { en: 'Reasoning effort (CLAUDE_CODE_EFFORT_LEVEL)', 'zh-CN': '推理强度 (CLAUDE_CODE_EFFORT_LEVEL)' },
  'form.fAuthMethod': { en: 'Auth Method', 'zh-CN': '认证方式' },
  'form.authToken': { en: 'Auth Token (ANTHROPIC_AUTH_TOKEN)', 'zh-CN': 'Auth Token (ANTHROPIC_AUTH_TOKEN)' },
  'form.apiUrlKey': { en: 'API Key (ANTHROPIC_API_KEY)', 'zh-CN': 'API Key (ANTHROPIC_API_KEY)' },
  'form.fCustomParams': { en: 'Custom Params (JSON)', 'zh-CN': '自定义参数 (JSON)' },
  'form.customParamsValidate': { en: 'Custom params JSON is invalid', 'zh-CN': '自定义参数 JSON 格式无效' },
  'form.customParamsHint': { en: 'Extra env key-value pairs as JSON, e.g. {"allowed_openai_params": {"max_tokens": 8192}}', 'zh-CN': '额外 env 键值对 JSON，例如 {"allowed_openai_params": {"max_tokens": 8192}}' },
  'form.spaceHint': { en: '(Space to change)', 'zh-CN': '(空格切换)' },
  'tab.next': { en: 'Next →', 'zh-CN': '下一个 →' },
  'form.acHint': { en: '↑↓=pick Enter=use', 'zh-CN': '↑↓=选 Enter=用' },
  'form.help': {
    en: 'Tab=switch tab  ↑↓=field (↑↓=pick model on model fields)  ←→=cursor (in text)  Space=toggle/cycle  n=next tab  Enter=next/accept/submit  Esc=cancel',
    'zh-CN': 'Tab=切标签  ↑↓=切字段(模型字段上 ↑↓=选模型)  ←→=光标(文本内)  Space=开关/切换  n=下一标签  Enter=下一步/采纳/提交  Esc=取消',
  },

  // ---------- preview / edit loop ----------
  'preview.title': { en: 'Preview (secrets redacted)', 'zh-CN': '配置预览（密钥已遮蔽）' },
  'preview.prompt': { en: 'Save, re-edit the form, or edit raw JSON?', 'zh-CN': '保存、重新编辑表单，还是编辑原始 JSON？' },
  'preview.save': { en: 'Save', 'zh-CN': '保存' },
  'preview.reedit': { en: 'Re-edit form', 'zh-CN': '重新编辑表单' },
  'preview.editRaw': { en: 'Edit raw JSON in $EDITOR', 'zh-CN': '在 $EDITOR 中编辑原始 JSON' },
  'preview.rawParseError': { en: 'Raw JSON invalid, keeping previous result. {msg}', 'zh-CN': '原始 JSON 解析失败，保留上一次结果。{msg}' },

  // ---------- use ----------
  'use.select': { en: 'Select a provider', 'zh-CN': '选择供应商' },
  'use.official': { en: 'official', 'zh-CN': 'official' },
  'use.officialHint': { en: "Claude Code's own default config (no provider)", 'zh-CN': 'Claude Code 自身默认配置（不走供应商）' },
  'use.create': { en: 'create', 'zh-CN': 'create' },
  'use.createHint': { en: 'Create a new provider', 'zh-CN': '创建新供应商' },
  'use.edit': { en: 'edit', 'zh-CN': 'edit' },
  'use.editHint': { en: 'Edit an existing config', 'zh-CN': '修改已有配置' },
  'use.remove': { en: 'remove', 'zh-CN': 'remove' },
  'use.removeHint': { en: 'Remove a config', 'zh-CN': '删除配置' },
  'use.editSelect': { en: 'Select a config to edit', 'zh-CN': '选择要修改的配置' },
  'use.removeSelect': { en: 'Select a config to remove', 'zh-CN': '选择要删除的配置' },

  // ---------- picker (ink search-select) ----------
  'picker.placeholder': { en: 'type to filter providers...', 'zh-CN': '输入过滤供应商...' },
  'picker.noMatch': { en: 'no match', 'zh-CN': '无匹配' },
  'picker.providers': { en: 'Providers ({count})', 'zh-CN': '供应商配置 ({count})' },
  'picker.actions': { en: 'Actions', 'zh-CN': '操作' },
  'picker.help': { en: 'type=filter providers  ↑↓=select  Tab=jump region  Enter=confirm  Esc=cancel', 'zh-CN': '输入=过滤供应商  ↑↓=选择  Tab=跳转区域  Enter=确认  Esc=取消' },

  // ---------- common / show / init ----------
  'common.openEditor': { en: 'Opening ~/.claude/settings.json (common config) in editor...', 'zh-CN': '在编辑器中打开 ~/.claude/settings.json (通用配置)...' },
  'common.createdEmpty': { en: 'Created empty settings file: {file}', 'zh-CN': '已创建空配置文件: {file}' },

  // ---------- launch / dry-run ----------
  'launch.willRun': { en: 'Will run: {cmd}', 'zh-CN': '将执行: {cmd}' },
  'launch.dryTmp': { en: '(settings file: {file} — the provider config itself, passed directly to --settings; dry-run does not launch or create any file)', 'zh-CN': '（配置文件: {file}，即 provider 配置本身，直接作为 --settings 目标；dry-run 不启动、不创建文件）' },
  'launch.dryOfficial': { en: '(official mode: no merge, no temp file — uses ~/.claude/settings.json as-is)', 'zh-CN': '（official 模式：不合并、无临时文件，直接用 ~/.claude/settings.json）' },

  // ---------- config ----------
  'config.localeSet': { en: 'Locale set to {locale}', 'zh-CN': '语言已设为 {locale}' },
  'config.localeCurrent': { en: 'Current locale: {locale}', 'zh-CN': '当前语言: {locale}' },
  'config.localeInvalid': { en: 'Invalid locale. Choose from: {opts}', 'zh-CN': '无效语言。可选: {opts}' },
  'config.localePrompt': { en: 'Select language', 'zh-CN': '选择语言' },
  'config.unknownKey': { en: 'Unknown config key: {key}. Try `ccs config locale`.', 'zh-CN': '未知配置项: {key}。试试 ccs config locale。' },
};

/** 翻译变量：{ name: 'foo' } 替换 {name}。 */
type Vars = Record<string, string | number>;

/**
 * 翻译。t(key, { name: 'foo' }) 替换 {name}。
 */
export function t(key: string, vars?: Vars): string {
  const entry = DICT[key];
  const locale = detectLocale();
  let s: string = entry ? (entry[locale as 'en' | 'zh-CN'] ?? entry.en ?? key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
