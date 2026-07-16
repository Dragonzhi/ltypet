import type { ActionRequest, ActionResult } from "../actions/types";
import type { ActionExecutor } from "../scheduler/types";
import type { CharacterRenderer, WindowController } from "./types";

export interface PetActionExecutorOptions {
  renderer: CharacterRenderer;
  windowController: WindowController;
  clock?: () => number;
}

export class PetActionExecutor implements ActionExecutor {
  private renderer: CharacterRenderer;
  private windowController: WindowController;
  private clock: () => number;
  private disposed = false;

  constructor(options: PetActionExecutorOptions) {
    this.renderer = options.renderer;
    this.windowController = options.windowController;
    this.clock = options.clock ?? (() => Date.now());
  }

  private async withAbort<T>(
    run: () => Promise<T>,
    signal: AbortSignal,
    onAbort?: () => void,
  ): Promise<T> {
    if (signal.aborted) throw new Error("aborted");
    return new Promise<T>((resolve, reject) => {
      const onAbortHandler = () => {
        onAbort?.();
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", onAbortHandler, { once: true });
      run().then(
        (result) => {
          signal.removeEventListener("abort", onAbortHandler);
          resolve(result);
        },
        (error) => {
          signal.removeEventListener("abort", onAbortHandler);
          reject(error);
        },
      );
    });
  }

  async execute(action: ActionRequest, signal: AbortSignal): Promise<ActionResult> {
    if (this.disposed) {
      throw new Error("PetActionExecutor is disposed");
    }

    try {
      switch (action.type) {
        case "motion.play": {
          await this.withAbort(
            () => this.renderer.playMotion(action.payload.motion, { speed: action.payload.speed }),
            signal,
            () => this.renderer.reset("interrupt"),
          );
          return { actionId: action.id, status: "completed", finishedAt: this.clock() };
        }
        case "expression.set": {
          await this.withAbort(
            () => this.renderer.setExpression(action.payload.expression, { durationMs: action.payload.durationMs }),
            signal,
            () => this.renderer.reset("interrupt"),
          );
          return { actionId: action.id, status: "completed", finishedAt: this.clock() };
        }
        case "look.set": {
          this.renderer.setLookDirection(action.payload.x, action.payload.y);
          return { actionId: action.id, status: "completed", finishedAt: this.clock() };
        }
        case "window.move": {
          await this.withAbort(
            () => this.windowController.moveTo(
              action.payload.target,
              { durationMs: action.payload.durationMs, signal },
            ),
            signal,
          );
          return { actionId: action.id, status: "completed", finishedAt: this.clock() };
        }
        case "outfit.equip": {
          await this.withAbort(
            () => this.renderer.equipOutfit(action.payload.outfitId),
            signal,
            () => this.renderer.reset("interrupt"),
          );
          return { actionId: action.id, status: "completed", finishedAt: this.clock() };
        }
        case "speech.say":
        case "timer.start":
        case "timer.pause":
        case "timer.cancel":
          return { actionId: action.id, status: "rejected", errorCode: "renderer_unavailable", reason: "该能力尚未实现", finishedAt: this.clock() };
        case "wait":
          return { actionId: action.id, status: "rejected", errorCode: "unsupported_action", reason: "wait 不应到达执行器", finishedAt: this.clock() };
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "aborted") {
        return { actionId: action.id, status: "interrupted", finishedAt: this.clock() };
      }
      return { actionId: action.id, status: "failed", finishedAt: this.clock(), reason: String(error) };
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.windowController.dispose();
    this.disposed = true;
  }
}
