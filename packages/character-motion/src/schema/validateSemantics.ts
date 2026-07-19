/**
 * Semantic validation for rig and motion library data.
 * Checks relationships, constraints, and business rules after structural validation.
 */

import type {
  CharacterRigV1,
  MotionLibraryV1,
  MotionClipV1,
  RigPartV1,
  ValidationIssue,
} from "../types.js";
import { determinant } from "../math/affine2d.js";

// ─── Epsilon for singular matrix detection ───────────────────────

const SINGULAR_EPSILON = 1e-12;

// ─── Valid Event Types ──────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  "blink",
  "mouthOpen",
  "mouthClose",
  "sfx",
  "custom",
]);

// ─── Rig Semantic Validation ─────────────────────────────────────

/**
 * Validates semantic constraints for a character rig.
 */
export function validateRigSemantics(
  rig: CharacterRigV1,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const partIds = new Set<string>();
  const renderSlotSet = new Set(rig.renderSlots);
  const sourceBindings = new Set<string>();

  // Check for duplicate part IDs and sourceBinding uniqueness
  for (const part of rig.parts) {
    if (partIds.has(part.id)) {
      issues.push({
        code: "duplicate-part-id",
        path: `/parts/${part.id}`,
        message: `Duplicate part ID: "${part.id}"`,
        severity: "error",
      });
    }
    partIds.add(part.id);

    // Source binding uniqueness (kind:value)
    const bindingKey = `${part.sourceBinding.kind}:${part.sourceBinding.value}`;
    if (sourceBindings.has(bindingKey)) {
      issues.push({
        code: "duplicate-source-binding",
        path: `/parts/${part.id}/sourceBinding`,
        message: `Duplicate source binding: "${bindingKey}"`,
        severity: "error",
      });
    }
    sourceBindings.add(bindingKey);

    // Check render slot exists
    if (!renderSlotSet.has(part.defaultRenderSlot)) {
      issues.push({
        code: "unknown-render-slot",
        path: `/parts/${part.id}/defaultRenderSlot`,
        message: `Part "${part.id}" references unknown render slot "${part.defaultRenderSlot}"`,
        severity: "error",
      });
    }

    // Check bind matrix is not singular
    const det = determinant(part.bindMatrix);
    if (Math.abs(det) < SINGULAR_EPSILON) {
      issues.push({
        code: "singular-bind-matrix",
        path: `/parts/${part.id}/bindMatrix`,
        message: `Part "${part.id}" has singular bind matrix (determinant ≈ ${det})`,
        severity: "error",
      });
    }
  }

  // Check for self-parent and unknown parent
  for (const part of rig.parts) {
    if (part.logicalParentId !== null) {
      if (part.logicalParentId === part.id) {
        issues.push({
          code: "self-parent",
          path: `/parts/${part.id}/logicalParentId`,
          message: `Part "${part.id}" cannot be its own parent`,
          severity: "error",
        });
      } else if (!partIds.has(part.logicalParentId)) {
        issues.push({
          code: "unknown-parent",
          path: `/parts/${part.id}/logicalParentId`,
          message: `Part "${part.id}" references unknown parent "${part.logicalParentId}"`,
          severity: "error",
        });
      }
    }
  }

  // Check for cycles (Kahn's algorithm)
  const cycleIssues = detectCycles(rig.parts);
  issues.push(...cycleIssues);

  return issues;
}

/**
 * Detects cycles in the part hierarchy using Kahn's algorithm.
 */
function detectCycles(parts: RigPartV1[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build graph
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const part of parts) {
    inDegree.set(part.id, 0);
    children.set(part.id, []);
  }

  for (const part of parts) {
    if (part.logicalParentId !== null && inDegree.has(part.logicalParentId)) {
      children.get(part.logicalParentId)!.push(part.id);
      inDegree.set(part.id, (inDegree.get(part.id) ?? 0) + 1);
    }
  }

  // Kahn
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited.add(id);
    for (const childId of children.get(id) ?? []) {
      const newDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, newDeg);
      if (newDeg === 0) {
        queue.push(childId);
      }
    }
  }

  if (visited.size !== parts.length) {
    // Find cycle participants
    const cycleParts = parts.filter((p) => !visited.has(p.id));
    for (const part of cycleParts) {
      issues.push({
        code: "cycle-detected",
        path: `/parts/${part.id}`,
        message: `Part "${part.id}" is part of a cycle in the hierarchy`,
        severity: "error",
      });
    }
  }

  return issues;
}

// ─── Motion Library Semantic Validation ──────────────────────────

/**
 * Validates semantic constraints for a motion library against its rig.
 */
export function validateMotionSemantics(
  motions: MotionLibraryV1,
  rig: CharacterRigV1,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check rig ID matches
  if (motions.rigId !== rig.rigId) {
    issues.push({
      code: "rig-id-mismatch",
      path: "/rigId",
      message: `Motion library rigId "${motions.rigId}" does not match rig rigId "${rig.rigId}"`,
      severity: "error",
    });
  }

  const rigPartIds = new Set(rig.parts.map((p) => p.id));
  const rigRenderSlots = new Set(rig.renderSlots);
  const clipIds = new Set<string>();

  for (const clip of motions.clips) {
    // Duplicate clip IDs
    if (clipIds.has(clip.id)) {
      issues.push({
        code: "duplicate-clip-id",
        path: `/clips/${clip.id}`,
        message: `Duplicate clip ID: "${clip.id}"`,
        severity: "error",
      });
    }
    clipIds.add(clip.id);

    // Check tracks
    issues.push(...validateClipTracks(clip, rigPartIds, rigRenderSlots));

    // Check events
    issues.push(...validateClipEvents(clip));

    // Check suppressProceduralChannels
    issues.push(...validateSuppressChannels(clip));
  }

  return issues;
}

function validateClipTracks(
  clip: MotionClipV1,
  rigPartIds: Set<string>,
  rigRenderSlots: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trackPartIds = new Set<string>();

  for (const track of clip.tracks) {
    // Duplicate track part IDs
    if (trackPartIds.has(track.partId)) {
      issues.push({
        code: "duplicate-track-part-id",
        path: `/clips/${clip.id}/tracks/${track.partId}`,
        message: `Duplicate track for part "${track.partId}" in clip "${clip.id}"`,
        severity: "error",
      });
    }
    trackPartIds.add(track.partId);

    // Unknown part ID
    if (!rigPartIds.has(track.partId)) {
      issues.push({
        code: "unknown-track-part",
        path: `/clips/${clip.id}/tracks/${track.partId}`,
        message: `Track references unknown part "${track.partId}" in clip "${clip.id}"`,
        severity: "error",
      });
    }

    const keyframeFrames = new Set<number>();

    // Check keyframe frame uniqueness, bounds, and render slots
    for (const kf of track.keyframes) {
      if (keyframeFrames.has(kf.frame)) {
        issues.push({
          code: "duplicate-keyframe-frame",
          path: `/clips/${clip.id}/tracks/${track.partId}/keyframes/${kf.frame}`,
          message: `Track "${track.partId}" has more than one keyframe at frame ${kf.frame}`,
          severity: "error",
        });
      }
      keyframeFrames.add(kf.frame);

      if (kf.frame > clip.durationFrames) {
        issues.push({
          code: "keyframe-out-of-range",
          path: `/clips/${clip.id}/tracks/${track.partId}/keyframes/${kf.frame}`,
          message: `Keyframe ${kf.frame} exceeds durationFrames ${clip.durationFrames}`,
          severity: "error",
        });
      }

      if (
        kf.values.renderSlot !== undefined &&
        !rigRenderSlots.has(kf.values.renderSlot)
      ) {
        issues.push({
          code: "keyframe-unknown-render-slot",
          path: `/clips/${clip.id}/tracks/${track.partId}/keyframes/${kf.frame}`,
          message: `Keyframe at frame ${kf.frame} references unknown render slot "${kf.values.renderSlot}"`,
          severity: "error",
        });
      }
    }
  }

  return issues;
}

function validateClipEvents(clip: MotionClipV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < clip.events.length; i++) {
    const event = clip.events[i];

    if (event.frame > clip.durationFrames) {
      issues.push({
        code: "event-out-of-range",
        path: `/clips/${clip.id}/events/${i}/frame`,
        message: `Event frame ${event.frame} exceeds durationFrames ${clip.durationFrames}`,
        severity: "error",
      });
    }

    if (!VALID_EVENT_TYPES.has(event.type)) {
      issues.push({
        code: "invalid-event-type",
        path: `/clips/${clip.id}/events/${i}/type`,
        message: `Invalid event type "${event.type}" in clip "${clip.id}"`,
        severity: "error",
      });
    }
  }

  return issues;
}

function validateSuppressChannels(clip: MotionClipV1): ValidationIssue[] {
  const VALID_CHANNELS = new Set([
    "breathing",
    "blinking",
    "pointer-follow",
    "hair-physics",
    "ear-twitch",
  ]);

  const issues: ValidationIssue[] = [];

  if (clip.suppressProceduralChannels) {
    for (const channel of clip.suppressProceduralChannels) {
      if (!VALID_CHANNELS.has(channel)) {
        issues.push({
          code: "invalid-suppress-channel",
          path: `/clips/${clip.id}/suppressProceduralChannels`,
          message: `Invalid procedural channel "${channel}" in clip "${clip.id}"`,
          severity: "error",
        });
      }
    }
  }

  return issues;
}
