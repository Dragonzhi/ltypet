import { describe, expect, it } from "vitest";
import { OBSERVATION_PROTOCOL_VERSION } from "./types";
import { validateObservationEvent } from "./validate";

function event(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: OBSERVATION_PROTOCOL_VERSION,
    id: "event-1",
    source: { kind: "system", id: "windows-media-session" },
    type: "media.playback",
    observedAt: 1_000,
    sensitivity: "status",
    payload: { state: "playing" },
    ...overrides,
  };
}

describe("validateObservationEvent", () => {
  it("parses a minimal status-only media event", () => {
    expect(validateObservationEvent(event(), { maxPayloadBytes: 4_096 })).toMatchObject({
      ok: true,
      event: { type: "media.playback", payload: { state: "playing" } },
    });
  });

  it("rejects undeclared media metadata instead of silently retaining it", () => {
    expect(validateObservationEvent(event({
      payload: { state: "playing", title: "private song title" },
    }), { maxPayloadBytes: 4_096 })).toMatchObject({
      ok: false,
      code: "invalid_event",
      reason: expect.stringContaining("title"),
    });
  });

  it("rejects oversized payloads before type-specific processing", () => {
    expect(validateObservationEvent(event({ payload: { state: "playing", padding: "x".repeat(100) } }), {
      maxPayloadBytes: 20,
    })).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("requires stable lowercase source ids and exact envelope fields", () => {
    expect(validateObservationEvent(event({ source: { kind: "plugin", id: "Bad Plugin" } }), {
      maxPayloadBytes: 4_096,
    })).toMatchObject({ ok: false, code: "invalid_event" });
    expect(validateObservationEvent({ ...event(), prompt: "do not log me" }, {
      maxPayloadBytes: 4_096,
    })).toMatchObject({ ok: false, reason: expect.stringContaining("prompt") });
  });

  it("accepts only declared development Agent lifecycle states", () => {
    const result = validateObservationEvent(event({
      source: { kind: "plugin", id: "dev-agent-hooks" },
      type: "dev-agent.status",
      payload: { state: "waiting_for_user" },
    }), { maxPayloadBytes: 4_096 });
    expect(result).toMatchObject({ ok: true, event: { payload: { state: "waiting_for_user" } } });
    expect(validateObservationEvent(event({
      type: "dev-agent.status",
      payload: { state: "tool_arguments", value: "secret" },
    }), { maxPayloadBytes: 4_096 })).toMatchObject({ ok: false });
  });
});
