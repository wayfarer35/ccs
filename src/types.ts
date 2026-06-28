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

/** 模型元信息：供应商支持列表、默认模型、档位配置。 */
export interface ModelMeta {
  /** 供应商支持的全部模型列表（用于 UI 展示）。 */
  support?: string[];
  /** 单模型模式的主模型。 */
  default?: string;
  /** 默认档位（如 'opus'）。 */
  tier?: string;
  /** 档位别名：haiku/sonnet/opus/fable → modelId。 */
  tiers?: Partial<Record<Tier, string>>;
}

/** 内置/用户预设结构。model 字段统一为 ModelMeta。 */
export interface Preset {
  label: string;
  baseUrl: string;
  model?: ModelMeta;
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

/** 认证方式。 */
export type AuthMethod = 'auth_token' | 'api_key';

/** 表单运行态。initState 构造、buildResult 消费、validateState 校验。 */
export interface FormState {
  baseUrl: string;
  existingKey: string;
  apiKey: string;
  keepExistingKey: boolean;
  mode: FormMode;
  authMethod: AuthMethod;
  tier: string;
  /** ALIAS_TIERS → 模型 id（别名模式）。 */
  aliases: Record<string, string>;
  singleModel: string;
  options: ProviderOptions;
  /** 原始 JSON 字符串，提交时解析合并到 env。 */
  customParams: string;
}

/** 表单提交结果，等价于 ProviderSettings 片段。 */
export type FormResult = ProviderSettings;
