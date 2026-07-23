import { describe, expect, it } from "vitest";
import type { ObservationEvent, ObservationLimits, ObservationRuntimeConfig } from "./types";
import { OBSERVATION_PROTOCOL_VERSION } from "./types";
import { isWithinQuietHours, ObservationPolicy } from "./policy";

const LIMITS: ObservationLimits = {
  maxPayloadBytes: 4_096,
  maxEventAgeMs: 30_000,
  maxFutureSkewMs: 5_000,
  dedupeWindowMs: 60_000,
  maxEventsPerMinutePerSource: 2,
  diagnosticCapacity: 10,
};

function pluginEvent(id: string, observedAt: number, sensitivity: ObservationEvent["sensitivity"] = "status"): ObservationEvent {
  return {
    protocolVersion: OBSERVATION_PROTOCOL_VERSION,
    id,
    source: { kind: "plugin", id: "dev-agent-hooks" },
    type: "dev-agent.status",
    observedAt,
    sensitivity,
    payload: { state: "completed" },
  };
}

function config(overrides: Partial<ObservationRuntimeConfig> = {}): ObservationRuntimeConfig {
  return {
    enabled: true,
    diagnosticsEnabled: true,
    grants: [{
      source: { kind: "plugin", id: "dev-agent-hooks" },
      eventTypes: ["dev-agent.status"],
      maxSensitivity: "status",
    }],
    ...overrides,
  };
}

describe("ObservationPolicy", () => {
  it("allows a fresh event from an explicitly granted source", () => {
    const policy = new ObservationPolicy(LIMITS, () => 10_000);
    expect(policy.authorize(pluginEvent("e1", 10_000), config())).toEqual({ allowed: true });
  });

  it("rejects paused, unknown and over-sensitive sources", () => {
    const policy = new ObservationPolicy(LIMITS, () => 10_000);
    expect(policy.authorize(pluginEvent("paused", 10_000), config({ enabled: false })))
      .toMatchObject({ allowed: false, code: "paused" });
    expect(policy.authorize(pluginEvent("unknown", 10_000), config({ grants: [] })))
      .toMatchObject({ allowed: false, code: "source_not_allowed" });
    expect(policy.authorize(pluginEvent("content", 10_000, "content"), config()))
      .toMatchObject({ allowed: false, code: "sensitivity_not_allowed" });
  });

  it("rejects stale, future and duplicate events", () => {
    const policy = new ObservationPolicy(LIMITS, () => 100_000);
    expect(policy.authorize(pluginEvent("stale", 69_999), config()))
      .toMatchObject({ allowed: false, code: "stale_event" });
    expect(policy.authorize(pluginEvent("future", 105_001), config()))
      .toMatchObject({ allowed: false, code: "future_event" });
    expect(policy.authorize(pluginEvent("same", 100_000), config())).toEqual({ allowed: true });
    expect(policy.authorize(pluginEvent("same", 100_000), config()))
      .toMatchObject({ allowed: false, code: "duplicate_event" });
  });

  it("applies a per-source rolling event budget", () => {
    let now = 10_000;
    const policy = new ObservationPolicy(LIMITS, () => now);
    expect(policy.authorize(pluginEvent("e1", now), config()).allowed).toBe(true);
    expect(policy.authorize(pluginEvent("e2", now), config()).allowed).toBe(true);
    expect(policy.authorize(pluginEvent("e3", now), config()))
      .toMatchObject({ allowed: false, code: "rate_limited" });
    now += 60_001;
    expect(policy.authorize(pluginEvent("e4", now), config()).allowed).toBe(true);
  });

  it("handles same-day, overnight and all-day quiet ranges", () => {
    expect(isWithinQuietHours(12 * 60, 9 * 60, 17 * 60)).toBe(true);
    expect(isWithinQuietHours(18 * 60, 9 * 60, 17 * 60)).toBe(false);
    expect(isWithinQuietHours(23 * 60, 22 * 60, 8 * 60)).toBe(true);
    expect(isWithinQuietHours(7 * 60, 22 * 60, 8 * 60)).toBe(true);
    expect(isWithinQuietHours(12 * 60, 22 * 60, 8 * 60)).toBe(false);
    expect(isWithinQuietHours(12 * 60, 0, 0)).toBe(true);
  });

  it("rejects an otherwise authorized event during quiet hours", () => {
    const localNoon = new Date(2026, 6, 23, 12, 0, 0).getTime();
    const policy = new ObservationPolicy(LIMITS, () => localNoon);
    expect(policy.authorize(pluginEvent("quiet", localNoon), config({
      quietHours: { enabled: true, startMinute: 11 * 60, endMinute: 13 * 60 },
    }))).toMatchObject({ allowed: false, code: "quiet_hours" });
  });
});
