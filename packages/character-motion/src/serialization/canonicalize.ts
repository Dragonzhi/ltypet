/**
 * Canonical serialization for rig and motion library data.
 * Ensures deterministic JSON output regardless of input key order.
 */

import type {
  CharacterRigV1,
  MotionLibraryV1,
  MotionClipV1,
  PartTrackV1,
  MotionKeyframeV1,
  MotionEventV1,
  AffineMatrix,
  RigPartV1,
} from "../types";

// ─── Artwork Text Canonicalization ───────────────────────────────

/**
 * Canonicalizes artwork text:
 * 1. UTF-8 encode/decode (guarantees valid UTF-8)
 * 2. CRLF → LF normalization
 * 3. NFC normalization
 */
export function canonicalizeArtworkText(text: string): string {
  // Normalize line endings: CRLF → LF
  let normalized = text.replace(/\r\n/g, "\n");
  // Also handle standalone CR
  normalized = normalized.replace(/\r/g, "\n");
  // NFC normalization
  normalized = normalized.normalize("NFC");
  return normalized;
}

// ─── Number Canonicalization ─────────────────────────────────────

function canonicalNumber(n: number): number {
  if (Object.is(n, -0)) return 0;
  if (!Number.isFinite(n)) return 0;
  return n;
}

function canonicalAffineMatrix(m: AffineMatrix): AffineMatrix {
  return m.map(canonicalNumber) as AffineMatrix;
}

// ─── Rig Canonicalization ────────────────────────────────────────

/**
 * Returns a canonical form of the rig with sorted keys and ordered arrays.
 */
export function canonicalizeRig(rig: CharacterRigV1): CharacterRigV1 {
  return {
    schemaVersion: 1,
    rigId: rig.rigId,
    artwork: {
      source: rig.artwork.source,
      fingerprint: rig.artwork.fingerprint,
      viewBox: rig.artwork.viewBox.map(canonicalNumber) as [number, number, number, number],
    },
    renderSlots: [...rig.renderSlots],
    parts: [...rig.parts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(canonicalizePart),
  };
}

function canonicalizePart(part: RigPartV1): RigPartV1 {
  const result: RigPartV1 = {
    id: part.id,
    sourceBinding: {
      kind: part.sourceBinding.kind,
      value: part.sourceBinding.value,
    },
    logicalParentId: part.logicalParentId,
    defaultRenderSlot: part.defaultRenderSlot,
    pivot: {
      x: canonicalNumber(part.pivot.x),
      y: canonicalNumber(part.pivot.y),
      space: "partLocal",
    },
    bindMatrix: canonicalAffineMatrix(part.bindMatrix),
  };

  if (part.tags && part.tags.length > 0) {
    result.tags = [...new Set(part.tags)].sort();
  }

  return result;
}

// ─── Motion Library Canonicalization ─────────────────────────────

/**
 * Returns a canonical form of the motion library with sorted keys and ordered arrays.
 */
export function canonicalizeMotionLibrary(
  lib: MotionLibraryV1,
): MotionLibraryV1 {
  return {
    schemaVersion: 1,
    rigId: lib.rigId,
    clips: [...lib.clips]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(canonicalizeClip),
  };
}

function canonicalizeClip(clip: MotionClipV1): MotionClipV1 {
  const result: MotionClipV1 = {
    id: clip.id,
    fps: clip.fps,
    durationFrames: clip.durationFrames,
    loop: clip.loop,
    tracks: [...clip.tracks]
      .sort((a, b) => a.partId.localeCompare(b.partId))
      .map(canonicalizeTrack),
    events: [...clip.events]
      .sort((a, b) => {
        if (a.frame !== b.frame) return a.frame - b.frame;
        return a.type.localeCompare(b.type);
      })
      .map(canonicalizeEvent),
  };

  if (
    clip.suppressProceduralChannels &&
    clip.suppressProceduralChannels.length > 0
  ) {
    result.suppressProceduralChannels = [...new Set(clip.suppressProceduralChannels)].sort();
  }

  return result;
}

function canonicalizeTrack(track: PartTrackV1): PartTrackV1 {
  return {
    partId: track.partId,
    keyframes: [...track.keyframes]
      .sort((a, b) => a.frame - b.frame)
      .map(canonicalizeKeyframe),
  };
}

function canonicalizeKeyframe(kf: MotionKeyframeV1): MotionKeyframeV1 {
  const values: Record<string, unknown> = {};
  const transformKeys: (keyof typeof kf.values)[] = [
    "x",
    "y",
    "rotation",
    "scaleX",
    "scaleY",
    "opacity",
    "renderSlot",
  ];

  for (const key of transformKeys) {
    const val = kf.values[key];
    if (val !== undefined) {
      if (typeof val === "number") {
        values[key] = canonicalNumber(val);
      } else {
        values[key] = val;
      }
    }
  }

  return {
    frame: kf.frame,
    values: values as MotionKeyframeV1["values"],
    easing: kf.easing,
  };
}

function canonicalizeEvent(event: MotionEventV1): MotionEventV1 {
  const result: MotionEventV1 = {
    frame: event.frame,
    type: event.type,
  };
  if (event.data !== undefined) {
    result.data = event.data;
  }
  return result;
}

// ─── Serialization ───────────────────────────────────────────────

/**
 * Serializes a rig to canonical JSON string.
 * UTF-8, LF, 2-space indent, trailing newline.
 */
export function serializeRig(rig: CharacterRigV1): string {
  const canonical = canonicalizeRig(rig);
  return JSON.stringify(canonical, null, 2) + "\n";
}

/**
 * Serializes a motion library to canonical JSON string.
 * UTF-8, LF, 2-space indent, trailing newline.
 */
export function serializeMotionLibrary(lib: MotionLibraryV1): string {
  const canonical = canonicalizeMotionLibrary(lib);
  return JSON.stringify(canonical, null, 2) + "\n";
}
