import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { WindowController, WindowMoveOptions } from "../domain/controllers/types";
import type { WindowTarget } from "../domain/actions/types";
import { WINDOW_MOVE_CONFIG } from "../config/windowMove";
import {
  resolveTarget,
  clampToWorkArea,
  computeDuration,
  interpolatePosition,
  distance,
  type Rect,
  type Point,
  type Size,
} from "../motion/windowMoveMath";

interface WorkAreaResponse {
  x: number;
  y: number;
  width: number;
  height: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export class TauriWindowController implements WindowController {
  private disposed = false;
  private currentAnimation: { abort: AbortController } | null = null;

  constructor() {
    // No initialization needed
  }

  async moveTo(
    target: WindowTarget,
    options?: WindowMoveOptions,
  ): Promise<void> {
    if (this.disposed) throw new Error("窗口控制器已释放");

    // Latest-wins: cancel any ongoing animation
    this.cancelCurrentAnimation();

    const win = getCurrentWindow();
    const winSize = await win.outerSize();
    const winSizeObj: Size = { width: winSize.width, height: winSize.height };

    // Get work area (with fallback to currentMonitor)
    const workArea = await this.getWorkArea();
    if (!workArea) {
      // No monitor detected; center as fallback
      await win.center();
      return;
    }

    // Resolve target to physical position
    const rawEnd = resolveTarget(target, workArea, winSizeObj);

    // Clamp to work area with margin
    const end = clampToWorkArea(
      rawEnd,
      workArea,
      winSizeObj,
      WINDOW_MOVE_CONFIG.boundaryMarginPx,
    );

    // Reduced motion: instant jump
    if (prefersReducedMotion()) {
      await win.setPosition(
        new PhysicalPosition(Math.round(end.x), Math.round(end.y)),
      );
      return;
    }

    // Get current position
    const outerPos = await win.outerPosition();
    const start: Point = { x: outerPos.x, y: outerPos.y };

    // Compute duration with max speed cap
    const dist = distance(start, end);
    const requestedDuration = options?.durationMs ?? WINDOW_MOVE_CONFIG.defaultDurationMs;
    const duration = Math.min(
      computeDuration(dist, WINDOW_MOVE_CONFIG.maxSpeedPxPerMs, requestedDuration),
      WINDOW_MOVE_CONFIG.maxDurationMs,
    );

    // No distance to travel
    if (duration <= 0 || dist < 1) {
      await win.setPosition(
        new PhysicalPosition(Math.round(end.x), Math.round(end.y)),
      );
      return;
    }

    // Animate with cancellation support
    await this.animateTo(win, start, end, duration, options?.signal);
  }

  async getPosition(): Promise<{ x: number; y: number }> {
    if (this.disposed) throw new Error("窗口控制器已释放");

    const pos = await getCurrentWindow().outerPosition();
    return { x: pos.x, y: pos.y };
  }

  async setAlwaysOnTop(value: boolean): Promise<void> {
    if (this.disposed) throw new Error("窗口控制器已释放");

    await getCurrentWindow().setAlwaysOnTop(value);
  }

  async center(): Promise<void> {
    if (this.disposed) throw new Error("窗口控制器已释放");

    this.cancelCurrentAnimation();
    await getCurrentWindow().center();
  }

  dispose(): void {
    this.cancelCurrentAnimation();
    this.disposed = true;
  }

  // --- Private methods ---

  private async getWorkArea(): Promise<Rect | null> {
    try {
      const area = await invoke<WorkAreaResponse>("get_work_area");
      return { x: area.x, y: area.y, width: area.width, height: area.height };
    } catch {
      // Fallback: use currentMonitor (doesn't account for taskbar)
      try {
        const monitor = await currentMonitor();
        if (!monitor) return null;
        return {
          x: monitor.position.x,
          y: monitor.position.y,
          width: monitor.size.width,
          height: monitor.size.height,
        };
      } catch {
        return null;
      }
    }
  }

  private cancelCurrentAnimation(): void {
    if (this.currentAnimation) {
      this.currentAnimation.abort.abort();
      this.currentAnimation = null;
    }
  }

  private animateTo(
    win: ReturnType<typeof getCurrentWindow>,
    start: Point,
    end: Point,
    duration: number,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = new AbortController();
      this.currentAnimation = { abort };

      // Link external signal
      if (externalSignal) {
        if (externalSignal.aborted) {
          this.currentAnimation = null;
          reject(new Error("aborted"));
          return;
        }
        externalSignal.addEventListener(
          "abort",
          () => abort.abort(),
          { once: true },
        );
      }

      let rafId = 0;
      const startTime = performance.now();

      const cleanup = () => {
        if (rafId !== 0) cancelAnimationFrame(rafId);
        rafId = 0;
        if (this.currentAnimation === this.currentAnimation) {
          this.currentAnimation = null;
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new Error("aborted"));
      };

      abort.signal.addEventListener("abort", onAbort, { once: true });

      const tick = () => {
        if (abort.signal.aborted) return;

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const pos = interpolatePosition(start, end, progress);

        win.setPosition(
          new PhysicalPosition(Math.round(pos.x), Math.round(pos.y)),
        ).catch(() => {
          // setPosition failed; abort animation
          abort.abort();
        });

        if (progress >= 1) {
          cleanup();
          resolve();
        } else {
          rafId = requestAnimationFrame(tick);
        }
      };

      rafId = requestAnimationFrame(tick);
    });
  }
}
