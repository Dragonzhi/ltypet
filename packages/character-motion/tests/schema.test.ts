import { describe, it, expect } from "vitest";
import { validateRig, validateRigStructure } from "../src/schema";

describe("validateRigStructure", () => {
  it("accepts a valid minimal rig", () => {
    const result = validateRigStructure({
      schemaVersion: 1,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["default"],
      parts: [
        {
          id: "part1",
          sourceBinding: { kind: "elementId", value: "p1" },
          logicalParentId: null,
          defaultRenderSlot: "default",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
    }
  });

  it("rejects unknown schemaVersion", () => {
    const result = validateRigStructure({
      schemaVersion: 2,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["default"],
      parts: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown properties (additionalProperties: false)", () => {
    const result = validateRigStructure({
      schemaVersion: 1,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["default"],
      parts: [],
      unknownField: "nope",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects wrong types (string instead of number)", () => {
    const result = validateRigStructure({
      schemaVersion: 1,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["default"],
      parts: [
        {
          id: "part1",
          sourceBinding: { kind: "elementId", value: "p1" },
          logicalParentId: null,
          defaultRenderSlot: "default",
          pivot: { x: "zero" as unknown as number, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid pattern for rigId", () => {
    const result = validateRigStructure({
      schemaVersion: 1,
      rigId: "Invalid-ID",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["default"],
      parts: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateRig (combined)", () => {
  it("accepts valid rig with semantic checks", () => {
    const result = validateRig({
      schemaVersion: 1,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 100, 100],
      },
      renderSlots: ["body"],
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
    });
    expect(result.ok).toBe(true);
  });
});
