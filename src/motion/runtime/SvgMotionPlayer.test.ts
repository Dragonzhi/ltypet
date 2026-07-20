import { describe, expect, it, vi } from "vitest";
import type { MotionClipV1 } from "@ltypet/character-motion";
import {
  MotionPlaybackInterruptedError,
  SvgMotionPlayer,
  type AnimationClock,
} from "./SvgMotionPlayer";

class FakeClock implements AnimationClock {
  time = 0;
  nextId = 1;
  callbacks = new Map<number, FrameRequestCallback>();
  now = () => this.time;
  request = (callback: FrameRequestCallback) => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };
  cancel = (id: number) => { this.callbacks.delete(id); };
  step(time: number) {
    this.time = time;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(time));
  }
}

const clip: MotionClipV1 = {
  id: "wave",
  fps: 10,
  durationFrames: 10,
  loop: "none",
  tracks: [],
  events: [{ frame: 5, type: "blink" }],
  suppressProceduralChannels: ["breathing"],
};

const createFixture = () => {
  const clock = new FakeClock();
  const target = { applyFrame: vi.fn(), restore: vi.fn() };
  const onSuppressionChange = vi.fn();
  const onBlink = vi.fn();
  const player = new SvgMotionPlayer(
    target,
    { onSuppressionChange, onBlink },
    clock,
  );
  return { clock, target, onSuppressionChange, onBlink, player };
};

describe("SvgMotionPlayer 生命周期", () => {
  it("采样中间帧和末帧后只恢复、结算一次", async () => {
    const fixture = createFixture();
    const promise = fixture.player.play({ clip });
    fixture.clock.step(500);
    expect(fixture.target.applyFrame).toHaveBeenLastCalledWith(clip, 5);
    expect(fixture.onBlink).toHaveBeenCalledTimes(1);
    fixture.clock.step(1000);
    await expect(promise).resolves.toBeUndefined();
    expect(fixture.target.restore).toHaveBeenCalledTimes(1);
    expect(fixture.onSuppressionChange).toHaveBeenLastCalledWith(new Set());
  });

  it("AbortSignal 中断 RAF 并拒绝 Promise", async () => {
    const fixture = createFixture();
    const controller = new AbortController();
    const promise = fixture.player.play({ clip, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(MotionPlaybackInterruptedError);
    expect(fixture.clock.callbacks.size).toBe(0);
    expect(fixture.target.restore).toHaveBeenCalledTimes(1);
  });

  it("reduced motion 走相同恢复路径且不持续补间", async () => {
    const fixture = createFixture();
    const promise = fixture.player.play({ clip, reducedMotion: true });
    expect(fixture.target.applyFrame).toHaveBeenCalledOnce();
    expect(fixture.target.applyFrame).toHaveBeenCalledWith(clip, 10);
    fixture.clock.step(0);
    await expect(promise).resolves.toBeUndefined();
    expect(fixture.target.restore).toHaveBeenCalledOnce();
  });

  it("新 session 会中断旧 session，旧 RAF 不能写入新动作", async () => {
    const fixture = createFixture();
    const first = fixture.player.play({ clip });
    const second = fixture.player.play({ clip });
    await expect(first).rejects.toBeInstanceOf(MotionPlaybackInterruptedError);
    fixture.clock.step(1000);
    await expect(second).resolves.toBeUndefined();
    expect(fixture.target.restore).toHaveBeenCalledTimes(2);
  });

  it("播放中 dispose 只结算和恢复一次", async () => {
    const fixture = createFixture();
    const promise = fixture.player.play({ clip });
    fixture.player.dispose();
    await expect(promise).rejects.toBeInstanceOf(MotionPlaybackInterruptedError);
    expect(fixture.target.restore).toHaveBeenCalledOnce();
    expect(fixture.clock.callbacks.size).toBe(0);
  });
});
