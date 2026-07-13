import { describe, expect, it } from "vitest";
import {
  distanceBetweenPoints,
  exceedsDragThreshold,
  normalizeDragVelocity,
  scaleHairRotation,
} from "./hairMotionMath";

describe("hairMotionMath", () => {
  it("按速度上限归一化并限制在正负一", () => {
    expect(normalizeDragVelocity(11, 10, 1.1)).toBe(1);
    expect(normalizeDragVelocity(-22, 10, 1.1)).toBe(-1);
    expect(normalizeDragVelocity(5.5, 10, 1.1)).toBeCloseTo(0.5);
  });

  it("使用二维屏幕距离判断是否真的发生拖动", () => {
    const distance = distanceBetweenPoints(10, 20, 12, 22.25);
    expect(exceedsDragThreshold(distance, 3)).toBe(true);
    expect(exceedsDragThreshold(2.99, 3)).toBe(false);
  });

  it("按部件比例缩放同一个惯性弹簧角度", () => {
    expect(scaleHairRotation(7, 0.12)).toBeCloseTo(0.84);
    expect(scaleHairRotation(-7, 0.3)).toBeCloseTo(-2.1);
  });
});
