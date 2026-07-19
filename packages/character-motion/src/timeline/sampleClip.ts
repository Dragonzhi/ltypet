/**
 * Samples all part tracks of a motion clip at a given frame.
 * Returns authored transforms and render slots per part.
 */

import type {
  CharacterRigV1,
  MotionClipV1,
  TransformValue,
} from "../types.js";
import { samplePropertyAtFrame, sampleRenderSlotAtFrame } from "./sampleProperty.js";

/**
 * Samples a complete motion clip at the given frame.
 *
 * @param clip - The motion clip to sample
 * @param frame - The frame to sample at (should already be wrapped/clamped)
 * @param rig - The character rig (used for default values)
 * @returns Authored transforms and render slots per part ID
 */
export function sampleMotionClip(
  clip: MotionClipV1,
  frame: number,
  _rig: CharacterRigV1,
): {
  transforms: Map<string, TransformValue>;
  renderSlots: Map<string, string>;
} {
  const transforms = new Map<string, TransformValue>();
  const renderSlots = new Map<string, string>();

  for (const track of clip.tracks) {
    const { partId, keyframes } = track;

    const transform: TransformValue = {
      x: samplePropertyAtFrame(keyframes, frame, "x"),
      y: samplePropertyAtFrame(keyframes, frame, "y"),
      rotation: samplePropertyAtFrame(keyframes, frame, "rotation"),
      scaleX: samplePropertyAtFrame(keyframes, frame, "scaleX"),
      scaleY: samplePropertyAtFrame(keyframes, frame, "scaleY"),
      opacity: samplePropertyAtFrame(keyframes, frame, "opacity"),
    };
    transforms.set(partId, transform);

    const renderSlot = sampleRenderSlotAtFrame(keyframes, frame, partId);
    if (renderSlot !== null) {
      renderSlots.set(partId, renderSlot);
    }
  }

  return { transforms, renderSlots };
}
