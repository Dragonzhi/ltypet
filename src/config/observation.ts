import type { ObservationLimits } from "../domain/observations/types";

/** M13 观察事件的本地硬限制，外部来源和插件不能覆盖。 */
export const OBSERVATION_LIMITS: ObservationLimits = {
  maxPayloadBytes: 4_096,
  maxEventAgeMs: 30_000,
  maxFutureSkewMs: 5_000,
  dedupeWindowMs: 60_000,
  maxEventsPerMinutePerSource: 20,
  diagnosticCapacity: 50,
};

/** 自动反应冷却，防止状态抖动造成角色持续动作。 */
export const OBSERVATION_REACTION_COOLDOWN_MS = 2_500;
