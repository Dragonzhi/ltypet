/**
 * World-space pose resolution from authored transforms.
 * Computes the world matrix for a given part by composing:
 * world(parent) × bindMatrix(part) × authoredMotion(part)
 */

import type {
  AffineMatrix,
  CharacterRigV1,
  TransformValue,
} from "../types";
import { composeAroundPivot, multiply } from "../math/affine2d";
import { topologicalOrder } from "./dependencyGraph";

/**
 * Resolves the world-space pose for all parts given authored transforms.
 *
 * @param authoredTransforms - Map of part ID to authored transform values
 * @param rig - The character rig
 * @returns Object containing resolved world matrices and render slots per part
 */
export function resolveAllPoses(
  authoredTransforms: Map<string, TransformValue>,
  rig: CharacterRigV1,
): {
  worldMatrices: Map<string, AffineMatrix>;
  renderSlots: Map<string, string>;
} {
  const sortedParts = topologicalOrder(rig.parts);
  const worldMatrices = new Map<string, AffineMatrix>();
  const renderSlots = new Map<string, string>();

  for (const part of sortedParts) {
    const authored = authoredTransforms.get(part.id) ?? defaultTransform();

    // Compute authored motion matrix: composeAroundPivot(tx, ty, rot, sx, sy, px, py)
    const authoredMatrix = composeAroundPivot(
      authored.x,
      authored.y,
      authored.rotation,
      authored.scaleX,
      authored.scaleY,
      part.pivot.x,
      part.pivot.y,
    );

    // Bind matrix from rig
    const bindMatrix = part.bindMatrix;

    // Parent world matrix
    let worldMatrix: AffineMatrix;
    if (part.logicalParentId === null) {
      // Root part: world = bindMatrix × authoredMotion
      worldMatrix = multiply(bindMatrix, authoredMatrix);
    } else {
      // Child part: world = world(parent) × bindMatrix × authoredMotion
      const parentWorld = worldMatrices.get(part.logicalParentId);
      if (parentWorld === undefined) {
        throw new Error(
          `Parent "${part.logicalParentId}" not resolved for part "${part.id}"`,
        );
      }
      worldMatrix = multiply(parentWorld, multiply(bindMatrix, authoredMatrix));
    }

    worldMatrices.set(part.id, worldMatrix);

    // Render slot: use default from rig unless overridden
    renderSlots.set(part.id, part.defaultRenderSlot);
  }

  return { worldMatrices, renderSlots };
}

/**
 * Resolves a single part's world pose.
 *
 * @param partId - The part to resolve
 * @param authoredTransform - The authored transform for the part
 * @param rig - The character rig
 * @param resolvedParents - Pre-resolved world matrices for parents
 * @returns The world matrix and render slot for the part
 */
export function resolveWorldPose(
  partId: string,
  authoredTransform: TransformValue,
  rig: CharacterRigV1,
  resolvedParents: Map<string, AffineMatrix>,
): { worldMatrix: AffineMatrix; renderSlot: string } {
  const part = rig.parts.find((p) => p.id === partId);
  if (!part) {
    throw new Error(`Part "${partId}" not found in rig`);
  }

  // Authored motion matrix
  const authoredMatrix = composeAroundPivot(
    authoredTransform.x,
    authoredTransform.y,
    authoredTransform.rotation,
    authoredTransform.scaleX,
    authoredTransform.scaleY,
    part.pivot.x,
    part.pivot.y,
  );

  // Bind matrix
  const bindMatrix = part.bindMatrix;

  // Compose
  let worldMatrix: AffineMatrix;
  if (part.logicalParentId === null) {
    worldMatrix = multiply(bindMatrix, authoredMatrix);
  } else {
    const parentWorld = resolvedParents.get(part.logicalParentId);
    if (parentWorld === undefined) {
      throw new Error(
        `Parent "${part.logicalParentId}" not found in resolvedParents for part "${partId}"`,
      );
    }
    worldMatrix = multiply(parentWorld, multiply(bindMatrix, authoredMatrix));
  }

  return { worldMatrix, renderSlot: part.defaultRenderSlot };
}

function defaultTransform(): TransformValue {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
}
