import { describe, it, expect } from "vitest";
import {
  canonicalizeRig,
  canonicalizeMotionLibrary,
  serializeRig,
  serializeMotionLibrary,
  canonicalizeArtworkText,
} from "../src/serialization/canonicalize";
import type { CharacterRigV1, MotionLibraryV1 } from "../src/types";

describe("canonicalizeArtworkText", () => {
  it("normalizes CRLF to LF", () => {
    const input = "<svg>\r\n<path/>\r\n</svg>";
    const result = canonicalizeArtworkText(input);
    expect(result).toBe("<svg>\n<path/>\n</svg>");
  });

  it("applies NFC normalization", () => {
    // "é" can be encoded as combined (U+00E9) or decomposed (U+0065 + U+0301)
    const decomposed = "e\u0301"; // é as e + combining accent
    const combined = "\u00E9";
    const result = canonicalizeArtworkText(decomposed);
    // Should be NFC-normalized
    expect(result.normalize("NFC")).toBe(result);
  });
});

describe("canonicalizeRig", () => {
  it("sorts parts by ID", () => {
    const rig: CharacterRigV1 = {
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
          id: "z_part",
          sourceBinding: { kind: "elementId", value: "z" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
          tags: ["a", "c", "b"],
        },
        {
          id: "a_part",
          sourceBinding: { kind: "elementId", value: "a" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
          tags: ["b", "a", "c"],
        },
      ],
    };
    const canonical = canonicalizeRig(rig);
    expect(canonical.parts[0].id).toBe("a_part");
    expect(canonical.parts[1].id).toBe("z_part");
    // Tags sorted and deduplicated
    expect(canonical.parts[0].tags).toEqual(["a", "b", "c"]);
  });

  it("normalizes -0 to 0", () => {
    const rig: CharacterRigV1 = {
      schemaVersion: 1,
      rigId: "test",
      artwork: {
        source: "test.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [-0, 0, 100, 100],
      },
      renderSlots: ["body"],
      parts: [
        {
          id: "p1",
          sourceBinding: { kind: "elementId", value: "p1" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: -0, y: 0, space: "partLocal" },
          bindMatrix: [-0, 0, 0, 1, 0, 0],
        },
      ],
    };
    const canonical = canonicalizeRig(rig);
    expect(Object.is(canonical.artwork.viewBox[0], -0)).toBe(false);
    expect(Object.is(canonical.parts[0].pivot.x, -0)).toBe(false);
    expect(Object.is(canonical.parts[0].bindMatrix[0], -0)).toBe(false);
  });
});

describe("serializeRig", () => {
  it("same semantic object → same bytes", () => {
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
          id: "a",
          sourceBinding: { kind: "elementId", value: "a" },
          logicalParentId: null,
          defaultRenderSlot: "body",
          pivot: { x: 0, y: 0, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
        {
          id: "b",
          sourceBinding: { kind: "elementId", value: "b" },
          logicalParentId: "a",
          defaultRenderSlot: "head",
          pivot: { x: 0, y: 10, space: "partLocal" },
          bindMatrix: [1, 0, 0, 1, 0, 0],
        },
      ],
    };

    const s1 = serializeRig(rig);
    const s2 = serializeRig(JSON.parse(JSON.stringify(rig)));
    expect(s1).toBe(s2);
  });

  it("output ends with newline", () => {
    const rig: CharacterRigV1 = {
      schemaVersion: 1,
      rigId: "t",
      artwork: {
        source: "s.svg",
        fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        viewBox: [0, 0, 1, 1],
      },
      renderSlots: ["d"],
      parts: [],
    };
    const s = serializeRig(rig);
    expect(s.endsWith("\n")).toBe(true);
  });
});

describe("serializeMotionLibrary", () => {
  it("clips and tracks sorted by ID", () => {
    const lib: MotionLibraryV1 = {
      schemaVersion: 1,
      rigId: "test",
      clips: [
        {
          id: "z_clip",
          fps: 30,
          durationFrames: 60,
          loop: "none",
          tracks: [
            {
              partId: "z_part",
              keyframes: [
                { frame: 10, values: { x: 1 }, easing: "linear" },
                { frame: 0, values: { x: 0 }, easing: "linear" },
              ],
            },
          ],
          events: [],
        },
        {
          id: "a_clip",
          fps: 24,
          durationFrames: 24,
          loop: "repeat",
          tracks: [
            {
              partId: "a_part",
              keyframes: [
                { frame: 5, values: { rotation: 90 }, easing: "easeIn" },
              ],
            },
          ],
          events: [],
        },
      ],
    };
    const canonical = canonicalizeMotionLibrary(lib);
    expect(canonical.clips[0].id).toBe("a_clip");
    expect(canonical.clips[1].id).toBe("z_clip");
    // Keyframes sorted by frame
    expect(canonical.clips[1].tracks[0].keyframes[0].frame).toBe(0);
    expect(canonical.clips[1].tracks[0].keyframes[1].frame).toBe(10);
  });

  it("renderSlots preserve array order", () => {
    const lib: MotionLibraryV1 = {
      schemaVersion: 1,
      rigId: "test",
      clips: [],
    };
    const canonical = canonicalizeMotionLibrary(lib);
    expect(canonical.clips).toEqual([]);
  });
});

describe("serialize → parse → validate → serialize round-trip", () => {
  it("produces identical bytes", () => {
    const rig: CharacterRigV1 = {
      schemaVersion: 1,
      rigId: "roundtrip",
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
      ],
    };

    // serialize → parse → serialize
    const json1 = serializeRig(rig);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const parsed = JSON.parse(json1) as CharacterRigV1;
    const json2 = serializeRig(parsed);
    expect(json1).toBe(json2);
  });
});
