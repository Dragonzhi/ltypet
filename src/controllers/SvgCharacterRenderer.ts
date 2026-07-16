import type { CharacterRenderer, MotionOptions, ExpressionOptions, ResetReason } from "../domain/controllers/types";
import type { RendererCapabilities } from "../domain/capabilities/capabilities";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";

// PetAction and PetExpression types from TianyiArtwork
type PetAction = "none" | "wave";
type PetExpression = "normal" | "blink" | "speak" | "sleep";

export interface SvgRendererBinding {
  /** Ref to the pet shell div (the one with data-action and className) */
  element: React.RefObject<HTMLDivElement | null>;
  /** Callback to change the action state in React (setAction) */
  onActionChange: (action: PetAction) => void;
  /** Callback to change the expression in React */
  onExpressionChange: (expression: PetExpression) => void;
}

const px = (value: number) => `${value.toFixed(2)}px`;
const deg = (value: number) => `${value.toFixed(2)}deg`;

const SUPPORTED_MOTIONS = ["wave"] as const;
const SUPPORTED_EXPRESSIONS = ["normal", "blink", "speak", "sleep"] as const;

export class SvgCharacterRenderer implements CharacterRenderer {
  private binding: SvgRendererBinding;
  private disposed = false;
  private currentExpressionTimer: ReturnType<typeof setTimeout> | undefined;
  private currentMotionCleanup: (() => void) | undefined;

  constructor(binding: SvgRendererBinding) {
    this.binding = binding;
  }

  getCapabilities(): RendererCapabilities {
    return {
      motions: [...SUPPORTED_MOTIONS],
      expressions: [...SUPPORTED_EXPRESSIONS],
      lookDirection: true,
      outfits: [],
    };
  }

  async playMotion(name: string, _options?: MotionOptions): Promise<void> {
    if (this.disposed) throw new Error("渲染器已释放");

    if (!SUPPORTED_MOTIONS.includes(name as typeof SUPPORTED_MOTIONS[number])) {
      throw new Error(`未知动作: ${name}`);
    }

    // Callback to trigger the CSS animation in React
    this.binding.onActionChange(name as PetAction);

    // Return a promise that resolves when the CSS animation ends
    return new Promise<void>((resolve) => {
      const element = this.binding.element.current;
      let settled = false;

      let safetyTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        settled = true;
        if (element) {
          element.removeEventListener("animationend", onAnimationEnd);
        }
        if (safetyTimer !== undefined) {
          clearTimeout(safetyTimer);
          safetyTimer = undefined;
        }
      };

      const onAnimationEnd = (event: AnimationEvent) => {
        if (event.animationName === `pet-${name}`) {
          cleanup();
          this.binding.onActionChange("none");
          resolve();
        }
      };

      // Safety timeout: resolve even if animationend never fires
      const onTimeout = () => {
        if (!settled) {
          cleanup();
          this.binding.onActionChange("none");
          resolve();
        }
      };
      safetyTimer = setTimeout(onTimeout, 10000);

      if (element) {
        element.addEventListener("animationend", onAnimationEnd);
      } else {
        // Element not available; resolve immediately
        cleanup();
        this.binding.onActionChange("none");
        resolve();
        return;
      }

      // Store cleanup so it can be called on dispose/reset
      this.currentMotionCleanup = cleanup;
    });
  }

  setLookDirection(x: number, y: number): void {
    if (this.disposed) return;

    const pet = this.binding.element.current;
    if (!pet) return;

    const config = PET_ANIMATION_CONFIG.pointerFollow;
    const set = (name: string, value: string) =>
      pet.style.setProperty(name, value);

    set("--eye-x", px(x * config.eye.maxOffsetX));
    set("--eye-y", px(y * config.eye.maxOffsetY));
    set("--brow-x", px(x * config.eyebrow.maxOffsetX));
    set("--brow-y", px(y * config.eyebrow.maxOffsetY));
    set("--mouth-x", px(x * config.mouth.maxOffsetX));
    set("--mouth-y", px(y * config.mouth.maxOffsetY));
    set("--rouge-x", px(x * config.rouge.maxOffsetX));
    set("--rouge-y", px(y * config.rouge.maxOffsetY));
    set("--head-x", px(x * config.head.maxOffsetX));
    set(
      "--head-y",
      px(
        y * (y < 0 ? config.head.maxOffsetUp : config.head.maxOffsetDown),
      ),
    );
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
    if (this.disposed) throw new Error("渲染器已释放");

    if (!SUPPORTED_EXPRESSIONS.includes(name as typeof SUPPORTED_EXPRESSIONS[number])) {
      throw new Error(`未知表情: ${name}`);
    }

    this.binding.onExpressionChange(name as PetExpression);

    // Clear previous revert timer
    if (this.currentExpressionTimer !== undefined) {
      clearTimeout(this.currentExpressionTimer);
      this.currentExpressionTimer = undefined;
    }

    // If duration is specified, set a timer to revert to normal
    if (options?.durationMs !== undefined) {
      this.currentExpressionTimer = setTimeout(() => {
        this.binding.onExpressionChange("normal");
        this.currentExpressionTimer = undefined;
      }, options.durationMs);
    }

    // Resolve immediately (expression change is synchronous in DOM)
  }

  async equipOutfit(_outfitId: string): Promise<void> {
    throw new Error("服装系统尚未实现");
  }

  reset(_reason: ResetReason): void {
    // Clear current motion timer if any
    if (this.currentMotionCleanup) {
      this.currentMotionCleanup();
      this.currentMotionCleanup = undefined;
    }

    // Clear expression timer
    if (this.currentExpressionTimer !== undefined) {
      clearTimeout(this.currentExpressionTimer);
      this.currentExpressionTimer = undefined;
    }

    this.binding.onActionChange("none");
    this.binding.onExpressionChange("normal");
    this.setLookDirection(0, 0);
  }

  dispose(): void {
    if (this.currentMotionCleanup) {
      this.currentMotionCleanup();
      this.currentMotionCleanup = undefined;
    }
    if (this.currentExpressionTimer !== undefined) {
      clearTimeout(this.currentExpressionTimer);
      this.currentExpressionTimer = undefined;
    }
    this.disposed = true;
    // Do NOT call binding callbacks — React unmount handles DOM cleanup
  }
}
