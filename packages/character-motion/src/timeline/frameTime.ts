/**
 * Frame-to-time and time-to-frame conversion utilities.
 */

/**
 * Converts a frame number to time in milliseconds.
 */
export function frameToTime(frame: number, fps: number): number {
  if (fps <= 0 || !Number.isFinite(fps)) {
    return 0;
  }
  return (frame / fps) * 1000;
}

/**
 * Converts a time in milliseconds to a frame number (may be fractional).
 */
export function timeToFrame(timeMs: number, fps: number): number {
  if (fps <= 0 || !Number.isFinite(fps)) {
    return 0;
  }
  return (timeMs / 1000) * fps;
}

/**
 * Wraps a frame number within clip boundaries based on loop mode.
 *
 * - "none": clamps to the inclusive authored range [0, durationFrames]
 * - "repeat": wraps modulo durationFrames
 *
 * @param frame - The raw frame number (may be negative)
 * @param durationFrames - The total number of frames in the clip (positive integer)
 * @param loop - The loop mode
 * @returns A frame number in the clip's legal authored range
 */
export function wrapFrame(
  frame: number,
  durationFrames: number,
  loop: "none" | "repeat",
): number {
  if (durationFrames <= 0 || !Number.isFinite(durationFrames)) {
    return 0;
  }

  if (loop === "repeat") {
    // Handle negative frames properly with modulo
    const wrapped = ((frame % durationFrames) + durationFrames) % durationFrames;
    return wrapped;
  }

  // "none": clamp
  return Math.max(0, Math.min(frame, durationFrames));
}
