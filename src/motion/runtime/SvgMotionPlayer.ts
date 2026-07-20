import type { MotionClipV1, ProceduralChannel } from "@ltypet/character-motion";
import { collectCrossedEvents, getPlaybackPosition } from "./playbackMath";
import { dispatchMotionEvents } from "./motionEvents";
import type {
  MotionPlaybackCallbacks,
  MotionPlaybackRequest,
  MotionPlayerTarget,
} from "./types";

export interface AnimationClock {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

interface PlaybackSession {
  id: number;
  clip: MotionClipV1;
  startedAt: number;
  speed: number;
  rafId: number | null;
  settled: boolean;
  lastAbsoluteFrame: number;
  signal?: AbortSignal;
  abortHandler?: () => void;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class MotionPlaybackInterruptedError extends Error {
  constructor(message = "动作播放已中断") {
    super(message);
    this.name = "MotionPlaybackInterruptedError";
  }
}

const browserClock: AnimationClock = {
  now: () => performance.now(),
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (id) => window.cancelAnimationFrame(id),
};

export class SvgMotionPlayer {
  private readonly target: MotionPlayerTarget;
  private readonly callbacks: MotionPlaybackCallbacks;
  private readonly clock: AnimationClock;
  private current: PlaybackSession | null = null;
  private nextSessionId = 1;
  private disposed = false;

  constructor(
    target: MotionPlayerTarget,
    callbacks: MotionPlaybackCallbacks = {},
    clock: AnimationClock = browserClock,
  ) {
    this.target = target;
    this.callbacks = callbacks;
    this.clock = clock;
  }

  play(request: MotionPlaybackRequest): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("动作播放器已释放"));
    const speed = request.speed ?? 1;
    if (!Number.isFinite(speed) || speed <= 0) {
      return Promise.reject(new Error("动作 speed 必须是有限正数"));
    }
    if (request.signal?.aborted) {
      return Promise.reject(new MotionPlaybackInterruptedError());
    }
    this.interrupt();

    return new Promise<void>((resolve, reject) => {
      const session: PlaybackSession = {
        id: this.nextSessionId++,
        clip: request.clip,
        startedAt: this.clock.now(),
        speed,
        rafId: null,
        settled: false,
        lastAbsoluteFrame: -Number.EPSILON,
        signal: request.signal,
        resolve,
        reject,
      };
      this.current = session;
      this.callbacks.onSuppressionChange?.(
        new Set(request.clip.suppressProceduralChannels ?? []),
      );

      const abortHandler = () => this.settle(session, "interrupted");
      session.abortHandler = abortHandler;
      request.signal?.addEventListener("abort", abortHandler, { once: true });

      if (request.reducedMotion) {
        if (request.clip.loop === "none") {
          this.target.applyFrame(request.clip, request.clip.durationFrames);
        }
        session.rafId = this.clock.request(() => this.settle(session, "completed"));
        return;
      }

      this.sample(session, 0);
      session.rafId = this.clock.request((timestamp) => this.tick(session, timestamp));
    });
  }

  private tick(session: PlaybackSession, timestamp: number) {
    if (session.settled || this.current?.id !== session.id) return;
    session.rafId = null;
    const position = getPlaybackPosition(
      timestamp - session.startedAt,
      session.clip,
      session.speed,
    );
    this.sample(session, position.absoluteFrame, position.sampleFrame);
    if (position.completed) {
      this.settle(session, "completed");
      return;
    }
    session.rafId = this.clock.request((nextTimestamp) => this.tick(session, nextTimestamp));
  }

  private sample(
    session: PlaybackSession,
    absoluteFrame: number,
    sampleFrame = 0,
  ) {
    const events = collectCrossedEvents(
      session.clip,
      session.lastAbsoluteFrame,
      absoluteFrame,
    );
    this.target.applyFrame(session.clip, sampleFrame);
    dispatchMotionEvents(events, this.callbacks);
    session.lastAbsoluteFrame = absoluteFrame;
  }

  interrupt() {
    if (this.current) this.settle(this.current, "interrupted");
  }

  reset() {
    if (this.current) this.settle(this.current, "interrupted");
    else {
      this.target.restore();
      this.callbacks.onSuppressionChange?.(new Set<ProceduralChannel>());
    }
  }

  private settle(session: PlaybackSession, reason: "completed" | "interrupted") {
    if (session.settled) return;
    session.settled = true;
    if (session.rafId !== null) this.clock.cancel(session.rafId);
    session.signal?.removeEventListener("abort", session.abortHandler!);
    this.target.restore();
    this.callbacks.onSuppressionChange?.(new Set<ProceduralChannel>());
    if (this.current?.id === session.id) this.current = null;
    if (reason === "completed") session.resolve();
    else session.reject(new MotionPlaybackInterruptedError());
  }

  dispose() {
    if (this.disposed) return;
    if (this.current) this.interrupt();
    else this.target.restore();
    this.disposed = true;
  }
}
