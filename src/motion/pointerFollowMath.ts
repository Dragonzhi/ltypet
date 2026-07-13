import type { Point } from "./petInteractionMath";

interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface NeutralPointConfig {
  xRatio: number;
  yRatio: number;
  offsetX: number;
  offsetY: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const getPointerNeutralPoint = (
  bounds: ElementBounds,
  config: NeutralPointConfig,
): Point => ({
  x: bounds.left + bounds.width * config.xRatio + config.offsetX,
  y: bounds.top + bounds.height * config.yRatio + config.offsetY,
});

export const getPointerDirection = (
  pointer: Point,
  neutralPoint: Point,
  fullRangeX: number,
  fullRangeY: number,
): Point => ({
  x: clamp((pointer.x - neutralPoint.x) / fullRangeX, -1, 1),
  y: clamp((pointer.y - neutralPoint.y) / fullRangeY, -1, 1),
});
