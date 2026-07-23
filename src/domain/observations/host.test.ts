import { describe, expect, it } from "vitest";
import type { ActionRequest, ActionResult } from "../actions/types";
import type { ActionExecutor, SchedulerEvent } from "../scheduler/types";
import { BehaviorScheduler } from "../scheduler/scheduler";
import type { ObservationEvent, ObservationLimits } from "./types";
import { OBSERVATION_PROTOCOL_VERSION } from "./types";
import { ObservationHost } from "./host";

const LIMITS: ObservationLimits = {
  maxPayloadBytes: 4_096,
  maxEventAgeMs: 30_000,
  maxFutureSkewMs: 5_000,
  dedupeWindowMs: 60_000,
  maxEventsPerMinutePerSource: 20,
  diagnosticCapacity: 3,
};

class CapturingExecutor implements ActionExecutor {
  readonly actions: ActionRequest[] = [];
  async execute(action: ActionRequest): Promise<ActionResult> {
    this.actions.push(action);
    return { actionId: action.id, status: "completed", finishedAt: 10_000 };
  }
}

function devEvent(state: "completed" | "failed" | "waiting_for_user" | "working", id = `event-${state}`): ObservationEvent {
  return {
    protocolVersion: OBSERVATION_PROTOCOL_VERSION,
    id,
    source: { kind: "plugin", id: "dev-agent-hooks" },
    type: "dev-agent.status",
    observedAt: 10_000,
    sensitivity: "status",
    payload: { state },
  };
}

function createHost() {
  const executor = new CapturingExecutor();
  const scheduler = new BehaviorScheduler({ executor, clock: () => 10_000 });
  const schedulerEvents: SchedulerEvent[] = [];
  scheduler.onEvent((event) => schedulerEvents.push(event));
  const host = new ObservationHost({
    scheduler,
    limits: LIMITS,
    clock: () => 10_000,
    createId: () => "observation-action-1",
    getCapabilities: () => ({
      renderer: {
        motions: ["bow", "wave"],
        expressions: ["normal", "blink"],
        lookDirection: true,
        outfits: [],
        mediaReaction: true,
      },
      window: true,
      timer: true,
      speech: false,
    }),
  });
  host.configure({
    enabled: true,
    diagnosticsEnabled: true,
    grants: [{
      source: { kind: "plugin", id: "dev-agent-hooks" },
      eventTypes: ["dev-agent.status"],
      maxSensitivity: "status",
    }, {
      source: { kind: "system", id: "windows-media-session" },
      eventTypes: ["media.playback"],
      maxSensitivity: "status",
    }],
  });
  return { executor, scheduler, schedulerEvents, host };
}

describe("ObservationHost", () => {
  it("maps an authorized completion event through the existing scheduler", async () => {
    const { executor, schedulerEvents, host } = createHost();
    const result = host.ingest(devEvent("completed"));
    expect(result).toMatchObject({
      status: "scheduled",
      action: { type: "motion.play", payload: { motion: "wave" }, source: "system" },
    });
    expect(schedulerEvents.find((event) => event.type === "started")).toMatchObject({ priority: "agent" });
    await Promise.resolve();
    expect(executor.actions).toHaveLength(1);
  });

  it("keeps working status as a no-op instead of inventing a noisy reaction", () => {
    const { host } = createHost();
    expect(host.ingest(devEvent("working"))).toMatchObject({ status: "ignored" });
  });

  it("maps system playback to the dedicated sustained media action", () => {
    const { host } = createHost();
    const result = host.ingest({
      protocolVersion: OBSERVATION_PROTOCOL_VERSION,
      id: "media-playing",
      source: { kind: "system", id: "windows-media-session" },
      type: "media.playback",
      observedAt: 10_000,
      sensitivity: "status",
      payload: { state: "playing" },
    });
    expect(result).toMatchObject({
      status: "scheduled",
      action: { type: "media.react", payload: { state: "playing" } },
    });
  });

  it("rejects ungranted sources and retains only redacted diagnostics", () => {
    const { host } = createHost();
    const input = {
      ...devEvent("completed"),
      id: "foreign-event",
      source: { kind: "plugin", id: "foreign-plugin" },
    };
    expect(host.ingest(input)).toMatchObject({ status: "rejected", code: "source_not_allowed" });
    expect(host.getDiagnostics()).toEqual([
      expect.objectContaining({
        eventId: "foreign-event",
        sourceId: "foreign-plugin",
        eventType: "dev-agent.status",
        outcome: "rejected",
      }),
    ]);
    expect(JSON.stringify(host.getDiagnostics())).not.toContain("payload");
  });

  it("does not schedule reactions while globally paused", () => {
    const { executor, host } = createHost();
    host.configure({ enabled: false, diagnosticsEnabled: true, grants: [] });
    expect(host.ingest(devEvent("completed"))).toMatchObject({ status: "rejected", code: "paused" });
    expect(executor.actions).toHaveLength(0);
  });

  it("bounds the in-memory diagnostic ring", () => {
    const { host } = createHost();
    host.ingest(devEvent("working", "e1"));
    host.ingest(devEvent("working", "e2"));
    host.ingest(devEvent("working", "e3"));
    host.ingest(devEvent("working", "e4"));
    expect(host.getDiagnostics().map((entry) => entry.eventId)).toEqual(["e2", "e3", "e4"]);
  });
});
