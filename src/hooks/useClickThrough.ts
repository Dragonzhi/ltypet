import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  cursorPosition,
  getCurrentWindow,
  type Window,
} from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { PET_INTERACTION_CONFIG } from "../config/petInteraction";
import {
  getHitTestOffsets,
  getHitTestPadding,
  physicalCursorToCssPoint,
  type Point,
} from "../motion/petInteractionMath";

interface UseClickThroughOptions {
  forceInteractive: boolean;
}

// 只把实际可绘制的 SVG 几何标签视为角色轮廓，容器层和动画 wrapper
// 不应扩大点击区域。
const SVG_GEOMETRY_TAG_NAMES = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

const isInteractiveSvgGeometry = (
  element: Element,
  pet: HTMLElement,
) => {
  if (
    !(element instanceof SVGElement) ||
    !SVG_GEOMETRY_TAG_NAMES.has(element.localName) ||
    !pet.contains(element)
  ) {
    return false;
  }
  if (
    element.id.startsWith("pivot-") ||
    element.closest<SVGElement>('[id^="pivot-"]')
  ) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.pointerEvents !== "none" &&
    Number.parseFloat(style.opacity || "1") > 0
  );
};

const pointHitsInteractiveContent = (
  pet: HTMLElement,
  point: Point,
  paddingCssPx: number,
) =>
  getHitTestOffsets(paddingCssPx).some((offset) => {
    const x = point.x + offset.x;
    const y = point.y + offset.y;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
      return false;
    }
    return document.elementsFromPoint(x, y).some((element) => {
      if (
        element.closest<HTMLElement>("[data-click-through-interactive]")
      ) {
        return true;
      }
      return isInteractiveSvgGeometry(element, pet);
    });
  });

export const useClickThrough = (
  petElement: RefObject<HTMLDivElement | null>,
  { forceInteractive }: UseClickThroughOptions,
) => {
  const config = PET_INTERACTION_CONFIG.clickThrough;
  const forceInteractiveRef = useRef(forceInteractive);
  forceInteractiveRef.current = forceInteractive;
  const windowHandle = useRef<Window | null>(null);
  const cursor = useRef<Point | null>(null);
  const windowPosition = useRef<Point | null>(null);
  const scaleFactor = useRef(1);
  const isReady = useRef(false);
  const appliedIgnore = useRef(false);
  const desiredIgnore = useRef(false);
  const isApplying = useRef(false);
  const evaluationFrame = useRef<number | undefined>(undefined);
  const evaluateRef = useRef<() => void>(() => undefined);

  const applyDesiredState = useCallback(() => {
    const appWindow = windowHandle.current;
    if (!appWindow || isApplying.current) return;
    isApplying.current = true;

    void (async () => {
      try {
        while (appliedIgnore.current !== desiredIgnore.current) {
          const nextIgnore = desiredIgnore.current;
          await appWindow.setIgnoreCursorEvents(nextIgnore);
          appliedIgnore.current = nextIgnore;
        }
      } catch (error) {
        console.error("切换点击穿透失败，已回退为可交互:", error);
        desiredIgnore.current = false;
        try {
          await appWindow.setIgnoreCursorEvents(false);
        } catch (restoreError) {
          console.error("恢复窗口交互失败:", restoreError);
        }
        appliedIgnore.current = false;
      } finally {
        isApplying.current = false;
        if (appliedIgnore.current !== desiredIgnore.current) {
          applyDesiredState();
        }
      }
    })();
  }, []);

  const requestIgnoreState = useCallback(
    (ignore: boolean) => {
      desiredIgnore.current = ignore;
      applyDesiredState();
    },
    [applyDesiredState],
  );

  const evaluate = useCallback(() => {
    const pet = petElement.current;
    const currentCursor = cursor.current;
    const currentWindowPosition = windowPosition.current;
    if (
      !config.enabled ||
      forceInteractiveRef.current ||
      !isReady.current ||
      !pet ||
      !currentCursor ||
      !currentWindowPosition
    ) {
      requestIgnoreState(false);
      return;
    }

    const localPoint = physicalCursorToCssPoint(
      currentCursor,
      currentWindowPosition,
      scaleFactor.current,
    );
    const padding = getHitTestPadding(
      !desiredIgnore.current,
      config.enterPaddingCssPx,
      config.exitPaddingCssPx,
    );
    const hitsContent = pointHitsInteractiveContent(pet, localPoint, padding);
    requestIgnoreState(!hitsContent);
  }, [config, petElement, requestIgnoreState]);
  evaluateRef.current = evaluate;

  const scheduleEvaluation = useCallback(() => {
    if (evaluationFrame.current !== undefined) return;
    evaluationFrame.current = window.requestAnimationFrame(() => {
      evaluationFrame.current = undefined;
      evaluateRef.current();
    });
  }, []);

  useEffect(() => {
    scheduleEvaluation();
  }, [forceInteractive, scheduleEvaluation]);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    windowHandle.current = appWindow;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const registerUnlistener = (unlisten: () => void) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    void Promise.all([
      cursorPosition(),
      appWindow.outerPosition(),
      appWindow.scaleFactor(),
    ]).then(([initialCursor, initialPosition, factor]) => {
      if (disposed) return;
      cursor.current = { x: initialCursor.x, y: initialCursor.y };
      windowPosition.current = {
        x: initialPosition.x,
        y: initialPosition.y,
      };
      scaleFactor.current = factor;
      isReady.current = true;
      scheduleEvaluation();
    }).catch((error) => {
      console.error("初始化点击穿透失败，窗口保持可交互:", error);
      requestIgnoreState(false);
    });

    void listen<Point>("global-cursor-move", (event) => {
      cursor.current = event.payload;
      scheduleEvaluation();
    }).then(registerUnlistener);

    void appWindow.onMoved((event) => {
      windowPosition.current = {
        x: event.payload.x,
        y: event.payload.y,
      };
      scheduleEvaluation();
    }).then(registerUnlistener);

    void appWindow.onScaleChanged((event) => {
      scaleFactor.current = event.payload.scaleFactor;
      scheduleEvaluation();
    }).then(registerUnlistener);

    return () => {
      disposed = true;
      isReady.current = false;
      unlisteners.forEach((unlisten) => unlisten());
      if (evaluationFrame.current !== undefined) {
        window.cancelAnimationFrame(evaluationFrame.current);
        evaluationFrame.current = undefined;
      }
      // 仍通过同一串行队列恢复交互，避免 StrictMode 重挂载时旧 Promise
      // 在新穿透状态之后完成，反向覆盖最新结果。
      requestIgnoreState(false);
    };
  }, [config, requestIgnoreState, scheduleEvaluation]);
};
