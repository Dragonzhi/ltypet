/**
 * 用户设置结构定义。
 *
 * schemaVersion 用于版本迁移：当结构变化时递增版本号，
 * migrate() 函数负责将旧版本数据升级到当前版本。
 *
 * 所有坐标为物理像素，与 Tauri 窗口 API 一致。
 */

/** 当前设置结构版本号 */
export const CURRENT_SCHEMA_VERSION = 3 as const;

/** 窗口位置与外观状态 */
export interface WindowSettings {
  /** 窗口左上角 X 坐标（物理像素） */
  x: number;
  /** 窗口左上角 Y 坐标（物理像素） */
  y: number;
  /** 是否始终置顶 */
  alwaysOnTop: boolean;
  /** 是否启用轮廓外点击穿透 */
  clickThrough: boolean;
}

/** 动画与视觉强度 */
export interface AnimationSettings {
  /** 动作强度倍率，范围 [0, 1]，1 为完整幅度 */
  intensity: number;
}

/** 音频设置 */
export interface AudioSettings {
  /** 是否启用声音 */
  enabled: boolean;
  /** 音量，范围 [0, 1] */
  volume: number;
}

/** Agent 相关设置 */
export interface AgentSettings {
  /** Agent 总开关 */
  enabled: boolean;
  /** M11 对话使用的模型供应商；Agent 工具能力仍由 enabled 单独控制。 */
  provider: "mock" | "openai-compatible";
  /** OpenAI-compatible Chat Completions 完整地址。 */
  endpoint: string;
  /** 供应商模型标识。 */
  model: string;
  /** 单次外发上下文的 Unicode 字符预算，范围 [1000, 100000]。 */
  maxContextChars: number;
  /** 原生网络请求超时，范围 [3000, 120000] 毫秒。 */
  timeoutMs: number;
  /** 首个增量前的自动重试次数，范围 [0, 2]。 */
  maxRetries: number;
  /** 用户是否明确同意把对话文本发送给外部 Provider。 */
  externalDataConsent: boolean;
}

/** 番茄钟时长与完成提醒偏好。 */
export interface PomodoroSettings {
  /** 默认专注时长（分钟），范围 [1, 180]。 */
  focusMinutes: number;
  /** 默认休息时长（分钟），范围 [1, 180]。 */
  breakMinutes: number;
  /** 计时完成时请求系统级注意提醒。 */
  showSystemReminder: boolean;
  /** 计时完成时播放系统提示音。 */
  soundEnabled: boolean;
}

/** 完整的用户设置 */
export interface PetSettings {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  window: WindowSettings;
  animation: AnimationSettings;
  audio: AudioSettings;
  agent: AgentSettings;
  pomodoro: PomodoroSettings;
}

/** 校验错误码 */
export type SettingsErrorCode =
  | "invalid_json"
  | "invalid_structure"
  | "unsupported_version";

/** 校验结果 */
export type SettingsValidationResult =
  | { ok: true; settings: PetSettings }
  | { ok: false; code: SettingsErrorCode; reason: string };
