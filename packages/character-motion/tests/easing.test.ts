import { describe, it, expect } from "vitest";
import { applyEasing } from "../src/timeline/easing";

describe("applyEasing", () => {
  describe("presets", () => {
    it("linear: endpoints and midpoint", () => {
      expect(applyEasing(0, "linear")).toBe(0);
      expect(applyEasing(0.5, "linear")).toBe(0.5);
      expect(applyEasing(1, "linear")).toBe(1);
    });

    it("easeIn: endpoints and midpoint", () => {
      expect(applyEasing(0, "easeIn")).toBe(0);
      expect(applyEasing(1, "easeIn")).toBe(1);
      expect(applyEasing(0.5, "easeIn")).toBe(0.25);
    });

    it("easeOut: endpoints and midpoint", () => {
      expect(applyEasing(0, "easeOut")).toBe(0);
      expect(applyEasing(1, "easeOut")).toBe(1);
      expect(applyEasing(0.5, "easeOut")).toBeCloseTo(0.75, 10);
    });

    it("easeInOut: endpoints and midpoint", () => {
      expect(applyEasing(0, "easeInOut")).toBe(0);
      expect(applyEasing(1, "easeInOut")).toBe(1);
      expect(applyEasing(0.5, "easeInOut")).toBe(0.5);
    });
  });

  describe("cubicBezier", () => {
    it("endpoints return 0 and 1", () => {
      const bezier = { cubicBezier: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };
      expect(applyEasing(0, bezier)).toBe(0);
      expect(applyEasing(1, bezier)).toBe(1);
    });

    it("ease (0.25, 0.1, 0.25, 1) midpoint > 0.5", () => {
      const bezier = { cubicBezier: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };
      const mid = applyEasing(0.5, bezier);
      expect(mid).toBeGreaterThan(0.5);
    });

    it("linear bezier (0, 0, 1, 1) is approximately identity", () => {
      const bezier = { cubicBezier: [0, 0, 1, 1] as [number, number, number, number] };
      expect(applyEasing(0.25, bezier)).toBeCloseTo(0.25, 4);
      expect(applyEasing(0.75, bezier)).toBeCloseTo(0.75, 4);
    });
  });

  describe("edge cases", () => {
    it("clamps input to [0, 1]", () => {
      expect(applyEasing(-1, "linear")).toBe(0);
      expect(applyEasing(2, "linear")).toBe(1);
    });

    it("handles non-finite input", () => {
      expect(applyEasing(NaN, "linear")).toBe(0);
      expect(applyEasing(Infinity, "linear")).toBe(0);
      expect(applyEasing(-Infinity, "linear")).toBe(0);
    });
  });
});
