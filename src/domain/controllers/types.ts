import type { RendererCapabilities } from "../capabilities/capabilities";
import type { WindowTarget } from "../actions/types";

// --- Motion playback options ---
export interface MotionOptions {
  speed?: number;
  signal?: AbortSignal;
}

// --- Expression display options ---
export interface ExpressionOptions {
  durationMs?: number;
}

// --- Reasons the renderer may be reset ---
export type ResetReason =
  | "user_override"
  | "renderer_unavailable"
  | "dispose"
  | "interrupt";

// --- Character renderer interface (from plan 4.2) ---
// Implementations wrap specific rendering engines (SVG, Rive, Spine).
// Callers never receive engine objects; they express intent through this interface.
export interface CharacterRenderer {
  getCapabilities(): RendererCapabilities;
  playMotion(name: string, options?: MotionOptions): Promise<void>;
  setLookDirection(x: number, y: number): void;
  setExpression(name: string, options?: ExpressionOptions): Promise<void>;
  equipOutfit(outfitId: string): Promise<void>;
  reset(reason: ResetReason): void;
  dispose(): void;
}

// --- Window move options ---
export interface WindowMoveOptions {
  durationMs?: number;
  /** AbortSignal to cancel the animation mid-flight. */
  signal?: AbortSignal;
}

// --- Window controller interface ---
// Abstracts native window operations so business logic never calls Tauri directly.
export interface WindowController {
  moveTo(target: WindowTarget, options?: WindowMoveOptions): Promise<void>;
  getPosition(): Promise<{ x: number; y: number }>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  center(): Promise<void>;
  dispose(): void;
}
