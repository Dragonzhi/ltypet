import { describe, expect, it } from "vitest";
import type { MotionClipV1 } from "@ltypet/character-motion";
import { collectCrossedEvents, getPlaybackPosition } from "./playbackMath";

const clip: MotionClipV1 = {
  id: "test",
  fps: 10,
  durationFrames: 10,
  loop: "none",
  tracks: [],
  events: [
    { frame: 0, type: "blink" },
    { frame: 4, type: "mouthOpen" },
    { frame: 10, type: "mouthClose" },
  ],
};

describe("运行时帧推进", () => {
  it("按 elapsed、fps 和 speed 计算并精确落到末帧", () => {
    expect(getPlaybackPosition(250, clip, 2)).toMatchObject({
      absoluteFrame: 5,
      sampleFrame: 5,
      completed: false,
    });
    expect(getPlaybackPosition(500, clip, 2)).toMatchObject({
      absoluteFrame: 10,
      sampleFrame: 10,
      completed: true,
    });
  });

  it("repeat 跨多圈时保留绝对帧并包装采样帧", () => {
    expect(getPlaybackPosition(2500, { ...clip, loop: "repeat" }, 1)).toMatchObject({
      absoluteFrame: 25,
      sampleFrame: 5,
      completed: false,
    });
  });

  it("收集起始帧、跨帧和末帧事件且不重复", () => {
    expect(collectCrossedEvents(clip, -Number.EPSILON, 4).map(({ event }) => event.type))
      .toEqual(["blink", "mouthOpen"]);
    expect(collectCrossedEvents(clip, 4, 10).map(({ event }) => event.type))
      .toEqual(["mouthClose"]);
  });

  it("repeat 一次 RAF 跨多圈时逐圈收集事件", () => {
    const repeated = { ...clip, loop: "repeat" as const };
    const events = collectCrossedEvents(repeated, 1, 24);
    expect(events.filter(({ event }) => event.type === "mouthOpen")).toHaveLength(3);
  });
});
