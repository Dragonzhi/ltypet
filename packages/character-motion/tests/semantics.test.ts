import { describe, it, expect } from "vitest";
import { validateRigSemantics, validateMotionSemantics } from "../src/schema";
import type { CharacterRigV1, MotionLibraryV1 } from "../src/types";

function makeValidRig(overrides?: Partial<CharacterRigV1>): CharacterRigV1 {
  return {
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
    ...overrides,
  };
}

describe("validateRigSemantics", () => {
  it("returns no issues for valid rig", () => {
    const rig = makeValidRig();
    const issues = validateRigSemantics(rig);
    expect(issues).toHaveLength(0);
  });

  it("detects duplicate part IDs", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t1" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t2" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "duplicate-part-id")).toBe(true);
  });

  it("detects self-parent cycle", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t1" },
          logicalParentId: "torso",
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "self-parent")).toBe(true);
  });

  it("detects two-node cycle", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "part_a",
          sourceBinding: { kind: "elementId", value: "a" },
          logicalParentId: "part_b",
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
        {
          id: "part_b",
          sourceBinding: { kind: "elementId", value: "b" },
          logicalParentId: "part_a",
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "cycle-detected")).toBe(true);
  });

  it("detects unknown parent", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t1" },
          logicalParentId: "nonexistent",
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "unknown-parent")).toBe(true);
  });

  it("detects sourceBinding conflict", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "arm_right",
          sourceBinding: { kind: "elementId", value: "arm" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
        {
          id: "arm_left",
          sourceBinding: { kind: "elementId", value: "arm" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "duplicate-source-binding")).toBe(true);
  });

  it("detects unknown renderSlot", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t1" },
          logicalParentId: null,
          defaultRenderSlot: "nonexistent_slot",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "unknown-render-slot")).toBe(true);
  });

  it("detects singular bindMatrix", () => {
    const rig = makeValidRig({
      parts: [
        {
          id: "torso",
          sourceBinding: { kind: "elementId", value: "t1" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [0, 0, 0, 0, 0, 0],
        },
      ],
    });
    const issues = validateRigSemantics(rig);
    expect(issues.some((i) => i.code === "singular-bind-matrix")).toBe(true);
  });
});

describe("validateMotionSemantics", () => {
  const rig = makeValidRig({
    parts: [
      {
        id: "arm_right",
        sourceBinding: { kind: "elementId", value: "arm" },
        logicalParentId: null,
        defaultRenderSlot: "body",
        pivot: { x: 0, y: 0, space: "partLocal" },
        bindMatrix: [1, 0, 0, 1, 0, 0],
      },
    ],
  });

  const validMotions: MotionLibraryV1 = {
    schemaVersion: 1,
    rigId: "test",
    clips: [
      {
        id: "wave",
        fps: 24,
        durationFrames: 24,
        loop: "repeat",
        tracks: [
          {
            partId: "arm_right",
            keyframes: [
              { frame: 0, values: { rotation: 0 }, easing: "linear" },
            ],
          },
        ],
        events: [],
      },
    ],
  };

  it("returns no issues for valid motions", () => {
    const issues = validateMotionSemantics(validMotions, rig);
    expect(issues).toHaveLength(0);
  });

  it("detects rig ID mismatch", () => {
    const motions = { ...validMotions, rigId: "other-rig" };
    const issues = validateMotionSemantics(motions, rig);
    expect(issues.some((i) => i.code === "rig-id-mismatch")).toBe(true);
  });

  it("detects track for unknown part", () => {
    const motions: MotionLibraryV1 = {
      ...validMotions,
      clips: [
        {
          ...validMotions.clips[0],
          tracks: [
            {
              partId: "nonexistent",
              keyframes: [
                { frame: 0, values: { rotation: 0 }, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const issues = validateMotionSemantics(motions, rig);
    expect(issues.some((i) => i.code === "unknown-track-part")).toBe(true);
  });
});
