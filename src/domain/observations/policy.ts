import type {
  ObservationEvent,
  ObservationLimits,
  ObservationRejectionCode,
  ObservationRuntimeConfig,
  ObservationSensitivity,
  ObservationSourceGrant,
} from "./types";

export type ObservationPolicyDecision =
  | { allowed: true }
  | { allowed: false; code: ObservationRejectionCode; reason: string };

const SENSITIVITY_RANK: Record<ObservationSensitivity, number> = {
  status: 0,
  metadata: 1,
  content: 2,
};

export class ObservationPolicy {
  private readonly seen = new Map<string, number>();
  private readonly sourceEvents = new Map<string, number[]>();

  constructor(
    private readonly limits: ObservationLimits,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  authorize(event: ObservationEvent, config: ObservationRuntimeConfig): ObservationPolicyDecision {
    const now = this.clock();
    this.prune(now);
    if (!config.enabled) return denied("paused", "外部状态反馈已暂停");
    if (config.quietHours?.enabled && isWithinQuietHours(
      localMinuteOfDay(now),
      config.quietHours.startMinute,
      config.quietHours.endMinute,
    )) {
      return denied("quiet_hours", "当前处于外部反馈安静时段");
    }
    if (event.observedAt < now - this.limits.maxEventAgeMs) {
      return denied("stale_event", "观察事件已过期");
    }
    if (event.observedAt > now + this.limits.maxFutureSkewMs) {
      return denied("future_event", "观察事件时间戳超出允许的未来偏差");
    }

    const grant = findGrant(event, config.grants);
    if (!grant) return denied("source_not_allowed", `观察来源未获授权：${event.source.kind}:${event.source.id}`);
    if (!grant.eventTypes.includes(event.type)) {
      return denied("event_not_allowed", `来源无权发送 ${event.type}`);
    }
    if (SENSITIVITY_RANK[event.sensitivity] > SENSITIVITY_RANK[grant.maxSensitivity]) {
      return denied("sensitivity_not_allowed", `来源无权发送 ${event.sensitivity} 级数据`);
    }

    const eventKey = `${event.source.kind}:${event.source.id}:${event.id}`;
    if (this.seen.has(eventKey)) return denied("duplicate_event", "重复观察事件已忽略");

    const sourceKey = `${event.source.kind}:${event.source.id}`;
    const timestamps = this.sourceEvents.get(sourceKey) ?? [];
    if (timestamps.length >= this.limits.maxEventsPerMinutePerSource) {
      this.seen.set(eventKey, now);
      return denied("rate_limited", "观察来源超过每分钟事件预算");
    }
    timestamps.push(now);
    this.sourceEvents.set(sourceKey, timestamps);
    this.seen.set(eventKey, now);
    return { allowed: true };
  }

  reset(): void {
    this.seen.clear();
    this.sourceEvents.clear();
  }

  private prune(now: number): void {
    for (const [key, timestamp] of this.seen) {
      if (timestamp <= now - this.limits.dedupeWindowMs) this.seen.delete(key);
    }
    for (const [key, timestamps] of this.sourceEvents) {
      const recent = timestamps.filter((timestamp) => timestamp > now - 60_000);
      if (recent.length === 0) this.sourceEvents.delete(key);
      else this.sourceEvents.set(key, recent);
    }
  }
}

export function isWithinQuietHours(minute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

function localMinuteOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

function findGrant(event: ObservationEvent, grants: readonly ObservationSourceGrant[]): ObservationSourceGrant | undefined {
  return grants.find((grant) =>
    grant.source.kind === event.source.kind && grant.source.id === event.source.id
  );
}

function denied(code: ObservationRejectionCode, reason: string): ObservationPolicyDecision {
  return { allowed: false, code, reason };
}
