import { useCallback, useEffect, useRef, type RefObject } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";
import {
  normalizeDragVelocity,
  scaleHairRotation,
} from "../motion/hairMotionMath";
import { physicalCursorToCssPoint } from "../motion/petInteractionMath";
import {
  getPointerDirection,
  getPointerNeutralPoint,
} from "../motion/pointerFollowMath";

type PetElementRef = RefObject<HTMLDivElement | null>;

const px = (value: number) => `${value.toFixed(2)}px`;
const deg = (value: number) => `${value.toFixed(2)}deg`;

export const usePointerFollow = (
  petElement: PetElementRef,
  mode: "local" | "global" = "local",
  enabled = true,
) => {
  // 全局模式下需要跟踪窗口位置，用于屏幕坐标 → 视口坐标转换
  const winPosRef = useRef({ x: 0, y: 0 });
  const scaleFactorRef = useRef(1);
  const petElementRef = useRef(petElement);
  petElementRef.current = petElement;
  const config = PET_ANIMATION_CONFIG.pointerFollow;

  useEffect(() => {
    let animationFrame: number | undefined;
    let pointerX = 0;
    let pointerY = 0;
    let hasPointerSample = false;
    let globalCoordinatesReady = mode !== "global";

    petElementRef.current.current?.style.setProperty(
      "--arm-left-rest-y",
      px(config.arm.leftRestOffsetY),
    );
    petElementRef.current.current?.style.setProperty(
      "--arm-right-rest-y",
      px(config.arm.rightRestOffsetY),
    );
    petElementRef.current.current?.style.setProperty(
      "--look-transition-ms",
      `${config.transitionMs}ms`,
    );

    if (!enabled) {
      const pet = petElementRef.current.current;
      for (const name of [
        "--eye-x", "--eye-y", "--brow-x", "--brow-y", "--mouth-x",
        "--mouth-y", "--rouge-x", "--rouge-y", "--head-x", "--head-y",
        "--body-x", "--body-y", "--arm-look-x", "--arm-look-y",
      ]) pet?.style.setProperty(name, "0px");
      for (const name of ["--head-rotate", "--body-rotate", "--arm-look-rotate", "--tail-look-rotate"]) {
        pet?.style.setProperty(name, "0deg");
      }
      return;
    }

    const updatePosition = () => {
      animationFrame = undefined;
      const pet = petElementRef.current.current;
      if (!pet) return;

      let localX = pointerX;
      let localY = pointerY;

      // 全局模式下，屏幕坐标 → 视口坐标
      if (mode === "global") {
        const localPoint = physicalCursorToCssPoint(
          { x: pointerX, y: pointerY },
          winPosRef.current,
          scaleFactorRef.current,
        );
        localX = localPoint.x;
        localY = localPoint.y;
      }

      const bounds = pet.getBoundingClientRect();
      const neutralPoint = getPointerNeutralPoint(
        bounds,
        config.neutralPoint,
      );
      const direction = getPointerDirection(
        { x: localX, y: localY },
        neutralPoint,
        config.fullRangeX,
        config.fullRangeY,
      );
      const directionX = direction.x;
      const directionY = direction.y;

      const set = (name: string, value: string) =>
        pet.style.setProperty(name, value);

      set("--eye-x", px(directionX * config.eye.maxOffsetX));
      set("--eye-y", px(directionY * config.eye.maxOffsetY));
      set("--brow-x", px(directionX * config.eyebrow.maxOffsetX));
      set("--brow-y", px(directionY * config.eyebrow.maxOffsetY));
      set("--mouth-x", px(directionX * config.mouth.maxOffsetX));
      set("--mouth-y", px(directionY * config.mouth.maxOffsetY));
      set("--rouge-x", px(directionX * config.rouge.maxOffsetX));
      set("--rouge-y", px(directionY * config.rouge.maxOffsetY));
      set("--head-x", px(directionX * config.head.maxOffsetX));
      set(
        "--head-y",
        px(
          directionY *
            (directionY < 0
              ? config.head.maxOffsetUp
              : config.head.maxOffsetDown),
        ),
      );
      set("--head-rotate", deg(directionX * config.head.maxRotateDeg));
      set("--body-x", px(directionX * config.body.maxOffsetX));
      set("--body-y", px(directionY * config.body.maxOffsetY));
      set("--body-rotate", deg(directionX * config.body.maxRotateDeg));
      set("--arm-look-x", px(directionX * config.arm.maxOffsetX));
      set("--arm-look-y", px(directionY * config.arm.maxOffsetY));
      set("--arm-look-rotate", deg(directionX * config.arm.maxRotateDeg));
      set(
        "--tail-look-rotate",
        deg(directionX * config.hairTail.maxRotateDeg),
      );
    };

    const scheduleUpdate = () => {
      if (animationFrame === undefined) {
        animationFrame = window.requestAnimationFrame(updatePosition);
      }
    };

    if (mode === "global") {
      // 全局模式：监听 Tauri 事件（屏幕绝对坐标）
      const win = getCurrentWindow();
      let disposed = false;
      const unlisteners: Array<() => void> = [];
      const registerUnlistener = (unlisten: () => void) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      };

      // 窗口位置和全局光标均为物理像素，必须同时读取 DPI 后再换算。
      void Promise.all([
        win.outerPosition(),
        win.scaleFactor(),
        cursorPosition(),
      ]).then(
        ([pos, scaleFactor, cursor]) => {
          if (disposed) return;
          winPosRef.current = { x: pos.x, y: pos.y };
          scaleFactorRef.current = scaleFactor;
          if (!hasPointerSample) {
            pointerX = cursor.x;
            pointerY = cursor.y;
            hasPointerSample = true;
          }
          globalCoordinatesReady = true;
          scheduleUpdate();
        },
        (error) => {
          console.error("初始化鼠标跟随坐标失败:", error);
        },
      );
      void win.onMoved((event) => {
        winPosRef.current = { x: event.payload.x, y: event.payload.y };
        if (globalCoordinatesReady && hasPointerSample) scheduleUpdate();
      }).then(registerUnlistener);
      void win.onScaleChanged((event) => {
        scaleFactorRef.current = event.payload.scaleFactor;
        if (globalCoordinatesReady && hasPointerSample) scheduleUpdate();
      }).then(registerUnlistener);

      void listen<{ x: number; y: number }>(
        "global-cursor-move",
        (event) => {
          pointerX = event.payload.x;
          pointerY = event.payload.y;
          hasPointerSample = true;
          if (globalCoordinatesReady) scheduleUpdate();
        },
      ).then(registerUnlistener);

      return () => {
        disposed = true;
        unlisteners.forEach((unlisten) => unlisten());
        if (animationFrame !== undefined) {
          window.cancelAnimationFrame(animationFrame);
        }
      };
    }

    // 本地模式：监听 pointermove（原始行为）
    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      hasPointerSample = true;
      scheduleUpdate();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [petElement, mode, config, enabled]);
};

export const useEarTwitch = (petElement: PetElementRef, enabled = true) => {
  const config = PET_ANIMATION_CONFIG.earTwitch;

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const leftEar =
      petElement.current?.querySelector<SVGGElement>("#ear-left-motion");
    const rightEar =
      petElement.current?.querySelector<SVGGElement>("#ear-right-motion");
    if (!leftEar || !rightEar) return;

    let timer: number | undefined;
    let animations: Animation[] = [];

    const animateEar = (ear: SVGGElement, direction: -1 | 1) =>
      ear.animate(
        [
          { translate: "0 0", rotate: "0deg", offset: 0 },
          {
            translate: `0 ${-config.maxLiftPx}px`,
            rotate: `${direction * config.maxRotateDeg}deg`,
            offset: 0.3,
          },
          {
            translate: `0 ${-config.maxLiftPx * 0.25}px`,
            rotate: `${direction * config.maxRotateDeg * -0.35}deg`,
            offset: 0.62,
          },
          { translate: "0 0", rotate: "0deg", offset: 1 },
        ],
        { duration: config.durationMs, easing: "ease-in-out" },
      );

    const schedule = () => {
      const delay =
        config.minDelayMs +
        Math.random() * (config.maxDelayMs - config.minDelayMs);
      timer = window.setTimeout(() => {
        animations.forEach((animation) => animation.cancel());
        animations = [animateEar(leftEar, -1), animateEar(rightEar, 1)];
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [petElement, config, enabled]);
};

interface SpringAxis {
  position: number;
  velocity: number;
  target: number;
}

interface DragSample {
  x: number;
  y: number;
  time: number;
}

export const useHairMotion = (petElement: PetElementRef, enabled = true) => {
  const config = PET_ANIMATION_CONFIG.hairMotion;
  const frame = useRef<number | undefined>(undefined);
  const previousFrameTime = useRef<number | undefined>(undefined);
  const latestCursor = useRef<DragSample | null>(null);
  const lastDragSample = useRef<DragSample | null>(null);
  const lastWindowSample = useRef<DragSample | null>(null);
  const isDragging = useRef(false);
  const rotationAxis = useRef<SpringAxis>({
    position: 0,
    velocity: 0,
    target: 0,
  });

  const writeMotion = useCallback(() => {
    const pet = petElement.current;
    if (!pet) return;
    const rotation = rotationAxis.current.position;
    const ratio = config.inertiaRatio;
    pet.style.setProperty(
      "--tail-left-inertia-rotate",
      deg(scaleHairRotation(rotation, ratio.tailLeft)),
    );
    pet.style.setProperty(
      "--tail-right-inertia-rotate",
      deg(scaleHairRotation(rotation, ratio.tailRight)),
    );
    pet.style.setProperty(
      "--fringe-inertia-rotate",
      deg(scaleHairRotation(rotation, ratio.fringe)),
    );
    pet.style.setProperty(
      "--temple-left-inertia-rotate",
      deg(scaleHairRotation(rotation, ratio.temple)),
    );
    pet.style.setProperty(
      "--temple-right-inertia-rotate",
      deg(scaleHairRotation(rotation, ratio.temple)),
    );
    for (const side of ["left", "right"] as const) {
      pet.style.setProperty(
        `--blue-accessory-${side}-inertia-rotate`,
        deg(scaleHairRotation(rotation, ratio.blueAccessory)),
      );
      pet.style.setProperty(
        `--white-accessory-${side}-inertia-rotate`,
        deg(scaleHairRotation(rotation, ratio.whiteAccessory)),
      );
    }
  }, [config, petElement]);

  const step = useCallback(
    (time: number) => {
      const previous = previousFrameTime.current ?? time;
      const deltaSeconds = Math.min((time - previous) / 1000, 0.033);
      previousFrameTime.current = time;
      const decay = Math.exp(-config.targetDecayPerSecond * deltaSeconds);
      const velocityDamping = Math.exp(-config.damping * deltaSeconds);
      let isMoving = false;

      for (const axis of [rotationAxis.current]) {
        axis.target *= decay;
        axis.velocity +=
          (axis.target - axis.position) * config.stiffness * deltaSeconds;
        axis.velocity *= velocityDamping;
        axis.position += axis.velocity * deltaSeconds;
        if (
          Math.abs(axis.position) > 0.005 ||
          Math.abs(axis.velocity) > 0.005 ||
          Math.abs(axis.target) > 0.005
        ) {
          isMoving = true;
        } else {
          axis.position = 0;
          axis.velocity = 0;
          axis.target = 0;
        }
      }

      writeMotion();
      if (isMoving) {
        frame.current = window.requestAnimationFrame(step);
      } else {
        frame.current = undefined;
        previousFrameTime.current = undefined;
      }
    },
    [config, writeMotion],
  );

  const ensureAnimation = useCallback(() => {
    if (frame.current === undefined) {
      previousFrameTime.current = undefined;
      frame.current = window.requestAnimationFrame(step);
    }
  }, [step]);

  const exciteRotation = useCallback(
    (deltaX: number, deltaMs: number) => {
      if (!enabled) return;
      const normalizedX = normalizeDragVelocity(
        deltaX,
        deltaMs,
        config.velocityForMaxPxPerMs,
      );
      rotationAxis.current.target =
        -normalizedX * config.maxInertiaRotateDeg;
      ensureAnimation();
    },
    [config, enabled, ensureAnimation],
  );

  const sampleDrag = useCallback(
    (x: number, y: number, time: number) => {
      const currentSample = { x, y, time };
      latestCursor.current = currentSample;
      if (!isDragging.current) return;

      const previous = lastDragSample.current;
      lastDragSample.current = currentSample;
      if (!previous) return;

      exciteRotation(x - previous.x, time - previous.time);
    },
    [exciteRotation],
  );

  const sampleWindowMove = useCallback(
    (x: number, y: number, time: number) => {
      const currentSample = { x, y, time };
      const previous = lastWindowSample.current;
      lastWindowSample.current = currentSample;

      if (!previous) return;
      exciteRotation(x - previous.x, time - previous.time);
    },
    [exciteRotation],
  );

  const beginDrag = useCallback((screenX: number, screenY: number) => {
    if (!enabled) return;
    const now = performance.now();
    const recentCursor = latestCursor.current;
    const initialSample =
      recentCursor && now - recentCursor.time < 100
        ? recentCursor
        : { x: screenX, y: screenY, time: now };
    isDragging.current = true;
    lastDragSample.current = initialSample;
  }, [enabled]);

  const endDrag = useCallback(() => {
    isDragging.current = false;
    lastDragSample.current = null;
    // 保留最后一次拖动冲量，让 targetDecayPerSecond 驱动自然回摆。
    ensureAnimation();
  }, [ensureAnimation]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ x: number; y: number }>("global-cursor-move", (event) => {
      sampleDrag(event.payload.x, event.payload.y, performance.now());
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enabled, sampleDrag]);

  useEffect(() => {
    if (!enabled) return;
    const windowHandle = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void windowHandle.outerPosition().then((position) => {
      if (!disposed && !lastWindowSample.current) {
        lastWindowSample.current = {
          x: position.x,
          y: position.y,
          time: performance.now(),
        };
      }
    });
    void windowHandle.onMoved((event) => {
      sampleWindowMove(
        event.payload.x,
        event.payload.y,
        performance.now(),
      );
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enabled, sampleWindowMove]);

  useEffect(() => {
    const pet = petElement.current;
    if (!pet) return;
    if (!enabled) {
      rotationAxis.current = { position: 0, velocity: 0, target: 0 };
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
      frame.current = undefined;
      previousFrameTime.current = undefined;
      writeMotion();
      return;
    }
    const idle = config.idle;
    const setIdle = (
      id: string,
      amplitude: number,
      durationMs: number,
      delayMs: number,
      mirrored: boolean,
    ) => {
      const layer = pet.querySelector<SVGGElement>(`#${id}`);
      if (!layer) return;
      const from = mirrored ? amplitude : -amplitude;
      layer.style.setProperty("--hair-idle-from", deg(from));
      layer.style.setProperty("--hair-idle-to", deg(-from));
      layer.style.setProperty("--hair-idle-duration", `${durationMs}ms`);
      layer.style.setProperty("--hair-idle-delay", `${delayMs}ms`);
    };

    setIdle(
      "hair-tail-left",
      idle.tail.maxRotateDeg,
      idle.tail.durationMs,
      idle.tail.leftDelayMs,
      false,
    );
    setIdle(
      "hair-tail-right",
      idle.tail.maxRotateDeg,
      idle.tail.durationMs,
      idle.tail.rightDelayMs,
      true,
    );
    setIdle(
      "fringe",
      idle.fringe.maxRotateDeg,
      idle.fringe.durationMs,
      idle.fringe.delayMs,
      false,
    );
    setIdle(
      "temple-left",
      idle.temple.maxRotateDeg,
      idle.temple.durationMs,
      idle.temple.leftDelayMs,
      false,
    );
    setIdle(
      "temple-right",
      idle.temple.maxRotateDeg,
      idle.temple.durationMs,
      idle.temple.rightDelayMs,
      true,
    );
    setIdle(
      "blue-hair-accessory-left",
      idle.blueAccessory.maxRotateDeg,
      idle.blueAccessory.durationMs,
      idle.blueAccessory.leftDelayMs,
      false,
    );
    setIdle(
      "blue-hair-accessory-right",
      idle.blueAccessory.maxRotateDeg,
      idle.blueAccessory.durationMs,
      idle.blueAccessory.rightDelayMs,
      true,
    );
    setIdle(
      "white-hair-accessory-left",
      idle.whiteAccessory.maxRotateDeg,
      idle.whiteAccessory.durationMs,
      idle.whiteAccessory.leftDelayMs,
      true,
    );
    setIdle(
      "white-hair-accessory-right",
      idle.whiteAccessory.maxRotateDeg,
      idle.whiteAccessory.durationMs,
      idle.whiteAccessory.rightDelayMs,
      false,
    );

    if (frame.current !== undefined) {
      window.cancelAnimationFrame(frame.current);
      frame.current = undefined;
      previousFrameTime.current = undefined;
    }
    writeMotion();
  }, [config, enabled, petElement, writeMotion]);

  useEffect(
    () => () => {
      if (frame.current !== undefined) {
        window.cancelAnimationFrame(frame.current);
      }
    },
    [],
  );

  return { beginDrag, endDrag };
};
