import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ActionRequest, ActionSource, WindowTarget } from "../actions/types";
import type { MotionOptions, ExpressionOptions, ResetReason } from "./types";
import { PetActionExecutor } from "./executor";

// --- Fake controllers (structural duck typing, no implements keyword to avoid import issues) ---

class FakeRenderer {
  motions: string[] = ["wave"];
  expressions: string[] = ["normal", "blink", "speak", "sleep"];
  lookDirection = true;
  outfits: string[] = [];
  calls: { method: string; args: unknown[] }[] = [];
  private motionResolvers = new Map<string, () => void>();
  private motionRejecters = new Map<string, (e: Error) => void>();
  private outfitResolver: (() => void) | null = null;
  private outfitRejecter: ((e: Error) => void) | null = null;
  resetCalls: ResetReason[] = [];
  disposed = false;

  getCapabilities() {
    return { motions: this.motions, expressions: this.expressions, lookDirection: this.lookDirection, outfits: this.outfits };
  }
  playMotion(name: string, options?: MotionOptions): Promise<void> {
    this.calls.push({ method: "playMotion", args: [name, options] });
    return new Promise<void>((resolve, reject) => {
      this.motionResolvers.set(name, resolve);
      this.motionRejecters.set(name, reject);
    });
  }
  completeMotion(name: string) {
    this.motionResolvers.get(name)?.();
    this.motionResolvers.delete(name);
    this.motionRejecters.delete(name);
  }
  rejectMotion(name: string, error: Error) {
    this.motionRejecters.get(name)?.(error);
    this.motionResolvers.delete(name);
    this.motionRejecters.delete(name);
  }
  setLookDirection(x: number, y: number): void {
    this.calls.push({ method: "setLookDirection", args: [x, y] });
  }
  async setExpression(name: string, options?: ExpressionOptions): Promise<void> {
    this.calls.push({ method: "setExpression", args: [name, options] });
  }
  async equipOutfit(outfitId: string): Promise<void> {
    this.calls.push({ method: "equipOutfit", args: [outfitId] });
    return new Promise<void>((resolve, reject) => {
      this.outfitResolver = resolve;
      this.outfitRejecter = reject;
    });
  }
  completeOutfit() {
    this.outfitResolver?.();
    this.outfitResolver = null;
    this.outfitRejecter = null;
  }
  rejectOutfit(error: Error) {
    this.outfitRejecter?.(error);
    this.outfitResolver = null;
    this.outfitRejecter = null;
  }
  reset(reason: ResetReason): void {
    this.resetCalls.push(reason);
  }
  dispose(): void { this.disposed = true; }
}

class FakeWindowController {
  calls: { method: string; args: unknown[] }[] = [];
  private moveResolver: (() => void) | null = null;
  private moveRejecter: ((e: Error) => void) | null = null;
  disposed = false;

  async moveTo(target: WindowTarget, options?: { durationMs?: number; signal?: AbortSignal }): Promise<void> {
    this.calls.push({ method: "moveTo", args: [target, options] });
    return new Promise<void>((resolve, reject) => {
      this.moveResolver = resolve;
      this.moveRejecter = reject;
    });
  }
  completeMove() { this.moveResolver?.(); this.moveResolver = null; this.moveRejecter = null; }
  rejectMove(e: Error) { this.moveRejecter?.(e); this.moveResolver = null; this.moveRejecter = null; }
  async getPosition() { return { x: 0, y: 0 }; }
  async setAlwaysOnTop(value: boolean) { this.calls.push({ method: "setAlwaysOnTop", args: [value] }); }
  async center() { this.calls.push({ method: "center", args: [] }); }
  dispose(): void { this.disposed = true; }
}

function makeAction(id: string, type: string, payload: Record<string, unknown>, source: ActionSource = "dev"): ActionRequest {
  return { id, type, payload, source, requestedAt: 1000 } as unknown as ActionRequest;
}

// --- Shared test setup helper ---

interface TestContext {
  renderer: FakeRenderer;
  windowController: FakeWindowController;
  executor: PetActionExecutor;
  signal: AbortSignal;
  abortController: AbortController;
}

function createFixture(): TestContext {
  const renderer = new FakeRenderer();
  const windowController = new FakeWindowController();
  const executor = new PetActionExecutor({ renderer, windowController });
  const abortController = new AbortController();
  const signal = abortController.signal;
  return { renderer, windowController, executor, signal, abortController };
}

// --- Tests ---

describe("motion.play 分发", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("调用 renderer.playMotion 并返回 completed", async () => {
    const action = makeAction("test-1", "motion.play", { motion: "wave", speed: 2 });
    const promise = ctx.executor.execute(action, ctx.signal);

    // Allow microtasks to settle so the call is registered
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("playMotion");
    expect(ctx.renderer.calls[0].args).toEqual([
      "wave",
      { speed: 2, signal: ctx.signal },
    ]);

    // Complete the motion
    ctx.renderer.completeMotion("wave");

    const result = await promise;
    expect(result.status).toBe("completed");
    expect(result.actionId).toBe("test-1");
  });

  it("中断时调用 renderer.reset 并返回 interrupted", async () => {
    const action = makeAction("test-2", "motion.play", { motion: "wave" });
    const promise = ctx.executor.execute(action, ctx.signal);

    // Allow the call to register
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.renderer.calls.length).toBe(1);

    // Abort the signal
    ctx.abortController.abort();

    // Allow microtasks to settle
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.status).toBe("interrupted");
    expect(result.actionId).toBe("test-2");
    expect(ctx.renderer.resetCalls).toContain("interrupt");
  });

  it("渲染器抛出异常时返回 failed", async () => {
    const action = makeAction("test-3", "motion.play", { motion: "wave" });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    // Reject the motion
    ctx.renderer.rejectMotion("wave", new Error("渲染失败"));

    const result = await promise;
    expect(result.status).toBe("failed");
    expect(result.actionId).toBe("test-3");
    expect(result.reason).toContain("渲染失败");
  });

  it("渲染器已知不可用错误映射为 rejected", async () => {
    const action = makeAction("test-known-error", "motion.play", { motion: "wave" });
    const promise = ctx.executor.execute(action, ctx.signal);
    await vi.advanceTimersByTimeAsync(0);
    const error = Object.assign(new Error("动作尚未就绪"), {
      code: "renderer_unavailable",
    });
    ctx.renderer.rejectMotion("wave", error);
    await expect(promise).resolves.toMatchObject({
      status: "rejected",
      errorCode: "renderer_unavailable",
    });
  });

  it("信号已中断时立即返回 interrupted", async () => {
    // Pre-abort the signal
    ctx.abortController.abort();

    const action = makeAction("test-4", "motion.play", { motion: "wave" });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("interrupted");
    expect(result.actionId).toBe("test-4");
    // Renderer should not have been called
    expect(ctx.renderer.calls.length).toBe(0);
  });
});

describe("expression.set 分发", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("调用 renderer.setExpression 并返回 completed", async () => {
    const action = makeAction("test-5", "expression.set", { expression: "blink", durationMs: 200 });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("setExpression");
    expect(ctx.renderer.calls[0].args).toEqual(["blink", { durationMs: 200 }]);
    expect(result.status).toBe("completed");
    expect(result.actionId).toBe("test-5");
  });
});

describe("look.set 分发", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("调用 renderer.setLookDirection 并返回 completed", async () => {
    const action = makeAction("test-6", "look.set", { x: 0.5, y: -0.3 });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("setLookDirection");
    expect(ctx.renderer.calls[0].args).toEqual([0.5, -0.3]);
    expect(result.status).toBe("completed");
    expect(result.actionId).toBe("test-6");
  });
});

describe("window.move 分发", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("调用 windowController.moveTo 并返回 completed", async () => {
    const target: WindowTarget = { kind: "semantic", position: "center" };
    const action = makeAction("test-7", "window.move", { target, durationMs: 300 });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.windowController.calls.length).toBe(1);
    expect(ctx.windowController.calls[0].method).toBe("moveTo");
    expect(ctx.windowController.calls[0].args[0]).toEqual(target);
    const moveOptions = ctx.windowController.calls[0].args[1] as { durationMs?: number; signal?: AbortSignal };
    expect(moveOptions.durationMs).toBe(300);
    expect(moveOptions.signal).toBeDefined();

    ctx.windowController.completeMove();

    const result = await promise;
    expect(result.status).toBe("completed");
    expect(result.actionId).toBe("test-7");
  });

  it("中断时返回 interrupted（不调用 renderer.reset）", async () => {
    const target: WindowTarget = { kind: "semantic", position: "center" };
    const action = makeAction("test-8", "window.move", { target });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    ctx.abortController.abort();

    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.status).toBe("interrupted");
    expect(result.actionId).toBe("test-8");
    // Renderer should not be reset for window operations
    expect(ctx.renderer.resetCalls.length).toBe(0);
  });

  it("窗口控制器抛出异常时返回 failed", async () => {
    const target: WindowTarget = { kind: "semantic", position: "center" };
    const action = makeAction("test-9", "window.move", { target });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    ctx.windowController.rejectMove(new Error("移动失败"));

    const result = await promise;
    expect(result.status).toBe("failed");
    expect(result.actionId).toBe("test-9");
    expect(result.reason).toContain("移动失败");
  });
});

describe("outfit.equip 分发", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("调用 renderer.equipOutfit 并返回 completed", async () => {
    const action = makeAction("test-10", "outfit.equip", { outfitId: "dress-red" });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.renderer.calls.length).toBe(1);
    expect(ctx.renderer.calls[0].method).toBe("equipOutfit");
    expect(ctx.renderer.calls[0].args).toEqual(["dress-red"]);

    ctx.renderer.completeOutfit();

    const result = await promise;
    expect(result.status).toBe("completed");
    expect(result.actionId).toBe("test-10");
  });

  it("中断时调用 renderer.reset 并返回 interrupted", async () => {
    const action = makeAction("test-11", "outfit.equip", { outfitId: "dress-red" });
    const promise = ctx.executor.execute(action, ctx.signal);

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.renderer.calls.length).toBe(1);

    ctx.abortController.abort();

    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.status).toBe("interrupted");
    expect(result.actionId).toBe("test-11");
    expect(ctx.renderer.resetCalls).toContain("interrupt");
  });
});

describe("未实现的能力返回 rejected", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    ctx.executor.dispose();
    vi.useRealTimers();
  });

  it("speech.say 返回 rejected 和 renderer_unavailable", async () => {
    const action = makeAction("test-u1", "speech.say", { text: "你好" });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("rejected");
    expect(result.errorCode).toBe("renderer_unavailable");
    expect(result.actionId).toBe("test-u1");
  });

  it("timer.start 返回 rejected 和 renderer_unavailable", async () => {
    const action = makeAction("test-u2", "timer.start", { durationMs: 5000 });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("rejected");
    expect(result.errorCode).toBe("renderer_unavailable");
  });

  it("timer.pause 返回 rejected 和 renderer_unavailable", async () => {
    const action = makeAction("test-u3", "timer.pause", { timerId: "t1" });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("rejected");
    expect(result.errorCode).toBe("renderer_unavailable");
  });

  it("timer.cancel 返回 rejected 和 renderer_unavailable", async () => {
    const action = makeAction("test-u4", "timer.cancel", { timerId: "t1" });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("rejected");
    expect(result.errorCode).toBe("renderer_unavailable");
  });

  it("wait 返回 rejected（不应到达执行器）", async () => {
    const action = makeAction("test-u5", "wait", { durationMs: 1000 });
    const result = await ctx.executor.execute(action, ctx.signal);

    expect(result.status).toBe("rejected");
    expect(result.errorCode).toBe("unsupported_action");
    expect(result.reason).toContain("不应到达执行器");
  });
});

describe("释放", () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispose 调用 renderer.dispose 和 windowController.dispose", async () => {
    expect(ctx.renderer.disposed).toBe(false);
    expect(ctx.windowController.disposed).toBe(false);

    ctx.executor.dispose();

    expect(ctx.renderer.disposed).toBe(true);
    expect(ctx.windowController.disposed).toBe(true);
  });

  it("dispose 后 execute 抛出错误", async () => {
    ctx.executor.dispose();

    const action = makeAction("test-d1", "look.set", { x: 0, y: 0 });
    await expect(ctx.executor.execute(action, ctx.signal)).rejects.toThrow("disposed");
  });
});

describe("自定义时钟", () => {
  it("使用注入的时钟生成 finishedAt", async () => {
    const renderer = new FakeRenderer();
    const windowController = new FakeWindowController();
    const clock = () => 99999;
    const executor = new PetActionExecutor({ renderer, windowController, clock });

    const action = makeAction("test-c1", "look.set", { x: 0, y: 0 });
    const result = await executor.execute(action, new AbortController().signal);

    expect(result.finishedAt).toBe(99999);

    executor.dispose();
  });
});

describe("ActionResult 字段完整性", () => {
  it("结果包含 actionId 和 finishedAt", async () => {
    const renderer = new FakeRenderer();
    const windowController = new FakeWindowController();
    const executor = new PetActionExecutor({ renderer, windowController });

    const action = makeAction("test-f1", "look.set", { x: 0, y: 0 });
    const result = await executor.execute(action, new AbortController().signal);

    expect(result.actionId).toBe("test-f1");
    expect(typeof result.finishedAt).toBe("number");

    executor.dispose();
  });
});
