import { OBSERVATION_REACTION_COOLDOWN_MS } from "../../config/observation";
import type { CapabilitySet } from "../capabilities/capabilities";
import type { ObservationEvent, ObservationReaction } from "./types";

/**
 * M13-A 只提供保守的开发 Agent 状态反应。媒体事件在 M13-B 获得专用
 * 持续律动状态前不映射成一次性动作，避免拿 wave/stretch 冒充音乐反应。
 */
export function mapObservationToReaction(
  event: ObservationEvent,
  capabilities: CapabilitySet,
): ObservationReaction | null {
  if (event.type === "media.playback") return null;
  const renderer = capabilities.renderer;
  if (!renderer) return null;
  switch (event.payload.state) {
    case "waiting_for_user":
      return renderer.expressions.includes("blink")
        ? { type: "expression.set", payload: { expression: "blink", durationMs: 350 }, cooldownMs: OBSERVATION_REACTION_COOLDOWN_MS }
        : null;
    case "completed":
      return renderer.motions.includes("wave")
        ? { type: "motion.play", payload: { motion: "wave", speed: 1 }, cooldownMs: OBSERVATION_REACTION_COOLDOWN_MS }
        : null;
    case "failed":
      return renderer.motions.includes("bow")
        ? { type: "motion.play", payload: { motion: "bow", speed: 0.85 }, cooldownMs: OBSERVATION_REACTION_COOLDOWN_MS }
        : null;
    case "session_started":
    case "working":
    case "stopped":
      return null;
  }
}
