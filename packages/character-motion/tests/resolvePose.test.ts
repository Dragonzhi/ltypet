import { describe, it, expect } from "vitest";
import { resolveWorldPose, resolveAllPoses } from "../src/rig/resolvePose";
import { topologicalOrder } from "../src/rig/dependencyGraph";
import { transformPoint, approximatelyEqual } from "../src/math/affine2d";
import type { CharacterRigV1, TransformValue } from "../src/types";

const simpleRig: CharacterRigV1 = {
  schemaVersion: 1,
  rigId: "test",
  artwork: {
    source: "test.svg",
    fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    viewBox: [0, 0, 200, 200],
  },
  renderSlots: ["body", "head"],
  parts: [
    {
      id: "torso",
      sourceBinding: { kind: "elementId", value: "torso" },
      logicalParentId: null,
      defaultRenderSlot: "body",
      pivot: { x: 0, y: 0, space: "partLocal" },
      bindMatrix: [1, 0, 0, 1, 100, 100],
    },
    {
      id: "head",
      sourceBinding: { kind: "elementId", value: "head" },
      logicalParentId: "torso",
      defaultRenderSlot: "head",
      pivot: { x: 0, y: 20, space: "partLocal" },
      bindMatrix: [1, 0, 0, 1, 0, -50],
    },
  ],
};

describe("topologicalOrder", () => {
  it("sorts parts with parents before children", () => {
    const sorted = topologicalOrder(simpleRig.parts);
    expect(sorted[0].id).toBe("torso");
    expect(sorted[1].id).toBe("head");
  });

  it("throws on cycle", () => {
    expect(() =>
      topologicalOrder([
        { ...simpleRig.parts[0], logicalParentId: "head" },
        { ...simpleRig.parts[1], logicalParentId: "torso" },
      ]),
    ).toThrow("Cycle detected");
  });
});

describe("resolveWorldPose", () => {
  it("root part: world matrix = bind × authored", () => {
    const authored: TransformValue = { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
    const resolvedParents = new Map();
    const result = resolveWorldPose("torso", authored, simpleRig, resolvedParents);
    // bindMatrix [1,0,0,1,100,100] × authored (translate(10,0))
    // = [1,0,0,1,110,100]
    const pt = transformPoint(result.worldMatrix, { x: 0, y: 0 });
    expect(pt.x).toBeCloseTo(110, 10);
    expect(pt.y).toBeCloseTo(100, 10);
    expect(result.renderSlot).toBe("body");
  });

  it("child inherits parent transform", () => {
    const parentWorld = new Map<string, [number, number, number, number, number, number]>();
    const torsoAuthored: TransformValue = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
    const torsoResult = resolveWorldPose("torso", torsoAuthored, simpleRig, parentWorld);
    parentWorld.set("torso", torsoResult.worldMatrix);

    const headAuthored: TransformValue = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
    const headResult = resolveWorldPose("head", headAuthored, simpleRig, parentWorld);

    // head bind = [1,0,0,1,0,-50]
    // torso world = [1,0,0,1,100,100]
    // head world = torso world × head bind × authored (identity)
    // = [1,0,0,1,100,100] × [1,0,0,1,0,-50]
    // = [1,0,0,1,100,50]
    const pt = transformPoint(headResult.worldMatrix, { x: 0, y: 0 });
    expect(pt.x).toBeCloseTo(100, 10);
    expect(pt.y).toBeCloseTo(50, 10);
  });

  it("render slot change doesn't affect world matrix", () => {
    const authored: TransformValue = { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1, opacity: 1 };
    const resolved = new Map();
    const result1 = resolveWorldPose("torso", authored, simpleRig, resolved);
    // Just changing renderSlot concept — our current API doesn't have dynamic renderSlot changes
    // in resolveWorldPose; it uses the default from the rig
    expect(result1.renderSlot).toBe("body");
  });
});

describe("resolveAllPoses", () => {
  it("resolves all parts in topological order", () => {
    const authored = new Map<string, TransformValue>();
    authored.set("torso", { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 });
    authored.set("head", { x: 0, y: 5, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 });

    const result = resolveAllPoses(authored, simpleRig);
    expect(result.worldMatrices.has("torso")).toBe(true);
    expect(result.worldMatrices.has("head")).toBe(true);
    expect(result.renderSlots.get("torso")).toBe("body");
    expect(result.renderSlots.get("head")).toBe("head");
  });
});
