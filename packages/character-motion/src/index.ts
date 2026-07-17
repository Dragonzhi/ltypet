/**
 * @ltypet/character-motion public API.
 * Only exports from this barrel — internal modules must NOT be imported by consumers.
 */

// Types
export type {
  AffineMatrix,
  TransformValue,
  EasingValue,
  ProceduralChannel,
  SourceBinding,
  PivotPoint,
  RigPartV1,
  ArtworkReference,
  CharacterRigV1,
  MotionKeyframeV1,
  PartTrackV1,
  MotionEventType,
  MotionEventV1,
  MotionClipV1,
  MotionLibraryV1,
  ValidationIssue,
  ValidationResult,
} from "./types";

// Math
export {
  identity,
  multiply,
  invert,
  translate,
  rotateDegrees,
  scale,
  transformPoint,
  determinant,
  approximatelyEqual,
  composeAroundPivot,
  computePivotInPartLocal,
} from "./math";

// Timeline
export {
  applyEasing,
  frameToTime,
  timeToFrame,
  wrapFrame,
  samplePropertyAtFrame,
  sampleRenderSlotAtFrame,
  sampleMotionClip,
} from "./timeline";

// Rig
export {
  topologicalOrder,
  resolveWorldPose,
  resolveAllPoses,
} from "./rig";

// Serialization
export {
  canonicalizeArtworkText,
  canonicalizeRig,
  canonicalizeMotionLibrary,
  serializeRig,
  serializeMotionLibrary,
  sha256CanonicalText,
} from "./serialization";

// Migration
export { migrateP0ToV1 } from "./migration";
export type { P0ExperimentalProject } from "./migration";

// Schema / Validation
export {
  validateRig,
  validateMotionLibrary,
  validateRigStructure,
  validateMotionsStructure,
  validateRigSemantics,
  validateMotionSemantics,
} from "./schema";
