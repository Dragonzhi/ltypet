import { isTauri } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import {
  cursorPosition,
  getCurrentWindow,
  type Window,
} from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { PET_INTERACTION_CONFIG } from "../config/petInteraction";
import {
  calculateDraggedWindowPosition,
  cssScreenPointToPhysical,
  distanceBetweenPoints,
  exceedsDragThreshold,
  type Point,
} from "../motion/petInteractionMath";

interface DragSession {
  startCursor: Point;
  startWindowPosition: Point;
  maxDistancePhysicalPx: number;
  scaleFactor: number;
}

interface CursorSample extends Point {
  sampledAt: number;
}

interface UseWindowDragOptions {
  onEnd: (didDrag: boolean) => void;
}

export const useWindowDrag = ({ onEnd }: UseWindowDragOptions) => {
  const config = PET_INTERACTION_CONFIG.windowDrag;
  const [isDragging, setIsDragging] = useState(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const windowHandle = useRef<Window | null>(null);
  const currentWindowPosition = useRef<Point | null>(null);
  const latestCursor = useRef<CursorSample | null>(null);
  const scaleFactor = useRef(1);
  const isReady = useRef(false);
  const session = useRef<DragSession | null>(null);
  const desiredPosition = useRef<Point | null>(null);
  const isApplyingPosition = useRef(false);
  const positionFrame = useRef<number | undefined>(undefined);
  const safetyTimer = useRef<number | undefined>(undefined);
  const isMounted = useRef(true);
  const flushPositionRef = useRef<() => void>(() => undefined);

  const finishDrag = useCallback(
    (didDragOverride?: boolean) => {
      const activeSession = session.current;
      if (!activeSession) return;
      session.current = null;
      if (safetyTimer.current !== undefined) {
        window.clearTimeout(safetyTimer.current);
        safetyTimer.current = undefined;
      }
      if (positionFrame.current !== undefined) {
        window.cancelAnimationFrame(positionFrame.current);
        positionFrame.current = undefined;
      }
      // 松手前的最后一个全局坐标仍需落到原生窗口。
      flushPositionRef.current();
      const didDrag =
        didDragOverride ??
        exceedsDragThreshold(
          activeSession.maxDistancePhysicalPx,
          config.dragThresholdCssPx,
          activeSession.scaleFactor,
        );
      setIsDragging(false);
      onEndRef.current(didDrag);
    },
    [config],
  );

  const flushPosition = useCallback(() => {
    const appWindow = windowHandle.current;
    if (!appWindow || isApplyingPosition.current) return;
    isApplyingPosition.current = true;

    void (async () => {
      try {
        while (isMounted.current && desiredPosition.current) {
          const nextPosition = desiredPosition.current;
          desiredPosition.current = null;
          await appWindow.setPosition(
            new PhysicalPosition(
              Math.round(nextPosition.x),
              Math.round(nextPosition.y),
            ),
          );
        }
      } catch (error) {
        console.error("自定义窗口拖动失败:", error);
        desiredPosition.current = null;
        finishDrag(false);
      } finally {
        isApplyingPosition.current = false;
        if (isMounted.current && desiredPosition.current) {
          flushPositionRef.current();
        }
      }
    })();
  }, [finishDrag]);
  flushPositionRef.current = flushPosition;

  const schedulePosition = useCallback(() => {
    if (positionFrame.current !== undefined) return;
    positionFrame.current = window.requestAnimationFrame(() => {
      positionFrame.current = undefined;
      flushPosition();
    });
  }, [flushPosition]);

  const beginDrag = useCallback(
    (screenXCssPx?: number, screenYCssPx?: number) => {
      const latestSample = latestCursor.current;
      const position = currentWindowPosition.current;
      if (!isReady.current || !position || session.current) {
        return false;
      }

      const hasFreshGlobalSample =
        latestSample &&
        performance.now() - latestSample.sampledAt <=
          config.cursorSampleFreshnessMs;
      const eventCursor =
        screenXCssPx !== undefined && screenYCssPx !== undefined
          ? cssScreenPointToPhysical(
              { x: screenXCssPx, y: screenYCssPx },
              scaleFactor.current,
            )
          : null;
      const cursor = hasFreshGlobalSample
        ? latestSample
        : eventCursor ?? latestSample;
      if (!cursor) return false;

      session.current = {
        startCursor: { x: cursor.x, y: cursor.y },
        startWindowPosition: { ...position },
        maxDistancePhysicalPx: 0,
        scaleFactor: scaleFactor.current,
      };
      setIsDragging(true);
      safetyTimer.current = window.setTimeout(
        () => finishDrag(),
        config.safetyTimeoutMs,
      );
      return true;
    },
    [config, finishDrag],
  );

  useEffect(() => {
    isMounted.current = true;
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
    ]).then(([cursor, position, factor]) => {
      if (disposed) return;
      latestCursor.current = {
        x: cursor.x,
        y: cursor.y,
        sampledAt: performance.now(),
      };
      currentWindowPosition.current = { x: position.x, y: position.y };
      scaleFactor.current = factor;
      isReady.current = true;
    }).catch((error) => {
      console.error("初始化自定义窗口拖动失败:", error);
    });

    void listen<Point>("global-cursor-move", (event) => {
      const cursor = event.payload;
      latestCursor.current = { ...cursor, sampledAt: performance.now() };
      const activeSession = session.current;
      if (!activeSession) return;

      activeSession.maxDistancePhysicalPx = Math.max(
        activeSession.maxDistancePhysicalPx,
        distanceBetweenPoints(activeSession.startCursor, cursor),
      );
      desiredPosition.current = calculateDraggedWindowPosition(
        activeSession.startWindowPosition,
        activeSession.startCursor,
        cursor,
      );
      schedulePosition();
    }).then(registerUnlistener);

    void listen<Point>("global-left-button-up", () => {
      finishDrag();
    }).then(registerUnlistener);

    void appWindow.onMoved((event) => {
      currentWindowPosition.current = {
        x: event.payload.x,
        y: event.payload.y,
      };
    }).then(registerUnlistener);

    void appWindow.onScaleChanged((event) => {
      scaleFactor.current = event.payload.scaleFactor;
    }).then(registerUnlistener);

    return () => {
      disposed = true;
      isReady.current = false;
      unlisteners.forEach((unlisten) => unlisten());
      if (session.current) finishDrag(false);
      isMounted.current = false;
      desiredPosition.current = null;
      if (positionFrame.current !== undefined) {
        window.cancelAnimationFrame(positionFrame.current);
        positionFrame.current = undefined;
      }
      if (safetyTimer.current !== undefined) {
        window.clearTimeout(safetyTimer.current);
        safetyTimer.current = undefined;
      }
    };
  }, [finishDrag, schedulePosition]);

  return { beginDrag, isDragging };
};
