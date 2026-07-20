import { wrapFrame, type MotionClipV1 } from "@ltypet/character-motion";
import type { CollectedMotionEvent } from "./types";

export interface PlaybackPosition {
  absoluteFrame: number;
  sampleFrame: number;
  completed: boolean;
}

export const getPlaybackPosition = (
  elapsedMs: number,
  clip: Pick<MotionClipV1, "fps" | "durationFrames" | "loop">,
  speed = 1,
): PlaybackPosition => {
  const safeElapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const absoluteFrame = (safeElapsed / 1000) * clip.fps * safeSpeed;
  const completed = clip.loop === "none" && absoluteFrame >= clip.durationFrames;
  return {
    absoluteFrame,
    sampleFrame: completed
      ? clip.durationFrames
      : wrapFrame(absoluteFrame, clip.durationFrames, clip.loop),
    completed,
  };
};

export const collectCrossedEvents = (
  clip: Pick<MotionClipV1, "durationFrames" | "loop" | "events">,
  previousAbsoluteFrame: number,
  nextAbsoluteFrame: number,
): CollectedMotionEvent[] => {
  if (nextAbsoluteFrame < previousAbsoluteFrame || clip.events.length === 0) return [];
  const duration = clip.durationFrames;
  const firstCycle = clip.loop === "repeat"
    ? Math.max(0, Math.floor(previousAbsoluteFrame / duration))
    : 0;
  const lastCycle = clip.loop === "repeat"
    ? Math.max(0, Math.floor(nextAbsoluteFrame / duration))
    : 0;
  const collected: CollectedMotionEvent[] = [];

  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    for (const event of clip.events) {
      const absoluteEventFrame = cycle * duration + event.frame;
      const startsAtZero = previousAbsoluteFrame < 0 && absoluteEventFrame === 0;
      if (
        (absoluteEventFrame > previousAbsoluteFrame || startsAtZero) &&
        absoluteEventFrame <= nextAbsoluteFrame &&
        (clip.loop === "repeat" || absoluteEventFrame <= duration)
      ) {
        collected.push({ cycle, event });
      }
    }
  }
  return collected;
};
