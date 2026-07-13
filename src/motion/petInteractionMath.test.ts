import { describe, expect, it } from "vitest";
import {
  calculateDraggedWindowPosition,
  cssScreenPointToPhysical,
  exceedsDragThreshold,
  getHitTestOffsets,
  getHitTestPadding,
  physicalCursorToCssPoint,
} from "./petInteractionMath";

describe("petInteractionMath", () => {
  it("将含负坐标的物理光标位置换算成 CSS 坐标", () => {
    expect(
      physicalCursorToCssPoint(
        { x: -120, y: 450 },
        { x: -300, y: 150 },
        1.5,
      ),
    ).toEqual({ x: 120, y: 200 });
  });

  it("按光标物理位移计算新的原生窗口坐标", () => {
    expect(
      calculateDraggedWindowPosition(
        { x: -400, y: 200 },
        { x: -250, y: 300 },
        { x: 50, y: 180 },
      ),
    ).toEqual({ x: -100, y: 80 });
  });

  it("把按下事件的 CSS 屏幕坐标换算为物理坐标", () => {
    expect(cssScreenPointToPhysical({ x: -120, y: 200 }, 1.5)).toEqual({
      x: -180,
      y: 300,
    });
  });

  it("拖动阈值随 DPI 缩放", () => {
    expect(exceedsDragThreshold(4.49, 3, 1.5)).toBe(false);
    expect(exceedsDragThreshold(4.5, 3, 1.5)).toBe(true);
  });

  it("交互状态使用更大的退出滞回范围", () => {
    expect(getHitTestPadding(false, 5, 10)).toBe(5);
    expect(getHitTestPadding(true, 5, 10)).toBe(10);
    expect(getHitTestOffsets(5)).toHaveLength(9);
  });
});
