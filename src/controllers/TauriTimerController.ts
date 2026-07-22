import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TimerController,
  TimerSnapshot,
  TimerStartOptions,
  TimerStateEvent,
} from "../domain/controllers/types";

const STATE_CHANGED_EVENT = "timer-state-changed";
const FINISHED_AVAILABLE_EVENT = "timer-finished-available";

export class TimerControllerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TimerControllerError";
    this.code = code;
  }
}

function toControllerError(error: unknown): TimerControllerError {
  if (error !== null && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return new TimerControllerError(candidate.code, candidate.message);
    }
  }
  return new TimerControllerError("timer_native_error", String(error));
}

export class TauriTimerController implements TimerController {
  private disposed = false;
  private readonly activeListeners = new Set<UnlistenFn>();
  private drainPromise: Promise<TimerSnapshot | null> | null = null;

  async getState(): Promise<TimerSnapshot | null> {
    return this.call<TimerSnapshot | null>("timer_get_state");
  }

  async start(options: TimerStartOptions): Promise<TimerSnapshot> {
    return this.call<TimerSnapshot>("timer_start", { request: options });
  }

  async pause(timerId: string): Promise<TimerSnapshot> {
    return this.call<TimerSnapshot>("timer_pause", { timerId });
  }

  async resume(timerId: string): Promise<TimerSnapshot> {
    return this.call<TimerSnapshot>("timer_resume", { timerId });
  }

  async cancel(timerId: string): Promise<TimerSnapshot> {
    return this.call<TimerSnapshot>("timer_cancel", { timerId });
  }

  async onStateChange(listener: (event: TimerStateEvent) => void): Promise<() => void> {
    return this.registerListener(
      await listen<TimerStateEvent>(STATE_CHANGED_EVENT, (event) => listener(event.payload)),
    );
  }

  async onFinished(listener: (timer: TimerSnapshot) => void): Promise<() => void> {
    const unlisten = await listen(FINISHED_AVAILABLE_EVENT, () => {
      void this.drainFinished().then((timer) => {
        if (timer) listener(timer);
      });
    });
    const cleanup = this.registerListener(unlisten);
    const pending = await this.drainFinished();
    if (pending) listener(pending);
    return cleanup;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unlisten of this.activeListeners) unlisten();
    this.activeListeners.clear();
  }

  private async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (this.disposed) {
      throw new TimerControllerError("timer_disposed", "番茄钟控制器已释放");
    }
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      throw toControllerError(error);
    }
  }

  private registerListener(unlisten: UnlistenFn): () => void {
    if (this.disposed) {
      unlisten();
      return () => undefined;
    }
    this.activeListeners.add(unlisten);
    return () => {
      if (!this.activeListeners.delete(unlisten)) return;
      unlisten();
    };
  }

  private drainFinished(): Promise<TimerSnapshot | null> {
    if (!this.drainPromise) {
      this.drainPromise = this.call<TimerSnapshot | null>("timer_take_pending_finished")
        .finally(() => {
          this.drainPromise = null;
        });
    }
    return this.drainPromise;
  }
}
