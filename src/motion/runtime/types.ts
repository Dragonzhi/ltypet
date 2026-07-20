import type {
  CharacterRigV1,
  MotionClipV1,
  MotionEventV1,
  MotionLibraryV1,
  ProceduralChannel,
} from "@ltypet/character-motion";

export type RuntimeDiagnosticCode =
  | "invalid-rig"
  | "invalid-motions"
  | "artwork-source-mismatch"
  | "artwork-fingerprint-mismatch"
  | "artwork-viewbox-mismatch"
  | "missing-source-binding"
  | "duplicate-source-binding"
  | "missing-wave"
  | "unsupported-event";

export interface RuntimeDiagnostic {
  code: RuntimeDiagnosticCode;
  message: string;
  path?: string;
  severity: "error" | "warn";
}

export interface ValidatedMotionBundle {
  artworkText: string;
  rig: CharacterRigV1;
  motions: MotionLibraryV1;
  clips: ReadonlyMap<string, MotionClipV1>;
  warnings: RuntimeDiagnostic[];
}

export type MotionBundleState =
  | { status: "loading" }
  | { status: "ready"; bundle: ValidatedMotionBundle }
  | { status: "error"; diagnostics: RuntimeDiagnostic[] };

export interface MotionEventHandlers {
  onBlink?: () => void;
  onMouthOpen?: () => void;
  onMouthClose?: () => void;
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
}

export interface MotionPlayerTarget {
  applyFrame(clip: MotionClipV1, frame: number): void;
  restore(): void;
}

export interface MotionPlaybackCallbacks extends MotionEventHandlers {
  onSuppressionChange?: (channels: ReadonlySet<ProceduralChannel>) => void;
}

export interface MotionPlaybackRequest {
  clip: MotionClipV1;
  speed?: number;
  signal?: AbortSignal;
  reducedMotion?: boolean;
}

export interface CollectedMotionEvent {
  cycle: number;
  event: MotionEventV1;
}
