import { describe, it, expect } from "vitest";
import { computePivotInPartLocal } from "../src/math/pivot";
import { translate, multiply, scale } from "../src/math/affine2d";

describe("computePivotInPartLocal", () => {
  it("simple pivot: part at (100,0) with pivot at world (150, 50) → local (50, 50)", () => {
    const partWorld = translate(100, 0);
    const result = computePivotInPartLocal(partWorld, { x: 150, y: 50 });
    expect(result).toEqual({ x: 50, y: 50 });
  });

  it("pivot at origin: world (0,0) → local (0,0)", () => {
    const partWorld = translate(50, 30);
    const result = computePivotInPartLocal(partWorld, { x: 0, y: 0 });
    expect(result).toEqual({ x: -50, y: -30 });
  });

  it("returns null for singular matrix", () => {
    const singularWorld: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    const result = computePivotInPartLocal(singularWorld, { x: 10, y: 10 });
    expect(result).toBeNull();
  });

  it("handles scaled part world matrix", () => {
    const partWorld = multiply(translate(100, 50), scale(2, 3));
    const result = computePivotInPartLocal(partWorld, { x: 120, y: 80 });
    expect(result).toBeDefined();
    expect(result!.x).toBeCloseTo(10, 10);
    expect(result!.y).toBeCloseTo(10, 10);
  });
});
