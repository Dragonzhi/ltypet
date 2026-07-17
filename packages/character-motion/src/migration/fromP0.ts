/**
 * Migration utilities from P0 experimental format to V1.
 */

import type {
  CharacterRigV1,
  MotionLibraryV1,
  MotionClipV1,
  MotionKeyframeV1,
  ValidationIssue,
} from "../types";
import { canonicalizeMotionLibrary } from "../serialization/canonicalize";

/**
 * P0 experimental project format (pre-v1).
 * Contains a single clip with rotation keyframes for one part.
 */
export interface P0ExperimentalProject {
  experimentalSchema: string;
  productionReady: boolean;
  sourceFingerprint: string;
  clip: {
    id: string;
    partId: string;
    fps: number;
    durationFrames: number;
    pivot: { x: number; y: number };
    keyframes: {
      frame: number;
      rotation: number;
      easing: string;
    }[];
  };
}

/**
 * Validates that the input is a proper P0ExperimentalProject.
 */
function isValidP0(input: unknown): input is P0ExperimentalProject {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  if (typeof obj.experimentalSchema !== "string") return false;
  if (typeof obj.productionReady !== "boolean") return false;
  if (typeof obj.sourceFingerprint !== "string") return false;
  if (typeof obj.clip !== "object" || obj.clip === null) return false;

  const clip = obj.clip as Record<string, unknown>;
  if (typeof clip.id !== "string") return false;
  if (typeof clip.partId !== "string") return false;
  if (typeof clip.fps !== "number" || !Number.isFinite(clip.fps)) return false;
  if (typeof clip.durationFrames !== "number" || !Number.isFinite(clip.durationFrames)) return false;
  if (typeof clip.pivot !== "object" || clip.pivot === null) return false;
  if (!Array.isArray(clip.keyframes)) return false;

  const pivot = clip.pivot as Record<string, unknown>;
  if (typeof pivot.x !== "number" || typeof pivot.y !== "number") return false;

  return true;
}

/**
 * Maps a P0 easing string to a V1 EasingValue.
 */
function mapEasing(easing: string): "linear" | "easeIn" | "easeOut" | "easeInOut" {
  switch (easing) {
    case "linear":
      return "linear";
    case "easeIn":
    case "ease-in":
    case "ease_in":
      return "easeIn";
    case "easeOut":
    case "ease-out":
    case "ease_out":
      return "easeOut";
    case "easeInOut":
    case "ease-in-out":
    case "ease_in_out":
      return "easeInOut";
    default:
      return "linear";
  }
}

/**
 * Migrates a P0 experimental project to a V1 MotionLibrary.
 *
 * @param p0 - The P0 project data (validated at runtime)
 * @param rig - The target V1 rig (used to look up part pivots)
 * @param canonicalFingerprint - The canonical fingerprint string ("sha256:...")
 * @returns The migrated V1 motion library and any warnings
 * @throws {Error} If the input is not valid P0 format
 */
export function migrateP0ToV1(
  p0: unknown,
  rig: CharacterRigV1,
  canonicalFingerprint: string,
): { motion: MotionLibraryV1; warnings: ValidationIssue[] } {
  const warnings: ValidationIssue[] = [];

  if (!isValidP0(p0)) {
    throw new Error("Input is not a valid P0 experimental project");
  }

  const p0Project = p0 as P0ExperimentalProject;

  // Check fingerprint match
  if (p0Project.sourceFingerprint !== canonicalFingerprint) {
    warnings.push({
      code: "fingerprint-mismatch",
      path: "/sourceFingerprint",
      message:
        "P0 source fingerprint does not match canonical fingerprint — artwork may have changed",
      severity: "warn",
    });
  }

  // Find the part in the rig
  const part = rig.parts.find((p) => p.id === p0Project.clip.partId);
  if (!part) {
    warnings.push({
      code: "unknown-part",
      path: `/clip/${p0Project.clip.id}/partId`,
      message: `Part "${p0Project.clip.partId}" not found in rig`,
      severity: "warn",
    });
  }

  // Convert P0 keyframes to V1 keyframes
  const keyframes: MotionKeyframeV1[] = p0Project.clip.keyframes.map(
    (kf) => ({
      frame: kf.frame,
      values: {
        rotation: kf.rotation,
      },
      easing: mapEasing(kf.easing),
    }),
  );

  // Create clip
  const clip: MotionClipV1 = {
    id: p0Project.clip.id,
    fps: p0Project.clip.fps,
    durationFrames: p0Project.clip.durationFrames,
    loop: "repeat",
    tracks: [
      {
        partId: p0Project.clip.partId,
        keyframes,
      },
    ],
    events: [],
  };

  const motion: MotionLibraryV1 = {
    schemaVersion: 1,
    rigId: rig.rigId,
    clips: [clip],
  };

  // Canonicalize output
  const canonical = canonicalizeMotionLibrary(motion);

  return { motion: canonical, warnings };
}
