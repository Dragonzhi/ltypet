import type {
  CharacterRenderer,
  ExpressionOptions,
  MotionOptions,
  ResetReason,
} from "../domain/controllers/types";
import type { RendererCapabilities } from "../domain/capabilities/capabilities";
import type { PetExpression } from "../components/TianyiArtwork";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";
import { productionMotionBundlePromise } from "../motion/runtime/productionBundle";
import {
  MotionPlaybackInterruptedError,
  SvgMotionPlayer,
} from "../motion/runtime/SvgMotionPlayer";
import type { SvgRuntimeRig } from "../motion/runtime/SvgRuntimeRig";
import type {
  RuntimeDiagnostic,
  ValidatedMotionBundle,
} from "../motion/runtime/types";
import { MotionBundleValidationError } from "../motion/runtime/loadCharacterMotionBundle";

export type RendererErrorCode =
  | "unsupported_action"
  | "renderer_unavailable"
  | "invalid_asset";

export class RendererError extends Error {
  readonly code: RendererErrorCode;

  constructor(code: RendererErrorCode, message: string) {
    super(message);
    this.name = "RendererError";
    this.code = code;
  }
}

export interface SvgRendererBinding {
  element: React.RefObject<HTMLDivElement | null>;
  onExpressionChange: (expression: PetExpression) => void;
  onMotionExpressionChange?: (expression: PetExpression | null) => void;
  onSuppressionChange?: (channels: ReadonlySet<string>) => void;
  onCapabilitiesChange?: (capabilities: RendererCapabilities) => void;
}

const px = (value: number) => `${value.toFixed(2)}px`;
const deg = (value: number) => `${value.toFixed(2)}deg`;
const SUPPORTED_EXPRESSIONS = ["normal", "blink", "speak", "sleep"] as const;

export class SvgCharacterRenderer implements CharacterRenderer {
  private readonly binding: SvgRendererBinding;
  private disposed = false;
  private bundle: ValidatedMotionBundle | null = null;
  private bundleError: RuntimeDiagnostic[] | null = null;
  private target: SvgRuntimeRig | null = null;
  private player: SvgMotionPlayer | null = null;
  private currentExpressionTimer: ReturnType<typeof setTimeout> | undefined;
  private motionExpressionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(binding: SvgRendererBinding) {
    this.binding = binding;
    void productionMotionBundlePromise.then(
      (bundle) => {
        if (this.disposed) return;
        this.bundle = bundle;
        this.refreshPlayer();
      },
      (error: unknown) => {
        if (this.disposed) return;
        this.bundleError = error instanceof MotionBundleValidationError
          ? error.diagnostics
          : [{
              code: "invalid-motions",
              message: String(error),
              severity: "error",
            }];
        console.error("加载生产动作资产失败:", this.bundleError);
        this.emitCapabilities();
      },
    );
  }

  setMotionTarget(target: SvgRuntimeRig | null) {
    if (this.target === target) return;
    this.player?.dispose();
    this.player = null;
    this.target = target;
    this.refreshPlayer();
  }

  private refreshPlayer() {
    if (this.disposed || !this.target || !this.bundle) {
      this.emitCapabilities();
      return;
    }
    this.player?.dispose();
    this.player = new SvgMotionPlayer(this.target, {
      onSuppressionChange: (channels) => this.binding.onSuppressionChange?.(channels),
      onBlink: () => this.showMotionExpression("blink", 180),
      onMouthOpen: () => this.showMotionExpression("speak"),
      onMouthClose: () => this.showMotionExpression(null),
      onDiagnostic: (diagnostic) => console.warn("动作事件诊断:", diagnostic),
    });
    this.emitCapabilities();
  }

  private emitCapabilities() {
    this.binding.onCapabilitiesChange?.(this.getCapabilities());
  }

  private showMotionExpression(expression: PetExpression | null, durationMs?: number) {
    if (this.motionExpressionTimer !== undefined) {
      clearTimeout(this.motionExpressionTimer);
      this.motionExpressionTimer = undefined;
    }
    this.binding.onMotionExpressionChange?.(expression);
    if (durationMs !== undefined) {
      this.motionExpressionTimer = setTimeout(() => {
        this.binding.onMotionExpressionChange?.(null);
        this.motionExpressionTimer = undefined;
      }, durationMs);
    }
  }

  getCapabilities(): RendererCapabilities {
    return {
      motions: this.player && this.bundle ? [...this.bundle.clips.keys()] : [],
      expressions: [...SUPPORTED_EXPRESSIONS],
      lookDirection: true,
      outfits: [],
    };
  }

  async playMotion(name: string, options?: MotionOptions): Promise<void> {
    if (this.disposed) {
      throw new RendererError("renderer_unavailable", "渲染器已释放");
    }
    if (this.bundleError) {
      throw new RendererError("invalid_asset", this.bundleError.map((item) => item.message).join("；"));
    }
    if (!this.bundle || !this.player) {
      throw new RendererError("renderer_unavailable", "动作资产或 SVG rig 尚未就绪");
    }
    const clip = this.bundle.clips.get(name);
    if (!clip) throw new RendererError("unsupported_action", `未知动作: ${name}`);

    try {
      await this.player.play({
        clip,
        speed: options?.speed,
        signal: options?.signal,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    } catch (error) {
      if (error instanceof MotionPlaybackInterruptedError) throw error;
      throw error;
    }
  }

  setLookDirection(x: number, y: number): void {
    if (this.disposed) return;
    const pet = this.binding.element.current;
    if (!pet) return;
    const config = PET_ANIMATION_CONFIG.pointerFollow;
    const set = (name: string, value: string) => pet.style.setProperty(name, value);
    set("--eye-x", px(x * config.eye.maxOffsetX));
    set("--eye-y", px(y * config.eye.maxOffsetY));
    set("--brow-x", px(x * config.eyebrow.maxOffsetX));
    set("--brow-y", px(y * config.eyebrow.maxOffsetY));
    set("--mouth-x", px(x * config.mouth.maxOffsetX));
    set("--mouth-y", px(y * config.mouth.maxOffsetY));
    set("--rouge-x", px(x * config.rouge.maxOffsetX));
    set("--rouge-y", px(y * config.rouge.maxOffsetY));
    set("--head-x", px(x * config.head.maxOffsetX));
    set("--head-y", px(y * (y < 0 ? config.head.maxOffsetUp : config.head.maxOffsetDown)));
    set("--head-rotate", deg(x * config.head.maxRotateDeg));
    set("--body-x", px(x * config.body.maxOffsetX));
    set("--body-y", px(y * config.body.maxOffsetY));
    set("--body-rotate", deg(x * config.body.maxRotateDeg));
    set("--arm-look-x", px(x * config.arm.maxOffsetX));
    set("--arm-look-y", px(y * config.arm.maxOffsetY));
    set("--arm-look-rotate", deg(x * config.arm.maxRotateDeg));
    set("--tail-look-rotate", deg(x * config.hairTail.maxRotateDeg));
  }

  async setExpression(name: string, options?: ExpressionOptions): Promise<void> {
    if (this.disposed) throw new RendererError("renderer_unavailable", "渲染器已释放");
    if (!SUPPORTED_EXPRESSIONS.includes(name as typeof SUPPORTED_EXPRESSIONS[number])) {
      throw new RendererError("unsupported_action", `未知表情: ${name}`);
    }
    this.binding.onExpressionChange(name as PetExpression);
    if (this.currentExpressionTimer !== undefined) clearTimeout(this.currentExpressionTimer);
    if (options?.durationMs !== undefined) {
      this.currentExpressionTimer = setTimeout(() => {
        this.binding.onExpressionChange("normal");
        this.currentExpressionTimer = undefined;
      }, options.durationMs);
    }
  }

  async equipOutfit(_outfitId: string): Promise<void> {
    throw new RendererError("unsupported_action", "服装系统尚未实现");
  }

  reset(_reason: ResetReason): void {
    this.player?.reset();
    if (this.currentExpressionTimer !== undefined) clearTimeout(this.currentExpressionTimer);
    if (this.motionExpressionTimer !== undefined) clearTimeout(this.motionExpressionTimer);
    this.currentExpressionTimer = undefined;
    this.motionExpressionTimer = undefined;
    this.binding.onMotionExpressionChange?.(null);
    this.binding.onSuppressionChange?.(new Set());
    this.setLookDirection(0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.player?.dispose();
    this.player = null;
    if (this.currentExpressionTimer !== undefined) clearTimeout(this.currentExpressionTimer);
    if (this.motionExpressionTimer !== undefined) clearTimeout(this.motionExpressionTimer);
    this.disposed = true;
  }
}
