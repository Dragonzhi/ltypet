import { useCallback, useEffect, useRef, type RefObject } from "react";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";

type PetElementRef = RefObject<HTMLDivElement | null>;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const px = (value: number) => `${value.toFixed(2)}px`;
const deg = (value: number) => `${value.toFixed(2)}deg`;

export const usePointerFollow = (petElement: PetElementRef) => {
  useEffect(() => {
    const config = PET_ANIMATION_CONFIG.pointerFollow;
    let animationFrame: number | undefined;
    let pointerX = 0;
    let pointerY = 0;

    const updatePosition = () => {
      animationFrame = undefined;
      const pet = petElement.current;
      if (!pet) return;

      const bounds = pet.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height * 0.34;
      const directionX = clamp(
        (pointerX - centerX) / config.fullRangeX,
        -1,
        1,
      );
      const directionY = clamp(
        (pointerY - centerY) / config.fullRangeY,
        -1,
        1,
      );

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
      set("--head-y", px(directionY * config.head.maxOffsetY));
      set("--head-rotate", deg(directionX * config.head.maxRotateDeg));
      set("--body-x", px(directionX * config.body.maxOffsetX));
      set("--body-y", px(directionY * config.body.maxOffsetY));
      set("--body-rotate", deg(directionX * config.body.maxRotateDeg));
      set("--arm-look-x", px(directionX * config.arm.maxOffsetX));
      set("--arm-look-y", px(directionY * config.arm.maxOffsetY));
      set("--arm-look-rotate", deg(directionX * config.arm.maxRotateDeg));
      set("--tail-look-x", px(directionX * config.hairTail.maxOffsetX));
      set("--tail-look-y", px(directionY * config.hairTail.maxOffsetY));
      set(
        "--tail-look-rotate",
        deg(directionX * config.hairTail.maxRotateDeg),
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (animationFrame === undefined) {
        animationFrame = window.requestAnimationFrame(updatePosition);
      }
    };

    petElement.current?.style.setProperty(
      "--look-transition-ms",
      `${config.transitionMs}ms`,
    );
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [petElement]);
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

export const useTailInertia = (petElement: PetElementRef) => {
  const frame = useRef<number | undefined>(undefined);
  const previousFrameTime = useRef<number | undefined>(undefined);
  const lastDragSample = useRef<DragSample | null>(null);
  const xAxis = useRef<SpringAxis>({ position: 0, velocity: 0, target: 0 });
  const yAxis = useRef<SpringAxis>({ position: 0, velocity: 0, target: 0 });
  const rotationAxis = useRef<SpringAxis>({
    position: 0,
    velocity: 0,
    target: 0,
  });

  const writeMotion = useCallback(() => {
    const pet = petElement.current;
    if (!pet) return;
    const config = PET_ANIMATION_CONFIG.tailInertia;
    pet.style.setProperty("--tail-inertia-x", px(xAxis.current.position));
    pet.style.setProperty("--tail-inertia-y", px(yAxis.current.position));
    pet.style.setProperty(
      "--tail-left-inertia-rotate",
      deg(rotationAxis.current.position),
    );
    pet.style.setProperty(
      "--tail-right-inertia-rotate",
      deg(rotationAxis.current.position * config.rightTailRotationRatio),
    );
  }, [petElement]);

  const step = useCallback(
    (time: number) => {
      const config = PET_ANIMATION_CONFIG.tailInertia;
      const previous = previousFrameTime.current ?? time;
      const deltaSeconds = Math.min((time - previous) / 1000, 0.033);
      previousFrameTime.current = time;
      const decay = Math.exp(-config.targetDecayPerSecond * deltaSeconds);
      const velocityDamping = Math.exp(-config.damping * deltaSeconds);
      let isMoving = false;

      for (const axis of [xAxis.current, yAxis.current, rotationAxis.current]) {
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
    [writeMotion],
  );

  const ensureAnimation = useCallback(() => {
    if (frame.current === undefined) {
      previousFrameTime.current = undefined;
      frame.current = window.requestAnimationFrame(step);
    }
  }, [step]);

  const startDrag = useCallback((x: number, y: number, time: number) => {
    lastDragSample.current = { x, y, time };
  }, []);

  const sampleDrag = useCallback(
    (x: number, y: number, time: number) => {
      const previous = lastDragSample.current;
      lastDragSample.current = { x, y, time };
      if (!previous) return;

      const config = PET_ANIMATION_CONFIG.tailInertia;
      const deltaMs = clamp(time - previous.time, 8, 64);
      const velocityX = (x - previous.x) / deltaMs;
      const velocityY = (y - previous.y) / deltaMs;
      const normalizedX = clamp(
        velocityX / config.velocityForMaxPxPerMs,
        -1,
        1,
      );
      const normalizedY = clamp(
        velocityY / config.velocityForMaxPxPerMs,
        -1,
        1,
      );

      xAxis.current.target = -normalizedX * config.maxOffsetX;
      yAxis.current.target = -normalizedY * config.maxOffsetY;
      rotationAxis.current.target = -normalizedX * config.maxRotateDeg;
      ensureAnimation();
    },
    [ensureAnimation],
  );

  const release = useCallback(() => {
    lastDragSample.current = null;
    xAxis.current.target = 0;
    yAxis.current.target = 0;
    rotationAxis.current.target = 0;
    ensureAnimation();
  }, [ensureAnimation]);

  useEffect(
    () => () => {
      if (frame.current !== undefined) {
        window.cancelAnimationFrame(frame.current);
      }
    },
    [],
  );

  return { startDrag, sampleDrag, release };
};
