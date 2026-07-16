import type { WindowTarget, WindowSemanticPosition } from "../domain/actions/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Resolve a WindowTarget to a physical pixel position within the work area.
 *
 * - Semantic targets map to named positions (center, top-left, etc.).
 * - Normalized targets use [0,1] × [0,1] where 0 = near edge, 1 = far edge.
 *   The formula ensures the window stays fully inside the work area when
 *   both x and y are within [0, 1].
 */
export function resolveTarget(
  target: WindowTarget,
  workArea: Rect,
  winSize: Size,
): Point {
  if (target.kind === "normalized") {
    return {
      x: workArea.x + target.x * (workArea.width - winSize.width),
      y: workArea.y + target.y * (workArea.height - winSize.height),
    };
  }

  return resolveSemanticPosition(target.position, workArea, winSize);
}

function resolveSemanticPosition(
  position: WindowSemanticPosition,
  workArea: Rect,
  winSize: Size,
): Point {
  const left = workArea.x;
  const right = workArea.x + workArea.width - winSize.width;
  const top = workArea.y;
  const bottom = workArea.y + workArea.height - winSize.height;
  const centerX = workArea.x + (workArea.width - winSize.width) / 2;
  const centerY = workArea.y + (workArea.height - winSize.height) / 2;

  switch (position) {
    case "center":
      return { x: centerX, y: centerY };
    case "top":
      return { x: centerX, y: top };
    case "bottom":
      return { x: centerX, y: bottom };
    case "left":
      return { x: left, y: centerY };
    case "right":
      return { x: right, y: centerY };
    case "top-left":
      return { x: left, y: top };
    case "top-right":
      return { x: right, y: top };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom-right":
      return { x: right, y: bottom };
  }
}

/**
 * Clamp a window position so the window stays within the work area,
 * respecting a margin from the edges.
 *
 * If the window is larger than the available area (after margin), it is
 * centered within the available space rather than pushed outside.
 */
export function clampToWorkArea(
  pos: Point,
  workArea: Rect,
  winSize: Size,
  marginPx: number,
): Point {
  const availableWidth = workArea.width - 2 * marginPx;
  const availableHeight = workArea.height - 2 * marginPx;

  // If window is larger than available area, center it
  if (winSize.width >= availableWidth) {
    const x = workArea.x + (workArea.width - winSize.width) / 2;
    const y =
      winSize.height >= availableHeight
        ? workArea.y + (workArea.height - winSize.height) / 2
        : clampValue(
            pos.y,
            workArea.y + marginPx,
            workArea.y + workArea.height - winSize.height - marginPx,
          );
    return { x, y };
  }

  if (winSize.height >= availableHeight) {
    const y = workArea.y + (workArea.height - winSize.height) / 2;
    const x = clampValue(
      pos.x,
      workArea.x + marginPx,
      workArea.x + workArea.width - winSize.width - marginPx,
    );
    return { x, y };
  }

  return {
    x: clampValue(
      pos.x,
      workArea.x + marginPx,
      workArea.x + workArea.width - winSize.width - marginPx,
    ),
    y: clampValue(
      pos.y,
      workArea.y + marginPx,
      workArea.y + workArea.height - winSize.height - marginPx,
    ),
  };
}

function clampValue(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

/**
 * Cubic ease-in-out: slow start, fast middle, slow end.
 *
 * At t=0 returns 0, at t=1 returns 1, at t=0.5 returns 0.5.
 */
export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Compute the actual animation duration, capped by maximum speed.
 *
 * If the requested duration would require moving faster than maxSpeedPxPerMs,
 * the duration is extended so the movement respects the speed limit.
 * If no duration is requested, the duration is derived from distance and max speed.
 */
export function computeDuration(
  distance: number,
  maxSpeedPxPerMs: number,
  requestedDurationMs?: number,
): number {
  if (distance <= 0) return 0;
  if (maxSpeedPxPerMs <= 0) return requestedDurationMs ?? 0;

  const minDurationMs = distance / maxSpeedPxPerMs;
  if (requestedDurationMs === undefined) return minDurationMs;
  return Math.max(requestedDurationMs, minDurationMs);
}

/**
 * Interpolate between start and end positions using an easing function.
 *
 * @param progress - Animation progress in [0, 1]
 */
export function interpolatePosition(
  start: Point,
  end: Point,
  progress: number,
): Point {
  const eased = easeInOutCubic(progress);
  return {
    x: start.x + (end.x - start.x) * eased,
    y: start.y + (end.y - start.y) * eased,
  };
}

/**
 * Euclidean distance between two points.
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
