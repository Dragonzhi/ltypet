import { describe, it, expect } from "vitest";
import { migrateP0ToV1 } from "../src/migration/fromP0";
import type { CharacterRigV1 } from "../src/types";

const rig: CharacterRigV1 = {
  schemaVersion: 1,
  rigId: "xiaoluobao",
  artwork: {
    source: "xiaoluobao.svg",
    fingerprint: "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    viewBox: [0, 0, 200, 300],
  },
  renderSlots: ["body", "head", "front"],
  parts: [
    {
      id: "arm_right",
      sourceBinding: { kind: "inkscapeLabel", value: "arm_right" },
      logicalParentId: null,
      defaultRenderSlot: "body",
      pivot: { x: 0, y: 0, space: "partLocal" },
      bindMatrix: [1, 0, 0, 1, 0, 0],
    },
  ],
};

describe("migrateP0ToV1", () => {
  it("converts P0 wave to valid V1", () => {
    const p0 = {
      experimentalSchema: "p0-wave",
      productionReady: true,
      sourceFingerprint: "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      clip: {
        id: "wave",
        partId: "arm_right",
        fps: 24,
        durationFrames: 24,
        pivot: { x: 10, y: 5 },
        keyframes: [
          { frame: 0, rotation: 0, easing: "linear" },
          { frame: 12, rotation: 30, easing: "easeInOut" },
          { frame: 24, rotation: 0, easing: "linear" },
        ],
      },
    };

    const result = migrateP0ToV1(p0, rig, rig.artwork.fingerprint);
    expect(result.motion.schemaVersion).toBe(1);
    expect(result.motion.rigId).toBe("xiaoluobao");
    expect(result.motion.clips).toHaveLength(1);
    expect(result.motion.clips[0].id).toBe("wave");
    expect(result.motion.clips[0].tracks).toHaveLength(1);
    expect(result.motion.clips[0].tracks[0].partId).toBe("arm_right");
    expect(result.motion.clips[0].tracks[0].keyframes).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it("converts rotation keyframes to values.rotation", () => {
    const p0 = {
      experimentalSchema: "p0-wave",
      productionReady: true,
      sourceFingerprint: "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      clip: {
        id: "wave",
        partId: "arm_right",
        fps: 24,
        durationFrames: 24,
        pivot: { x: 10, y: 5 },
        keyframes: [
          { frame: 0, rotation: 0, easing: "linear" },
        ],
      },
    };

    const result = migrateP0ToV1(p0, rig, rig.artwork.fingerprint);
    expect(result.motion.clips[0].tracks[0].keyframes[0].values.rotation).toBe(0);
    expect(result.motion.clips[0].tracks[0].keyframes[0].values.x).toBeUndefined();
  });

  it("emits warning for mismatched fingerprint", () => {
    const p0 = {
      experimentalSchema: "p0-wave",
      productionReady: true,
      sourceFingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      clip: {
        id: "wave",
        partId: "arm_right",
        fps: 24,
        durationFrames: 24,
        pivot: { x: 10, y: 5 },
        keyframes: [],
      },
    };

    const result = migrateP0ToV1(p0, rig, rig.artwork.fingerprint);
    expect(result.warnings.some((w) => w.code === "fingerprint-mismatch")).toBe(true);
  });

  it("emits warning for unknown part ID", () => {
    const p0 = {
      experimentalSchema: "p0-wave",
      productionReady: true,
      sourceFingerprint: "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      clip: {
        id: "wave",
        partId: "nonexistent_part",
        fps: 24,
        durationFrames: 24,
        pivot: { x: 10, y: 5 },
        keyframes: [],
      },
    };

    const result = migrateP0ToV1(p0, rig, rig.artwork.fingerprint);
    expect(result.warnings.some((w) => w.code === "unknown-part")).toBe(true);
  });

  it("throws for invalid P0 input", () => {
    expect(() => migrateP0ToV1("not-an-object", rig, "sha256:...")).toThrow();
    expect(() => migrateP0ToV1(null, rig, "sha256:...")).toThrow();
  });
});
