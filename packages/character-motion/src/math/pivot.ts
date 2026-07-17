/**
 * Pivot computation utilities.
 * Converts between coordinate spaces using affine matrices.
 */

import type { AffineMatrix } from "../types";
import { invert, transformPoint } from "./affine2d";

/**
 * Computes the pivot point in part-local space given the part's world
 * matrix and the pivot's world-space coordinates.
 *
 * Returns null if the part's world matrix is singular (not invertible).
 *
 * Part-local pivot = inverse(partWorldMatrix) × pivotWorldPoint
 */
export function computePivotInPartLocal(
  partWorldMatrix: AffineMatrix,
  pivotWorldPoint: { x: number; y: number },
): { x: number; y: number } | null {
  const inv = invert(partWorldMatrix);
  if (inv === null) {
    return null;
  }
  return transformPoint(inv, pivotWorldPoint);
}
