export const normalizeDragVelocity = (
  deltaPx: number,
  deltaMs: number,
  velocityForMaxPxPerMs: number,
) => {
  const safeDeltaMs = Math.max(8, Math.min(64, deltaMs));
  const normalized = deltaPx / safeDeltaMs / velocityForMaxPxPerMs;
  return Math.max(-1, Math.min(1, normalized));
};

export const distanceBetweenPoints = (
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
) => Math.hypot(currentX - startX, currentY - startY);

export const exceedsDragThreshold = (
  distancePx: number,
  thresholdPx: number,
) => distancePx >= thresholdPx;

export const scaleHairRotation = (rotationDeg: number, ratio: number) =>
  rotationDeg * ratio;
