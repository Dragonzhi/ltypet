import { describe, it, expect } from "vitest";
import { samplePropertyAtFrame, sampleRenderSlotAtFrame } from "../src/timeline/sampleProperty";
import { wrapFrame, frameToTime, timeToFrame } from "../src/timeline/frameTime";
import { sampleMotionClip } from "../src/timeline/sampleClip";
import type { MotionKeyframeV1, MotionClipV1, CharacterRigV1 } from "../src/types";

describe("frameToTime / timeToFrame", () => {
  it("frame 24 at 24 fps = 1000ms", () => {
    expect(frameToTime(24, 24)).toBe(1000);
  });

  it("1000ms at 24 fps = 24", () => {
    expect(timeToFrame(1000, 24)).toBe(24);
  });

  it("handles non-positive fps", () => {
    expect(frameToTime(10, 0)).toBe(0);
    expect(timeToFrame(1000, -1)).toBe(0);
  });
});

describe("wrapFrame", () => {
  it("no loop: clamps to [0, duration)", () => {
    expect(wrapFrame(-1, 24, "none")).toBe(0);
    expect(wrapFrame(0, 24, "none")).toBe(0);
    expect(wrapFrame(23, 24, "none")).toBe(23);
    expect(wrapFrame(100, 24, "none")).toBe(23);
  });

  it("repeat: wraps modulo duration", () => {
    expect(wrapFrame(0, 24, "repeat")).toBe(0);
    expect(wrapFrame(24, 24, "repeat")).toBe(0);
    expect(wrapFrame(25, 24, "repeat")).toBe(1);
    expect(wrapFrame(-1, 24, "repeat")).toBe(23);
  });

  it("handles non-positive duration", () => {
    expect(wrapFrame(5, 0, "repeat")).toBe(0);
  });
});

describe("samplePropertyAtFrame", () => {
  const keyframes: MotionKeyframeV1[] = [
    { frame: 0, values: { x: 0 }, easing: "linear" },
    { frame: 10, values: { x: 100 }, easing: "linear" },
  ];

  it("before first keyframe → hold first value", () => {
    expect(samplePropertyAtFrame(keyframes, -5, "x")).toBe(0);
  });

  it("at first keyframe → first value", () => {
    expect(samplePropertyAtFrame(keyframes, 0, "x")).toBe(0);
  });

  it("between keyframes → interpolated value", () => {
    expect(samplePropertyAtFrame(keyframes, 5, "x")).toBe(50);
  });

  it("at last keyframe → last value", () => {
    expect(samplePropertyAtFrame(keyframes, 10, "x")).toBe(100);
  });

  it("after last keyframe → hold last value", () => {
    expect(samplePropertyAtFrame(keyframes, 20, "x")).toBe(100);
  });

  it("empty track → defaultValue", () => {
    expect(samplePropertyAtFrame([], 5, "x", 42)).toBe(42);
  });

  it("sparse properties don't reset each other", () => {
    const kfs: MotionKeyframeV1[] = [
      { frame: 0, values: { x: 10 }, easing: "linear" },
    ];
    const y = samplePropertyAtFrame(kfs, 5, "y");
    expect(y).toBe(0); // default for y (translation)
    const rx = samplePropertyAtFrame(kfs, 5, "x");
    expect(rx).toBe(10);
  });

  it("input keyframes unsorted → function doesn't modify input", () => {
    const unsorted: MotionKeyframeV1[] = [
      { frame: 10, values: { x: 100 }, easing: "linear" },
      { frame: 0, values: { x: 0 }, easing: "linear" },
    ];
    expect(samplePropertyAtFrame(unsorted, 5, "x")).toBe(50);
    // Original order preserved
    expect(unsorted[0].frame).toBe(10);
  });
});

describe("sampleRenderSlotAtFrame", () => {
  const keyframes: MotionKeyframeV1[] = [
    { frame: 0, values: { renderSlot: "body" }, easing: "linear" },
    { frame: 10, values: { renderSlot: "head" }, easing: "linear" },
  ];

  it("at frame 0 → body", () => {
    expect(sampleRenderSlotAtFrame(keyframes, 0, "part1")).toBe("body");
  });

  it("at frame 5 → body (hold)", () => {
    expect(sampleRenderSlotAtFrame(keyframes, 5, "part1")).toBe("body");
  });

  it("at frame 10 → head", () => {
    expect(sampleRenderSlotAtFrame(keyframes, 10, "part1")).toBe("head");
  });

  it("before first keyframe → null", () => {
    expect(sampleRenderSlotAtFrame(keyframes, -1, "part1")).toBeNull();
  });

  it("no render slot keyframes → null", () => {
    const noSlot: MotionKeyframeV1[] = [
      { frame: 0, values: { x: 0 }, easing: "linear" },
    ];
    expect(sampleRenderSlotAtFrame(noSlot, 0, "part1")).toBeNull();
  });
});

describe("sampleMotionClip", () => {
  const rig: CharacterRigV1 = {
    schemaVersion: 1,
    rigId: "test",
    artwork: {
      source: "test.svg",
      fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      viewBox: [0, 0, 100, 100],
    },
    renderSlots: ["body", "head"],
    parts: [
      {
        id: "torso",
        sourceBinding: { kind: "elementId", value: "torso" },
        logicalParentId: null,
        defaultRenderSlot: "body",
        pivot: { x: 0, y: 0, space: "partLocal" },
        bindMatrix: [1, 0, 0, 1, 0, 0],
      },
    ],
  };

  const clip: MotionClipV1 = {
    id: "test",
    fps: 24,
    durationFrames: 24,
    loop: "none",
    tracks: [
      {
        partId: "torso",
        keyframes: [
          { frame: 0, values: { x: 0, rotation: 0 }, easing: "linear" },
          { frame: 24, values: { x: 100, rotation: 360 }, easing: "linear" },
        ],
      },
    ],
    events: [],
  };

  it("samples at frame 0", () => {
    const result = sampleMotionClip(clip, 0, rig);
    const t = result.transforms.get("torso")!;
    expect(t.x).toBe(0);
    expect(t.rotation).toBe(0);
  });

  it("samples at frame 12 (midpoint)", () => {
    const result = sampleMotionClip(clip, 12, rig);
    const t = result.transforms.get("torso")!;
    expect(t.x).toBe(50);
    expect(t.rotation).toBe(180);
  });

  it("samples at frame 24 (end)", () => {
    const result = sampleMotionClip(clip, 24, rig);
    const t = result.transforms.get("torso")!;
    expect(t.x).toBe(100);
    expect(t.rotation).toBe(360);
  });
});
