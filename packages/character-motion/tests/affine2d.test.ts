import { describe, it, expect } from "vitest";
import {
  identity,
  multiply,
  invert,
  translate,
  rotateDegrees,
  scale,
  transformPoint,
  determinant,
  approximatelyEqual,
  composeAroundPivot,
} from "../src/math/affine2d";

describe("identity", () => {
  it("returns [1,0,0,1,0,0]", () => {
    expect(identity()).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe("multiply", () => {
  it("identity × anything = anything", () => {
    const m: [number, number, number, number, number, number] = [2, 0, 0, 3, 5, 7];
    expect(multiply(identity(), m)).toEqual(m);
  });

  it("anything × identity = anything", () => {
    const m: [number, number, number, number, number, number] = [2, 0, 0, 3, 5, 7];
    expect(multiply(m, identity())).toEqual(m);
  });

  it("multiplication is not commutative", () => {
    const a = translate(10, 0);
    const b = scale(2, 1);
    const ab = multiply(a, b);
    const ba = multiply(b, a);
    expect(ab).not.toEqual(ba);
  });
});

describe("invert", () => {
  it("invert(identity) = identity", () => {
    const inv = invert(identity());
    expect(inv).toBeDefined();
    expect(inv!).toEqual(identity());
  });

  it("invert(multiply(m, invert(m))) ≈ identity", () => {
    const m: [number, number, number, number, number, number] = [2, 1, 3, 4, 5, 6];
    const inv = invert(m);
    expect(inv).toBeDefined();
    const roundtrip = multiply(m, inv!);
    expect(approximatelyEqual(roundtrip, identity(), 1e-10)).toBe(true);
  });

  it("returns null for singular matrix", () => {
    const singular: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    expect(invert(singular)).toBeNull();
  });

  it("returns null for near-singular matrix", () => {
    const nearSingular: [number, number, number, number, number, number] = [1e-15, 0, 0, 1, 0, 0];
    expect(invert(nearSingular)).toBeNull();
  });
});

describe("translate", () => {
  it("translates a point", () => {
    const t = translate(10, 20);
    const result = transformPoint(t, { x: 1, y: 2 });
    expect(result).toEqual({ x: 11, y: 22 });
  });
});

describe("rotateDegrees", () => {
  it("rotates (1,0) by 90° to approximately (0,1)", () => {
    const r = rotateDegrees(90);
    const result = transformPoint(r, { x: 1, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it("rotates (0,1) by -90° to approximately (1,0)", () => {
    const r = rotateDegrees(-90);
    const result = transformPoint(r, { x: 0, y: 1 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it("identity at 0°", () => {
    const r = rotateDegrees(0);
    expect(approximatelyEqual(r, identity())).toBe(true);
  });
});

describe("scale", () => {
  it("scales a point", () => {
    const s = scale(2, 3);
    const result = transformPoint(s, { x: 4, y: 5 });
    expect(result).toEqual({ x: 8, y: 15 });
  });
});

describe("determinant", () => {
  it("identity has determinant 1", () => {
    expect(determinant(identity())).toBe(1);
  });

  it("scale(2,3) has determinant 6", () => {
    expect(determinant(scale(2, 3))).toBe(6);
  });

  it("singular matrix has determinant 0", () => {
    expect(determinant([0, 0, 0, 0, 0, 0])).toBe(0);
  });
});

describe("approximatelyEqual", () => {
  it("identical matrices are equal", () => {
    expect(approximatelyEqual(identity(), identity())).toBe(true);
  });

  it("different matrices are not equal", () => {
    expect(approximatelyEqual(identity(), translate(1, 0))).toBe(false);
  });

  it("matrices within epsilon are equal", () => {
    const a: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    const b: [number, number, number, number, number, number] = [1, 0, 0, 1, 1e-10, 0];
    expect(approximatelyEqual(a, b, 1e-9)).toBe(true);
  });
});

describe("composeAroundPivot", () => {
  it("rotate 90° around (10,0): point (10,0) stays at (10,0)", () => {
    const m = composeAroundPivot(0, 0, 90, 1, 1, 10, 0);
    const result = transformPoint(m, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it("translate + rotate around pivot composes correctly", () => {
    // Translate by (100, 50), then rotate 45° around local pivot (5, 5)
    const m = composeAroundPivot(100, 50, 45, 1, 1, 5, 5);
    const result = transformPoint(m, { x: 5, y: 5 });
    // Pivot point in local space should end up at translate location
    expect(result.x).toBeCloseTo(105, 5);
    expect(result.y).toBeCloseTo(55, 5);
  });

  it("zero rotation with scale works", () => {
    const m = composeAroundPivot(10, 20, 0, 2, 0.5, 0, 0);
    const result = transformPoint(m, { x: 5, y: 10 });
    expect(result.x).toBeCloseTo(20, 10);
    expect(result.y).toBeCloseTo(25, 10);
  });
});

describe("-0 normalization", () => {
  it("identity has no -0", () => {
    const i = identity();
    for (const v of i) {
      expect(Object.is(v, -0)).toBe(false);
    }
  });

  it("rotateDegrees(0) produces 0 not -0", () => {
    const r = rotateDegrees(0);
    for (const v of r) {
      expect(Object.is(v, -0)).toBe(false);
    }
  });
});
