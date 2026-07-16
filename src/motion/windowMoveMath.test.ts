import { describe, it, expect } from "vitest";
import {
  resolveTarget,
  clampToWorkArea,
  easeInOutCubic,
  computeDuration,
  interpolatePosition,
  distance,
  type Rect,
  type Size,
} from "./windowMoveMath";

const WORK_AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const WIN_SIZE: Size = { width: 200, height: 300 };

describe("windowMoveMath", () => {
  describe("resolveTarget — semantic positions", () => {
    it("center 居中于工作区", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "center" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBeCloseTo((1920 - 200) / 2);
      expect(pos.y).toBeCloseTo((1040 - 300) / 2);
    });

    it("top 顶部居中", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "top" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBeCloseTo((1920 - 200) / 2);
      expect(pos.y).toBe(0);
    });

    it("bottom 底部居中", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "bottom" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBeCloseTo((1920 - 200) / 2);
      expect(pos.y).toBe(1040 - 300);
    });

    it("left 左侧居中", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "left" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(0);
      expect(pos.y).toBeCloseTo((1040 - 300) / 2);
    });

    it("right 右侧居中", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "right" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(1920 - 200);
      expect(pos.y).toBeCloseTo((1040 - 300) / 2);
    });

    it("top-left 左上角", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "top-left" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it("top-right 右上角", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "top-right" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(1920 - 200);
      expect(pos.y).toBe(0);
    });

    it("bottom-left 左下角", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "bottom-left" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(1040 - 300);
    });

    it("bottom-right 右下角", () => {
      const pos = resolveTarget(
        { kind: "semantic", position: "bottom-right" },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(1920 - 200);
      expect(pos.y).toBe(1040 - 300);
    });
  });

  describe("resolveTarget — normalized positions", () => {
    it("(0,0) 映射到工作区左上角", () => {
      const pos = resolveTarget(
        { kind: "normalized", x: 0, y: 0 },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it("(1,1) 映射到工作区右下角", () => {
      const pos = resolveTarget(
        { kind: "normalized", x: 1, y: 1 },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBe(1920 - 200);
      expect(pos.y).toBe(1040 - 300);
    });

    it("(0.5,0.5) 映射到工作区中心", () => {
      const pos = resolveTarget(
        { kind: "normalized", x: 0.5, y: 0.5 },
        WORK_AREA,
        WIN_SIZE,
      );
      expect(pos.x).toBeCloseTo((1920 - 200) / 2);
      expect(pos.y).toBeCloseTo((1040 - 300) / 2);
    });

    it("支持负坐标显示器（工作区偏移）", () => {
      const workArea: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };
      const pos = resolveTarget(
        { kind: "normalized", x: 0.5, y: 0.5 },
        workArea,
        WIN_SIZE,
      );
      expect(pos.x).toBeCloseTo(-1920 + (1920 - 200) / 2);
      expect(pos.y).toBeCloseTo((1040 - 300) / 2);
    });
  });

  describe("clampToWorkArea", () => {
    it("合法位置不改变", () => {
      const pos = { x: 500, y: 400 };
      const result = clampToWorkArea(pos, WORK_AREA, WIN_SIZE, 10);
      expect(result.x).toBe(500);
      expect(result.y).toBe(400);
    });

    it("超出左边距时回拉", () => {
      const pos = { x: -100, y: 400 };
      const result = clampToWorkArea(pos, WORK_AREA, WIN_SIZE, 10);
      expect(result.x).toBe(10);
      expect(result.y).toBe(400);
    });

    it("超出右边距时回拉", () => {
      const pos = { x: 2000, y: 400 };
      const result = clampToWorkArea(pos, WORK_AREA, WIN_SIZE, 10);
      expect(result.x).toBe(1920 - 200 - 10);
      expect(result.y).toBe(400);
    });

    it("超出上边距时回拉", () => {
      const pos = { x: 500, y: -50 };
      const result = clampToWorkArea(pos, WORK_AREA, WIN_SIZE, 10);
      expect(result.x).toBe(500);
      expect(result.y).toBe(10);
    });

    it("超出下边距时回拉", () => {
      const pos = { x: 500, y: 900 };
      const result = clampToWorkArea(pos, WORK_AREA, WIN_SIZE, 10);
      expect(result.x).toBe(500);
      expect(result.y).toBe(1040 - 300 - 10);
    });

    it("窗口宽度大于可用宽度时水平居中", () => {
      const bigWin: Size = { width: 2000, height: 300 };
      const pos = { x: 500, y: 400 };
      const result = clampToWorkArea(pos, WORK_AREA, bigWin, 10);
      expect(result.x).toBeCloseTo((1920 - 2000) / 2);
    });

    it("窗口高度大于可用高度时垂直居中", () => {
      const bigWin: Size = { width: 200, height: 1100 };
      const pos = { x: 500, y: 400 };
      const result = clampToWorkArea(pos, WORK_AREA, bigWin, 10);
      expect(result.y).toBeCloseTo((1040 - 1100) / 2);
    });

    it("支持负坐标工作区", () => {
      const workArea: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };
      const pos = { x: -2500, y: 400 };
      const result = clampToWorkArea(pos, workArea, WIN_SIZE, 10);
      expect(result.x).toBe(-1920 + 10);
    });
  });

  describe("easeInOutCubic", () => {
    it("t=0 返回 0", () => {
      expect(easeInOutCubic(0)).toBe(0);
    });

    it("t=1 返回 1", () => {
      expect(easeInOutCubic(1)).toBe(1);
    });

    it("t=0.5 返回 0.5", () => {
      expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    });

    it("t<0 钳制为 0", () => {
      expect(easeInOutCubic(-0.5)).toBe(0);
    });

    it("t>1 钳制为 1", () => {
      expect(easeInOutCubic(1.5)).toBe(1);
    });

    it("前半段为 ease-in（加速）", () => {
      const t = 0.25;
      const result = easeInOutCubic(t);
      // 4 * 0.25^3 = 0.0625
      expect(result).toBeCloseTo(0.0625);
    });

    it("后半段为 ease-out（减速）", () => {
      const t = 0.75;
      const result = easeInOutCubic(t);
      // 1 - (-2*0.75+2)^3 / 2 = 1 - 0.5^3 / 2 = 1 - 0.0625 = 0.9375
      expect(result).toBeCloseTo(0.9375);
    });
  });

  describe("computeDuration", () => {
    it("距离为零时返回 0", () => {
      expect(computeDuration(0, 2, 1000)).toBe(0);
    });

    it("无请求时长时按最大速度计算", () => {
      // 距离 1000, 最大速度 2 px/ms → 500 ms
      expect(computeDuration(1000, 2)).toBe(500);
    });

    it("请求时长大于最小时长时使用请求时长", () => {
      // 距离 1000, 最大速度 2 → 最小 500ms, 请求 1000ms → 1000ms
      expect(computeDuration(1000, 2, 1000)).toBe(1000);
    });

    it("请求时长小于最小时长时使用最小时长", () => {
      // 距离 1000, 最大速度 2 → 最小 500ms, 请求 200ms → 500ms
      expect(computeDuration(1000, 2, 200)).toBe(500);
    });

    it("最大速度为零时返回请求时长", () => {
      expect(computeDuration(1000, 0, 1000)).toBe(1000);
    });
  });

  describe("interpolatePosition", () => {
    it("progress=0 返回起点", () => {
      const start = { x: 100, y: 200 };
      const end = { x: 300, y: 400 };
      const result = interpolatePosition(start, end, 0);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("progress=1 返回终点", () => {
      const start = { x: 100, y: 200 };
      const end = { x: 300, y: 400 };
      const result = interpolatePosition(start, end, 1);
      expect(result.x).toBe(300);
      expect(result.y).toBe(400);
    });

    it("progress=0.5 返回中点", () => {
      const start = { x: 100, y: 200 };
      const end = { x: 300, y: 400 };
      const result = interpolatePosition(start, end, 0.5);
      expect(result.x).toBeCloseTo(200);
      expect(result.y).toBeCloseTo(300);
    });

    it("应用缓动使中点偏移", () => {
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 0 };
      // easeInOutCubic(0.25) = 0.0625
      const result = interpolatePosition(start, end, 0.25);
      expect(result.x).toBeCloseTo(6.25);
    });
  });

  describe("distance", () => {
    it("相同点距离为零", () => {
      expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });

    it("水平距离", () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    });

    it("对角距离", () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    });
  });
});
