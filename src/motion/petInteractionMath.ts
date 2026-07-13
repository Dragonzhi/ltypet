export interface Point {
  x: number;
  y: number;
}

export const physicalCursorToCssPoint = (
  cursor: Point,
  windowPosition: Point,
  scaleFactor: number,
): Point => ({
  x: (cursor.x - windowPosition.x) / scaleFactor,
  y: (cursor.y - windowPosition.y) / scaleFactor,
});

export const cssScreenPointToPhysical = (
  point: Point,
  scaleFactor: number,
): Point => ({
  x: point.x * scaleFactor,
  y: point.y * scaleFactor,
});

export const calculateDraggedWindowPosition = (
  startWindowPosition: Point,
  startCursor: Point,
  currentCursor: Point,
): Point => ({
  x: startWindowPosition.x + currentCursor.x - startCursor.x,
  y: startWindowPosition.y + currentCursor.y - startCursor.y,
});

export const distanceBetweenPoints = (start: Point, current: Point) =>
  Math.hypot(current.x - start.x, current.y - start.y);

export const exceedsDragThreshold = (
  physicalDistancePx: number,
  thresholdCssPx: number,
  scaleFactor: number,
) => physicalDistancePx >= thresholdCssPx * scaleFactor;

export const getHitTestPadding = (
  currentlyInteractive: boolean,
  enterPaddingCssPx: number,
  exitPaddingCssPx: number,
) => currentlyInteractive ? exitPaddingCssPx : enterPaddingCssPx;

export const getHitTestOffsets = (paddingCssPx: number): Point[] => {
  if (paddingCssPx <= 0) return [{ x: 0, y: 0 }];
  const diagonal = paddingCssPx / Math.SQRT2;
  return [
    { x: 0, y: 0 },
    { x: paddingCssPx, y: 0 },
    { x: -paddingCssPx, y: 0 },
    { x: 0, y: paddingCssPx },
    { x: 0, y: -paddingCssPx },
    { x: diagonal, y: diagonal },
    { x: diagonal, y: -diagonal },
    { x: -diagonal, y: diagonal },
    { x: -diagonal, y: -diagonal },
  ];
};
