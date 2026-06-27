/**
 * 共享类型契约。
 *
 * ccs 的数据模型三层边界：
 * - Preset / ProviderOptions：从 presets.json / 用户 presets 读入的预设结构
 * - FormState：表单状态机，判别联合 mode: 'alias' | 'single'
 * - ProviderSettings：写进 provider 配置、最终透传给 claude --settings 的片段
 */

/** Claude Code 模型档位（与 /model 选择器对应）。 */
export type Tier = 'opus' | 'sonnet' | 'haiku' | 'fable';

/** 推理强度档位（对应 CLAUDE_CODE_EFFORT_LEVEL）。 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** 三项 CLAUDE_CODE_* 配置 + ccs 启动开关，存于 provider 配置。 */
export interface ProviderOptions {
  attributionHeader: boolean;
  disableNonEssentialTraffic: boolean;
  autoCompactWindow: number;
  effort: EffortLevel;
}

/** 内置/用户预设结构。model 与 models 二选一：单模型或档位别名。 */
export interface Preset {
  label: string;
  baseUrl: string;
  model?: string;
  models?: Partial<Record<Tier, string>>;
  options?: Partial<ProviderOptions>;
}

/**
 * 写进 provider 配置、最终透传给 claude --settings 的片段。
 * - env：环境变量（API key、base url、各档位别名、CLAUDE_CODE_* 等）
 * - model：仅 alias 模式下记录初始档位（供 ccs 启动参数与菜单展示）
 */
export interface ProviderSettings {
  env: Record<string, string>;
  model?: Tier;
}

/** 表单模式：档位别名（多模型）或单一模型。 */
export type FormMode = 'alias' | 'single';

/** 表单运行态。initState 构造、buildResult 消费、validateState 校验。 */
export interface FormState {
  baseUrl: string;
  existingKey: string;
  apiKey: string;
  keepExistingKey: boolean;
  mode: FormMode;
  tier: string;
  /** ALIAS_TIERS → 模型 id（别名模式）。 */
  aliases: Record<string, string>;
  singleModel: string;
  options: ProviderOptions;
}

/** 表单提交结果，等价于 ProviderSettings 片段。 */
export type FormResult = ProviderSettings;
