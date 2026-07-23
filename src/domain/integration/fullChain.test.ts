import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WindowTarget } from "../actions/types";
import type { CapabilitySet, RendererCapabilities } from "../capabilities/capabilities";
import type { MotionOptions, ExpressionOptions, ResetReason, CharacterRenderer, WindowController } from "../controllers/types";
import type { SchedulerEvent } from "../scheduler/types";
import { validateActionRequest } from "../validation/validate";
import { BehaviorScheduler } from "../scheduler/scheduler";
import { PetActionExecutor } from "../controllers/executor";
import { getDefaultChannel } from "../scheduler/channelPolicy";

// ─── Fake Controllers ───────────────────────────────────────────────────────

class FakeRenderer implements CharacterRenderer {
  calls: { method: string; args: unknown[] }[] = [];
  resetCalls: ResetReason[] = [];
  disposed = false;
  private motionResolvers = new Map<string, () => void>();

  getCapabilities(): RendererCapabilities {
    return { motions: ["wave", "idle"], expressions: ["normal", "blink", "happy"], lookDirection: true, outfits: ["default"], mediaReaction: true };
  }

  async playMotion(name: string, options?: MotionOptions): Promise<void> {
    this.calls.push({ method: "playMotion", args: [name, options] });
    return new Promise<void>((resolve) => {
      this.motionResolvers.set(name, resolve);
    });
  }

  completeMotion(name: string): void {
    const r = this.motionResolvers.get(name);
    if (r) { this.motionResolvers.delete(name); r(); }
  }

  setLookDirection(x: number, y: number): void {
    this.calls.push({ method: "setLookDirection", args: [x, y] });
  }

  async setExpression(name: string, options?: ExpressionOptions): Promise<void> {
    this.calls.push({ method: "setExpression", args: [name, options] });
  }

  async equipOutfit(outfitId: string): Promise<void> {
    this.calls.push({ method: "equipOutfit", args: [outfitId] });
  }

  setMediaReaction(state: "playing" | "paused" | "stopped"): void {
    this.calls.push({ method: "setMediaReaction", args: [state] });
  }

  reset(reason: ResetReason): void {
    this.resetCalls.push(reason);
  }

  dispose(): void { this.disposed = true; }
}

class FakeWindowController implements WindowController {
  calls: { method: string; args: unknown[] }[] = [];
  private moveResolver: (() => void) | null = null;
  disposed = false;

  async moveTo(target: WindowTarget, options?: { durationMs?: number; signal?: AbortSignal }): Promise<void> {
    this.calls.push({ method: "moveTo", args: [target, options] });
    return new Promise<void>((resolve) => { this.moveResolver = resolve; });
  }

  completeMove(): void { this.moveResolver?.(); this.moveResolver = null; }

  async getPosition(): Promise<{ x: number; y: number }> { return { x: 0, y: 0 }; }
  async setAlwaysOnTop(value: boolean): Promise<void> { this.calls.push({ method: "setAlwaysOnTop", args: [value] }); }
  async center(): Promise<void> { this.calls.push({ method: "center", args: [] }); }
  dispose(): void { this.disposed = true; }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Flush microtask queue (multiple rounds to settle deep promise chains) */
async function flush(): Promise<void> {
  // Need enough rounds for: renderer promise → withAbort → async follow → execute → scheduler .then()
  for (let i = 0; i < 6; i++) {
    await new Promise<void>((r) => r());
  }
}

/** Build raw (untrusted) input similar to what LLM would send */
function rawInput(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    protocolVersion: 1,
    id: "test-1",
    type: "motion.play",
    source: "dev",
    requestedAt: 1000,
    payload: {},
    ...overrides,
  };
}

/** Create full integration fixture */
interface FullFixture {
  renderer: FakeRenderer;
  windowController: FakeWindowController;
  executor: PetActionExecutor;
  scheduler: BehaviorScheduler;
  events: SchedulerEvent[];
}

function createFullFixture(): FullFixture {
  const renderer = new FakeRenderer();
  const windowController = new FakeWindowController();
  const executor = new PetActionExecutor({ renderer, windowController });
  const scheduler = new BehaviorScheduler({ executor });
  const events: SchedulerEvent[] = [];
  scheduler.onEvent((e: SchedulerEvent) => events.push(e));
  return { renderer, windowController, executor, scheduler, events };
}

/** Build a CapabilitySet from the FakeRenderer's capabilities */
function rendererCapabilities(renderer: FakeRenderer): CapabilitySet {
  return {
    renderer: renderer.getCapabilities(),
    window: true,
    speech: false,
    timer: false,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("完整链路：合法输入从校验到执行", () => {
  let ctx: FullFixture;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFullFixture();
  });

  afterEach(() => {
    ctx.scheduler.dispose();
    vi.useRealTimers();
  });

  it("合法的 motion.play 从校验到调度到执行器", async () => {
    const input = rawInput({ type: "motion.play", payload: { motion: "wave" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const action = validation.action;

    const channel = getDefaultChannel(action.type)!;
    ctx.scheduler.submit(action, { channel });

    // Scheduler should have called renderer
    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("playMotion");
    expect(ctx.renderer.calls[0].args[0]).toBe("wave");
    expect(ctx.renderer.calls[0].args[1]).toMatchObject({ speed: 1 });
    expect((ctx.renderer.calls[0].args[1] as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);

    // Complete the motion
    ctx.renderer.completeMotion("wave");
    await flush();

    const completed = ctx.events.filter((e) => e.type === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].actionId).toBe("test-1");
  });

  it("合法的 look.set 从校验到执行器", async () => {
    const input = rawInput({ type: "look.set", payload: { x: 0.5, y: -0.3 } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const action = validation.action;

    const channel = getDefaultChannel(action.type)!;
    ctx.scheduler.submit(action, { channel });

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("setLookDirection");
    expect(ctx.renderer.calls[0].args).toEqual([0.5, -0.3]);

    await flush();

    const completed = ctx.events.filter((e) => e.type === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].actionId).toBe("test-1");
  });

  it("合法的 expression.set 从校验到执行器", async () => {
    const input = rawInput({ type: "expression.set", payload: { expression: "happy" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const action = validation.action;

    const channel = getDefaultChannel(action.type)!;
    ctx.scheduler.submit(action, { channel });

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("setExpression");
    expect(ctx.renderer.calls[0].args).toEqual(["happy", { durationMs: undefined }]);
  });

  it("合法的 window.move 从校验到执行器", async () => {
    const input = rawInput({ type: "window.move", payload: { target: { kind: "semantic", position: "center" } } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const action = validation.action;

    const channel = getDefaultChannel(action.type)!;
    ctx.scheduler.submit(action, { channel });

    expect(ctx.windowController.calls.length).toBe(1);
    expect(ctx.windowController.calls[0].method).toBe("moveTo");
    expect(ctx.windowController.calls[0].args[0]).toEqual({ kind: "semantic", position: "center" });

    // Complete the move
    ctx.windowController.completeMove();
    await flush();

    const completed = ctx.events.filter((e) => e.type === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].actionId).toBe("test-1");
  });

  it("合法的 outfit.equip 从校验到执行器", async () => {
    const input = rawInput({ type: "outfit.equip", payload: { outfitId: "default" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const action = validation.action;

    const channel = getDefaultChannel(action.type)!;
    ctx.scheduler.submit(action, { channel });

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("equipOutfit");
    expect(ctx.renderer.calls[0].args).toEqual(["default"]);
  });
});

describe("完整链路：非法输入在校验阶段被拒绝", () => {
  it("未知动作类型不进入调度器", () => {
    const input = rawInput({ type: "unknown.action" });
    const result = validateActionRequest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("invalid_payload");
    // Validation failure means scheduler was never reached
  });

  it("越界 look.set 不进入调度器", () => {
    const input = rawInput({ type: "look.set", payload: { x: 2.0, y: 0 } });
    const result = validateActionRequest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("invalid_payload");
  });

  it("NaN 值不进入调度器", () => {
    const input = rawInput({ type: "look.set", payload: { x: NaN, y: 0 } });
    const result = validateActionRequest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("invalid_payload");
  });

  it("未知协议版本不进入调度器", () => {
    const input = rawInput({ protocolVersion: 99 });
    const result = validateActionRequest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("invalid_payload");
  });
});

describe("完整链路：能力不足被拒绝", () => {
  it("渲染器不支持的动作在能力检查阶段被拒绝", () => {
    const capabilities: CapabilitySet = {
      renderer: { motions: ["wave", "idle"], expressions: ["normal"], lookDirection: true, outfits: [] },
      window: true,
      speech: false,
      timer: false,
    };
    const input = rawInput({ type: "motion.play", payload: { motion: "dance" } });
    const result = validateActionRequest(input, { capabilities });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("unsupported_action");
  });

  it("无 window 能力时 window.move 被拒绝", () => {
    const capabilities: CapabilitySet = {
      renderer: { motions: ["wave"], expressions: ["normal"], lookDirection: true, outfits: [] },
      window: false,
      speech: false,
      timer: false,
    };
    const input = rawInput({ type: "window.move", payload: { target: { kind: "semantic", position: "center" } } });
    const result = validateActionRequest(input, { capabilities });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("unsupported_action");
  });
});

describe("完整链路：调度器中断传播到执行器", () => {
  let ctx: FullFixture;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFullFixture();
  });

  afterEach(() => {
    ctx.scheduler.dispose();
    vi.useRealTimers();
  });

  it("高优先级动作中断运行中的低优先级动作", () => {
    const lowInput = rawInput({ id: "low", type: "motion.play", payload: { motion: "wave" }, source: "agent" });
    const highInput = rawInput({ id: "high", type: "motion.play", payload: { motion: "wave" }, source: "user" });
    const capabilities = rendererCapabilities(ctx.renderer);

    const lowResult = validateActionRequest(lowInput, { capabilities });
    expect(lowResult.ok).toBe(true);
    if (!lowResult.ok) return;
    const highResult = validateActionRequest(highInput, { capabilities });
    expect(highResult.ok).toBe(true);
    if (!highResult.ok) return;

    // Submit low priority first
    ctx.scheduler.submit(lowResult.action, { channel: "body-motion" });

    // Verify low is running
    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("playMotion");

    // Submit high priority — should preempt
    ctx.scheduler.submit(highResult.action, { channel: "body-motion" });

    // Low should have been interrupted
    const interrupted = ctx.events.filter((e) => e.type === "interrupted");
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].actionId).toBe("low");

    // Renderer should have been reset for the interrupt
    expect(ctx.renderer.resetCalls).toContain("interrupt");

    // High should now be running (second playMotion call)
    expect(ctx.renderer.calls.length).toBe(2);
    expect(ctx.renderer.calls[1].method).toBe("playMotion");
  });

  it("取消运行中的动作触发执行器中断", () => {
    const input = rawInput({ id: "cancel-me", type: "motion.play", payload: { motion: "wave" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    ctx.scheduler.submit(validation.action, { channel: "body-motion" });

    // Now cancel it
    const cancelled = ctx.scheduler.cancel("cancel-me");
    expect(cancelled).toBe(true);

    // Should have "cancelled" event
    const cancelledEvts = ctx.events.filter((e) => e.type === "cancelled");
    expect(cancelledEvts).toHaveLength(1);
    expect(cancelledEvts[0].actionId).toBe("cancel-me");

    // Executor should have called renderer.reset("interrupt") via abort handler
    expect(ctx.renderer.resetCalls).toContain("interrupt");
  });
});

describe("完整链路：默认值正确传播", () => {
  let ctx: FullFixture;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFullFixture();
  });

  afterEach(() => {
    ctx.scheduler.dispose();
    vi.useRealTimers();
  });

  it("motion.play 缺省 speed 默认为 1 传播到执行器", () => {
    const input = rawInput({ type: "motion.play", payload: { motion: "wave" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    // After validation, default speed=1 should be applied
    expect((validation.action.payload as { motion: string; speed?: number }).speed).toBe(1);

    const channel = getDefaultChannel(validation.action.type)!;
    ctx.scheduler.submit(validation.action, { channel });

    // Executor should pass speed: 1 to renderer
    expect(ctx.renderer.calls[0].args[0]).toBe("wave");
    expect(ctx.renderer.calls[0].args[1]).toMatchObject({ speed: 1 });
    expect((ctx.renderer.calls[0].args[1] as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });

  it("speech.say 缺省 interrupt 默认为 true，提交到调度器后因能力未实现返回 rejected", async () => {
    const input = rawInput({ type: "speech.say", payload: { text: "你好" } });
    // speech 能力需要声明为 true 才能通过校验层；执行器内部会返回 rejected
    const capabilities: CapabilitySet = {
      renderer: ctx.renderer.getCapabilities(),
      window: true,
      speech: true,
      timer: false,
    };
    const validation = validateActionRequest(input, { capabilities });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    // After validation, default interrupt=true should be applied
    expect((validation.action.payload as { text: string; interrupt?: boolean }).interrupt).toBe(true);

    const channel = getDefaultChannel(validation.action.type)!;
    ctx.scheduler.submit(validation.action, { channel });

    // Speech not implemented → executor returns rejected
    await flush();

    const rejected = ctx.events.filter((e) => e.type === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].actionId).toBe("test-1");
  });
});

describe("完整链路：事件追踪完整性", () => {
  let ctx: FullFixture;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFullFixture();
  });

  afterEach(() => {
    ctx.scheduler.dispose();
    vi.useRealTimers();
  });

  it("完整生命周期事件序列：submitted → started → completed", async () => {
    const input = rawInput({ id: "lifecycle-1", type: "motion.play", payload: { motion: "wave" } });
    const capabilities = rendererCapabilities(ctx.renderer);
    const validation = validateActionRequest(input, { capabilities });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    ctx.scheduler.submit(validation.action, { channel: "body-motion" });

    // Complete the motion
    ctx.renderer.completeMotion("wave");
    await flush();

    // Collect events for this action, sorted by timestamp
    const actionEvents = ctx.events.filter((e) => e.actionId === "lifecycle-1");
    const types = actionEvents.map((e) => e.type);
    expect(types).toEqual(["submitted", "started", "completed"]);

    // Each event should have the full field set
    for (const evt of actionEvents) {
      expect(evt.actionId).toBe("lifecycle-1");
      expect(evt.actionType).toBe("motion.play");
      expect(evt.source).toBe("dev");
      expect(evt.channel).toBe("body-motion");
      expect(evt.priority).toBeDefined();
      expect(typeof evt.timestamp).toBe("number");
    }
  });

  it("完整生命周期事件序列：submitted → started → interrupted", () => {
    const lowInput = rawInput({ id: "low-event", type: "motion.play", payload: { motion: "wave" }, source: "agent" });
    const highInput = rawInput({ id: "high-event", type: "motion.play", payload: { motion: "wave" }, source: "user" });
    const capabilities = rendererCapabilities(ctx.renderer);

    const lowResult = validateActionRequest(lowInput, { capabilities });
    expect(lowResult.ok).toBe(true);
    if (!lowResult.ok) return;
    const highResult = validateActionRequest(highInput, { capabilities });
    expect(highResult.ok).toBe(true);
    if (!highResult.ok) return;

    ctx.scheduler.submit(lowResult.action, { channel: "body-motion" });
    ctx.scheduler.submit(highResult.action, { channel: "body-motion" });

    // Low: submitted → started → interrupted
    const lowEvents = ctx.events.filter((e) => e.actionId === "low-event");
    const lowTypes = lowEvents.map((e) => e.type);
    expect(lowTypes).toEqual(["submitted", "started", "interrupted"]);

    // High: submitted → started
    const highEvents = ctx.events.filter((e) => e.actionId === "high-event");
    const highTypes = highEvents.map((e) => e.type);
    expect(highTypes).toEqual(["submitted", "started"]);
  });
});

describe("完整链路：脚本化动作序列", () => {
  let ctx: FullFixture;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFullFixture();
  });

  afterEach(() => {
    ctx.scheduler.dispose();
    vi.useRealTimers();
  });

  it("连续提交 look.set → motion.play → wait 序列", async () => {
    const capabilities = rendererCapabilities(ctx.renderer);

    // 1. look.set
    const lookInput = rawInput({ id: "look-seq", type: "look.set", payload: { x: 0.5, y: -0.3 } });
    const lookResult = validateActionRequest(lookInput, { capabilities });
    expect(lookResult.ok).toBe(true);
    if (!lookResult.ok) return;

    // 2. motion.play
    const motionInput = rawInput({ id: "motion-seq", type: "motion.play", payload: { motion: "wave" } });
    const motionResult = validateActionRequest(motionInput, { capabilities });
    expect(motionResult.ok).toBe(true);
    if (!motionResult.ok) return;

    // 3. wait
    const waitInput = rawInput({ id: "wait-seq", type: "wait", payload: { durationMs: 500 } });
    const waitResult = validateActionRequest(waitInput, { capabilities });
    expect(waitResult.ok).toBe(true);
    if (!waitResult.ok) return;

    // Submit all three
    ctx.scheduler.submit(lookResult.action, { channel: "gaze-expression" });
    ctx.scheduler.submit(motionResult.action, { channel: "body-motion" });
    ctx.scheduler.submit(waitResult.action, { channel: "timer" });

    // look.set should have been called, motion.play started, wait started
    expect(ctx.renderer.calls.some((c) => c.method === "setLookDirection")).toBe(true);
    expect(ctx.renderer.calls.some((c) => c.method === "playMotion")).toBe(true);

    // Flush microtasks to settle look.set completion
    await flush();

    // look.set should be completed
    const lookCompleted = ctx.events.filter((e) => e.actionId === "look-seq" && e.type === "completed");
    expect(lookCompleted).toHaveLength(1);

    // Advance timers for wait duration
    vi.advanceTimersByTime(500);

    // wait should be completed
    const waitCompleted = ctx.events.filter((e) => e.actionId === "wait-seq" && e.type === "completed");
    expect(waitCompleted).toHaveLength(1);

    // Complete the motion
    ctx.renderer.completeMotion("wave");
    await flush();

    const motionCompleted = ctx.events.filter((e) => e.actionId === "motion-seq" && e.type === "completed");
    expect(motionCompleted).toHaveLength(1);
  });

  it("取消所有动作清空队列和运行中动作", () => {
    const capabilities = rendererCapabilities(ctx.renderer);

    // Submit 3 actions: 2 on body-motion (same mutex group), 1 on gaze-expression
    const a1Input = rawInput({ id: "a1", type: "motion.play", payload: { motion: "wave" } });
    const a2Input = rawInput({ id: "a2", type: "motion.play", payload: { motion: "wave" } });
    const a3Input = rawInput({ id: "a3", type: "look.set", payload: { x: 0, y: 0 } });

    const v1 = validateActionRequest(a1Input, { capabilities });
    const v2 = validateActionRequest(a2Input, { capabilities });
    const v3 = validateActionRequest(a3Input, { capabilities });
    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(true);
    expect(v3.ok).toBe(true);
    if (!v1.ok || !v2.ok || !v3.ok) return;

    ctx.scheduler.submit(v1.action, { channel: "body-motion" }); // runs
    ctx.scheduler.submit(v2.action, { channel: "body-motion" }); // queues
    ctx.scheduler.submit(v3.action, { channel: "gaze-expression" }); // runs

    // One running on body-motion, one queued, one running on gaze-expression
    expect(ctx.scheduler.getActiveActions()).toHaveLength(2);
    expect(ctx.scheduler.getPendingActions()).toHaveLength(1);

    // Cancel all
    ctx.scheduler.cancelAll();

    const cancelledEvts = ctx.events.filter((e) => e.type === "cancelled");
    // All 3 should have cancelled events
    expect(cancelledEvts).toHaveLength(3);
    const cancelledIds = cancelledEvts.map((e) => e.actionId).sort();
    expect(cancelledIds).toEqual(["a1", "a2", "a3"]);

    // Queues should be empty
    expect(ctx.scheduler.getActiveActions()).toHaveLength(0);
    expect(ctx.scheduler.getPendingActions()).toHaveLength(0);
  });
});
