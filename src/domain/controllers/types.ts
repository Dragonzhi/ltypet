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
  setMediaReaction(state: "playing" | "paused" | "stopped"): void;
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

export type TimerStatus = "running" | "paused";
export type TimerKind = "focus" | "break" | "custom";

export interface TimerSnapshot {
  schemaVersion: number;
  timerId: string;
  kind: TimerKind;
  label: string;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  startedAtUnixMs: number;
  updatedAtUnixMs: number;
  deadlineUnixMs: number | null;
  showSystemReminder: boolean;
  soundEnabled: boolean;
}

export interface TimerStartOptions {
  timerId: string;
  durationMs: number;
  label?: string;
  kind?: TimerKind;
  /** 省略时由原生层读取已保存的番茄钟偏好。 */
  showSystemReminder?: boolean;
  /** 省略时由原生层读取番茄钟与全局声音偏好。 */
  soundEnabled?: boolean;
}

export interface TimerStateEvent {
  reason: "started" | "paused" | "resumed" | "cancelled" | "finished";
  timer: TimerSnapshot | null;
}

export interface TimerController {
  getState(): Promise<TimerSnapshot | null>;
  start(options: TimerStartOptions): Promise<TimerSnapshot>;
  pause(timerId: string): Promise<TimerSnapshot>;
  resume(timerId: string): Promise<TimerSnapshot>;
  cancel(timerId: string): Promise<TimerSnapshot>;
  onStateChange(listener: (event: TimerStateEvent) => void): Promise<() => void>;
  onFinished(listener: (timer: TimerSnapshot) => void): Promise<() => void>;
  dispose(): void;
}
