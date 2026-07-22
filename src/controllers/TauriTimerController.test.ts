import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerSnapshot, TimerStateEvent } from "../domain/controllers/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

import { TauriTimerController, TimerControllerError } from "./TauriTimerController";

function snapshot(timerId = "timer-1"): TimerSnapshot {
  return {
    schemaVersion: 1,
    timerId,
    kind: "focus",
    label: "专注",
    status: "running",
    durationMs: 60_000,
    remainingMs: 60_000,
    startedAtUnixMs: 1_000,
    updatedAtUnixMs: 1_000,
    deadlineUnixMs: 61_000,
    showSystemReminder: true,
    soundEnabled: true,
  };
}

describe("TauriTimerController", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    mocks.unlisten.mockReset();
    mocks.listeners.clear();
    mocks.listen.mockImplementation(async (eventName: string, listener: (event: { payload: unknown }) => void) => {
      mocks.listeners.set(eventName, listener);
      return mocks.unlisten;
    });
  });

  it("把统一接口映射到原生命令", async () => {
    mocks.invoke.mockResolvedValue(snapshot());
    const controller = new TauriTimerController();

    await controller.start({ timerId: "timer-1", durationMs: 60_000, kind: "focus" });
    await controller.pause("timer-1");
    await controller.resume("timer-1");
    await controller.cancel("timer-1");

    expect(mocks.invoke.mock.calls).toEqual([
      ["timer_start", { request: { timerId: "timer-1", durationMs: 60_000, kind: "focus" } }],
      ["timer_pause", { timerId: "timer-1" }],
      ["timer_resume", { timerId: "timer-1" }],
      ["timer_cancel", { timerId: "timer-1" }],
    ]);
  });

  it("转发状态事件并在清理后注销监听", async () => {
    const controller = new TauriTimerController();
    const listener = vi.fn();
    const cleanup = await controller.onStateChange(listener);
    const event: TimerStateEvent = { reason: "paused", timer: { ...snapshot(), status: "paused", deadlineUnixMs: null } };

    mocks.listeners.get("timer-state-changed")?.({ payload: event });
    expect(listener).toHaveBeenCalledWith(event);
    cleanup();
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  it("订阅完成信号后领取持久化的完成事件", async () => {
    const finished = { ...snapshot(), remainingMs: 0, deadlineUnixMs: 61_000 };
    mocks.invoke.mockImplementation(async (command: string) =>
      command === "timer_take_pending_finished" ? finished : null,
    );
    const controller = new TauriTimerController();
    const listener = vi.fn();

    await controller.onFinished(listener);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(finished);
  });

  it("保留 Rust 返回的结构化错误码", async () => {
    mocks.invoke.mockRejectedValue({ code: "timer_conflict", message: "已有计时" });
    const controller = new TauriTimerController();

    const error = await controller.start({ timerId: "timer-1", durationMs: 1_000 }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TimerControllerError);
    expect(error).toMatchObject({ code: "timer_conflict", message: "已有计时" });
  });
});
