import { describe, expect, it } from "vitest";
import {
  getPointerDirection,
  getPointerNeutralPoint,
} from "./pointerFollowMath";

describe("pointerFollowMath", () => {
  it("按角色比例与素材偏移计算双眼正中的正视点", () => {
    expect(
      getPointerNeutralPoint(
        { left: 100, top: 0, width: 200, height: 340 },
        { xRatio: 0.5, yRatio: 0.5, offsetX: 0, offsetY: 2 },
      ),
    ).toEqual({ x: 200, y: 172 });
  });

  it("在正视点输出零方向，并把远距离限制在单位范围", () => {
    const neutralPoint = { x: 200, y: 172 };
    expect(
      getPointerDirection(neutralPoint, neutralPoint, 150, 120),
    ).toEqual({ x: 0, y: 0 });
    expect(
      getPointerDirection({ x: 500, y: -100 }, neutralPoint, 150, 120),
    ).toEqual({ x: 1, y: -1 });
  });
});
