import { ui } from './tui.mjs';
import { getPresets, CUSTOM_KEY } from './presets.mjs';
import { t } from './i18n.mjs';
import { runProviderForm } from './formUi.mjs';

export const TIERS = [
  { value: 'opus', label: 'opus' },
  { value: 'sonnet', label: 'sonnet' },
  { value: 'haiku', label: 'haiku' },
  { value: 'fable', label: 'fable' },
];

// 环境变量后缀的大小写档位（对应 ANTHROPIC_DEFAULT_<TIER>_MODEL）
export const ALIAS_TIERS = ['FABLE', 'OPUS', 'SONNET', 'HAIKU'];

// 推理强度档位（对应 CLAUDE_CODE_EFFORT_LEVEL），与 Claude Code 内置取值一致。
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

// 三项 CLAUDE_CODE_* 配置的默认值。
// - attributionHeader: 默认关闭（尊重用户全局已禁用 attribution 的设置）。
// - disableNonEssentialTraffic: 默认开启（减少遥测/分析流量）。
// - autoCompactWindow: 默认 200k tokens。
// - effort: 默认 max（最高推理强度），可在供应商上覆盖。
const DEFAULT_OPTIONS = {
  attributionHeader: false,
  disableNonEssentialTraffic: true,
  autoCompactWindow: 200000,
  effort: 'max',
};

const MODE_BUILTIN = 'builtin';
const MODE_CUSTOM = 'custom';

function aliasKey(tierUpper) {
  return `ANTHROPIC_DEFAULT_${tierUpper}_MODEL`;
}

/** /model 选择器中的显示名 key（与 _MODEL 配套，仅显示用，不参与 API 请求）。 */
function nameKey(tierUpper) {
  return `ANTHROPIC_DEFAULT_${tierUpper}_MODEL_NAME`;
}

/** 剥离 [1m] 上下文后缀，用于派生显示名（claude 发请求前会自行剥离 _MODEL 的后缀，显示名无需带）。 */
function strip1m(v) {
  return v.replace(/\[1m\]$/i, '').trim();
}

/** 是否存在任一档位别名 env（用于判断当前配置处于档位别名模式）。 */
function hasAliasEnv(env) {
  return ALIAS_TIERS.some((tier) => env[aliasKey(tier)]);
}

/** 解析 env 里的布尔值（'1'/'true' → true，'0'/'false' → false，空 → def）。 */
function parseBoolEnv(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'true') return true;
  if (s === '0' || s === 'false') return false;
  return def;
}

/** 解析 env 里的正整数（非法 → def）。 */
function parseNumEnv(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n > 0 ? n : def;
}

/** 解析 env 里的 effort 档位（非法/空 → def）。大小写不敏感。 */
function parseEffortEnv(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  return EFFORT_LEVELS.includes(s) ? s : def;
}

/**
 * 第一步：选内置供应商还是自定义。
 * @returns {'builtin' | 'custom'}
 */
export async function chooseCreateMode() {
  return ui.select({
    message: t('create.kindPrompt'),
    options: [
      { value: MODE_BUILTIN, label: t('create.kindBuiltin') },
      { value: MODE_CUSTOM, label: t('create.kindCustom') },
    ],
    initialValue: MODE_BUILTIN,
  });
}

/**
 * 选择内置供应商预设。返回 { key, preset }。
 */
export async function pickBuiltinPreset() {
  const presets = getPresets();
  const options = Object.entries(presets).map(([key, p]) => ({
    value: key,
    label: p.label,
    hint: p.baseUrl || t('presets.fillUrl'),
  }));
  const key = await ui.select({
    message: t('create.builtinPrompt'),
    options,
    initialValue: Object.keys(presets)[0],
  });
  return { key, preset: presets[key] };
}

/** 向后兼容：旧 pickPreset 调用点（如有）。 */
export async function pickPreset() {
  const mode = await chooseCreateMode();
  if (mode === MODE_BUILTIN) return pickBuiltinPreset();
  return { key: CUSTOM_KEY, preset: null };
}

/**
 * 推断本次表单应默认进入哪种模式。
 * 默认档位别名模式（档位全部显示，配不配置由用户决定，预设只负责预填），
 * 仅在编辑已有「单一 ANTHROPIC_MODEL」配置时回退到单模型模式。
 * - 已有档位别名 env → 别名模式
 * - 已有 ANTHROPIC_MODEL（且无别名）→ 单模型模式
 * - 其余（含创建/预设，无论 preset 是否带 models）→ 别名模式
 */
function detectAliasMode(initial, preset) {
  const env = initial.env || {};
  if (hasAliasEnv(env)) return true;
  if (env.ANTHROPIC_MODEL) return false;
  return true;
}

/**
 * 从 initial（编辑时已有 settings）与 preset（创建时预填）初始化表单状态。
 * 三项 options 的取值优先级：existing env > preset.options > DEFAULT_OPTIONS。
 */
export function initState(initial, preset) {
  const env = initial.env || {};
  const existingKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '';
  const presetOptions = preset?.options || {};

  const options = {
    attributionHeader: parseBoolEnv(env.CLAUDE_CODE_ATTRIBUTION_HEADER, presetOptions.attributionHeader ?? DEFAULT_OPTIONS.attributionHeader),
    disableNonEssentialTraffic: parseBoolEnv(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, presetOptions.disableNonEssentialTraffic ?? DEFAULT_OPTIONS.disableNonEssentialTraffic),
    autoCompactWindow: parseNumEnv(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, presetOptions.autoCompactWindow ?? DEFAULT_OPTIONS.autoCompactWindow),
    effort: parseEffortEnv(env.CLAUDE_CODE_EFFORT_LEVEL, presetOptions.effort ?? DEFAULT_OPTIONS.effort),
    // 非 env 项：ccs 启动参数，存于 provider 配置顶层，由 launch 读取并转为 CLI flag。
    dangerouslySkipPermissions: !!initial.dangerouslySkipPermissions,
  };

  const aliases = {};
  for (const tierUpper of ALIAS_TIERS) {
    const k = aliasKey(tierUpper);
    aliases[tierUpper] = env[k] ?? preset?.models?.[tierUpper.toLowerCase()] ?? '';
  }

  return {
    baseUrl: env.ANTHROPIC_BASE_URL ?? preset?.baseUrl ?? '',
    existingKey,
    apiKey: '',
    keepExistingKey: !!existingKey,
    mode: detectAliasMode(initial, preset) ? 'alias' : 'single',
    tier: initial.model || 'opus',
    aliases,
    singleModel: env.ANTHROPIC_MODEL ?? preset?.model ?? '',
    options,
  };
}

/**
 * 由表单状态构建 settings 片段 { env, model? }。
 * 三项 CLAUDE_CODE_* 始终写入 env（显式可见，每次启动生效）。
 */
export function buildResult(state) {
  const env = { ANTHROPIC_BASE_URL: state.baseUrl.trim() };

  // Key：填了新值用新的；否则编辑时保留旧值。统一写 ANTHROPIC_AUTH_TOKEN。
  if (state.apiKey && state.apiKey.trim()) {
    env.ANTHROPIC_AUTH_TOKEN = state.apiKey.trim();
  } else if (state.keepExistingKey && state.existingKey) {
    env.ANTHROPIC_AUTH_TOKEN = state.existingKey;
  }

  if (state.mode === 'single') {
    env.ANTHROPIC_MODEL = state.singleModel.trim();
  } else {
    // 别名模式：显式写 ANTHROPIC_MODEL = ''（空串）。
    // 必须显式置空——省略会让 ~/.claude/settings.json 里残留的 ANTHROPIC_MODEL 透传，
    // 导致看到错误模型；而空串会覆盖残留值，又不参与模型解析，档位别名
    // （ANTHROPIC_DEFAULT_*_MODEL）继续生效，会话内 /model 切换可用。
    env.ANTHROPIC_MODEL = '';
    for (const tierUpper of ALIAS_TIERS) {
      const v = (state.aliases[tierUpper] || '').trim();
      // 始终写入所有档位别名（含空串）及其显示名，确保完美覆盖主配置的同名 key——
      // 否则主配置里残留的同名别名会透传进来。
      env[aliasKey(tierUpper)] = v;
      env[nameKey(tierUpper)] = v ? strip1m(v) : '';
    }
  }

  env.CLAUDE_CODE_ATTRIBUTION_HEADER = state.options.attributionHeader ? '1' : '0';
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = state.options.disableNonEssentialTraffic ? '1' : '0';
  env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(state.options.autoCompactWindow);
  env.CLAUDE_CODE_EFFORT_LEVEL = state.options.effort;

  const result = { env };
  if (state.mode === 'alias') result.model = state.tier;
  if (state.options.dangerouslySkipPermissions) result.dangerouslySkipPermissions = true;
  return result;
}

/** 提交前校验：必填项是否齐全。返回错误消息或 null。 */
export function validateState(state) {
  if (!state.baseUrl || !state.baseUrl.trim()) return t('form.baseUrlValidate');
  if (state.mode === 'single' && (!state.singleModel || !state.singleModel.trim())) {
    return t('form.modelValidate');
  }
  return null;
}

// ---------- form entry ----------

/**
 * 持久化 Tab 表单（ink）：API Key / Models / Options / Review（预览+提交）。
 * Tab 切换时下方内容跟随变化，字段直接原地编辑，无需 Enter 进入。
 * create/edit 共用。委托给 formUi.runProviderForm。
 *
 * @param {object} opts
 * @param {object} [opts.initial]  已有 settings（edit 时预填）
 * @param {object} [opts.preset]   预设（create 时预填，可为 null=自定义）
 * @returns {Promise<{env: object, model?: string}>} 最终 settings 片段
 */
export async function providerFormWithPreview({ initial = {}, preset = null } = {}) {
  return runProviderForm({ initial, preset });
}
