/**
 * Sparse keyframe sampling per property.
 * Interpolates between keyframes using the easing from the left keyframe.
 * Holds first/last value at boundaries.
 */

import type { MotionKeyframeV1, TransformValue } from "../types";
import { applyEasing } from "./easing";

type TransformProperty = keyof TransformValue;

/**
 * The default values for each transform property when no keyframes exist.
 */
const DEFAULT_VALUES: Record<TransformProperty, number> = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

/**
 * Samples a single property at a given frame from a set of keyframes.
 *
 * Rules:
 * - No keyframes for property → return defaultValue
 * - Before first keyframe → hold first value
 * - After last keyframe → hold last value
 * - Between two keyframes → interpolate with easing from the left keyframe
 *
 * @param keyframes - All keyframes for a part track
 * @param frame - The frame to sample at
 * @param property - The property to sample
 * @param defaultValue - Fallback value if no keyframes define this property
 * @returns The interpolated property value
 */
export function samplePropertyAtFrame(
  keyframes: MotionKeyframeV1[],
  frame: number,
  property: TransformProperty,
  defaultValue: number = DEFAULT_VALUES[property],
): number {
  // Collect keyframes that define this property, sorted by frame
  const relevant = keyframes
    .filter((kf) => kf.values[property] !== undefined)
    .sort((a, b) => a.frame - b.frame);

  if (relevant.length === 0) {
    return defaultValue;
  }

  // Before or at first keyframe
  if (frame <= relevant[0].frame) {
    return relevant[0].values[property]!;
  }

  // After or at last keyframe
  if (frame >= relevant[relevant.length - 1].frame) {
    return relevant[relevant.length - 1].values[property]!;
  }

  // Between two keyframes — find the surrounding pair
  for (let i = 0; i < relevant.length - 1; i++) {
    const left = relevant[i];
    const right = relevant[i + 1];

    if (frame >= left.frame && frame < right.frame) {
      const leftVal = left.values[property]!;
      const rightVal = right.values[property]!;

      // Frame range
      const range = right.frame - left.frame;
      if (range <= 0) {
        return leftVal;
      }

      // Normalized progress
      const t = (frame - left.frame) / range;

      // Apply easing
      const easedT = applyEasing(t, left.easing);

      // Linear interpolation with eased t
      return leftVal + (rightVal - leftVal) * easedT;
    }
  }

  return defaultValue;
}

/**
 * Samples the render slot at a given frame for a given part.
 * Uses "step" hold — returns the value from the nearest keyframe
 * at or before the current frame.
 *
 * @param keyframes - All keyframes for a part track
 * @param frame - The frame to sample at
 * @param partId - The part ID (used for context in keyframe selection)
 * @returns The render slot string, or null if no keyframe defines it at or before this frame
 */
export function sampleRenderSlotAtFrame(
  keyframes: MotionKeyframeV1[],
  frame: number,
  _partId: string,
): string | null {
  // Collect keyframes that define renderSlot, sorted by frame
  const relevant = keyframes
    .filter((kf) => kf.values.renderSlot !== undefined)
    .sort((a, b) => a.frame - b.frame);

  if (relevant.length === 0) {
    return null;
  }

  // Find the nearest keyframe at or before `frame`
  let result: string | null = null;
  for (const kf of relevant) {
    if (kf.frame <= frame) {
      result = kf.values.renderSlot!;
    } else {
      break;
    }
  }

  return result;
}
