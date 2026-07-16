import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import TianyiArtwork, {
  type PetAction,
  type PetExpression,
} from "./TianyiArtwork";
import {
  useEarTwitch,
  useHairMotion,
  usePointerFollow,
} from "../hooks/usePetMotion";
import { useClickThrough } from "../hooks/useClickThrough";
import { useWindowDrag } from "../hooks/useWindowDrag";
import { PET_INTERACTION_CONFIG } from "../config/petInteraction";
import {
  distanceBetweenPoints,
  exceedsDragThreshold,
} from "../motion/petInteractionMath";
import { BehaviorScheduler } from "../domain/scheduler/scheduler";
import { getDefaultChannel } from "../domain/scheduler/channelPolicy";
import { PetActionExecutor } from "../domain/controllers/executor";
import { SvgCharacterRenderer } from "../controllers/SvgCharacterRenderer";
import { TauriWindowController } from "../controllers/TauriWindowController";
import type { ActionRequest } from "../domain/actions/types";

// 天依的核心动画状态
type PetState = "idle" | "blink" | "listen" | "speak" | "sleep" | "drag";

interface ContextMenuPosition {
  x: number;
  y: number;
}

const getExpression = (state: PetState): PetExpression => {
  if (state === "blink") return "blink";
  if (state === "speak") return "speak";
  if (state === "sleep") return "sleep";
  return "normal";
};

const TianyiPet = () => {
  const [state, setState] = useState<PetState>("idle");
  const [action, setAction] = useState<PetAction>("none");
  const [expression, setExpression] = useState<PetExpression>(getExpression("idle"));
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const petElement = useRef<HTMLDivElement>(null);
  const contextMenuOpenRef = useRef(false);
  const hasDragged = useRef(false);
  const restoreStateTimer = useRef<number | undefined>(undefined);

  // --- Create runtime (scheduler + executor + renderer + windowController) ---
  const runtimeRef = useRef<{
    scheduler: BehaviorScheduler;
    executor: PetActionExecutor;
    renderer: SvgCharacterRenderer;
    windowController: TauriWindowController;
  } | null>(null);

  if (!runtimeRef.current) {
    const renderer = new SvgCharacterRenderer({
      element: petElement,
      onActionChange: (a) => setAction(a),
      onExpressionChange: (e) => setExpression(e),
    });
    const windowController = new TauriWindowController();
    const executor = new PetActionExecutor({ renderer, windowController });
    const scheduler = new BehaviorScheduler({ executor });
    runtimeRef.current = { scheduler, executor, renderer, windowController };
  }
  const { scheduler } = runtimeRef.current;

  // Keep hooks as-is
  usePointerFollow(petElement, "global");
  useEarTwitch(petElement);
  const { beginDrag: beginHairDrag, endDrag: endHairDrag } =
    useHairMotion(petElement);

  // --- Drag end handler: now also resumes agent actions ---
  const handleWindowDragEnd = useCallback(
    (didDrag: boolean) => {
      hasDragged.current = didDrag;
      endHairDrag();
      setState("idle");
      scheduler.resumeAgentActions();
    },
    [endHairDrag, scheduler],
  );
  const windowDrag = useWindowDrag({ onEnd: handleWindowDragEnd });
  useClickThrough(petElement, {
    forceInteractive:
      state === "drag" || windowDrag.isDragging || contextMenuOpen,
  });

  // idle 动画循环 — 随机眨眼，并在短暂动作结束后恢复原状态。
  // After refactor: expression is a separate state, set directly.
  useEffect(() => {
    if (state !== "idle" && state !== "listen") return;

    const blinkTimer = window.setTimeout(() => {
      setExpression("blink");
      restoreStateTimer.current = window.setTimeout(() => {
        setExpression("normal");
      }, 180);
    }, 3000 + Math.random() * 2000);

    return () => window.clearTimeout(blinkTimer);
  }, [state]);

  useEffect(
    () => () => {
      if (restoreStateTimer.current !== undefined) {
        window.clearTimeout(restoreStateTimer.current);
      }
    },
    [],
  );

  // --- Cleanup runtime on unmount ---
  // StrictMode 会挂载→卸载→重新挂载；useRef 保留同一实例。
  // 如果在 cleanup 中 dispose，重新挂载后调度器已释放，submit 会抛错。
  // 因此 cleanup 只取消所有动作，不释放运行时；真正的资源由 GC 回收。
  useEffect(() => {
    const runtime = runtimeRef.current;
    return () => {
      runtime?.scheduler.cancelAll();
    };
  }, []);

  const handleMouseDown = async (event: React.MouseEvent) => {
    if (event.button !== 0) return;

    // Cancel any autonomous movement and pause agent actions during drag
    scheduler.cancelChannel("locomotion");
    scheduler.pauseAgentActions();

    setAction("none");
    setState("drag");
    hasDragged.current = false;
    beginHairDrag(event.screenX, event.screenY);
    if (windowDrag.beginDrag(event.screenX, event.screenY)) return;

    // 初始化尚未完成时保留系统拖动作为降级路径。
    let fallbackDidDrag = false;
    try {
      const [cursor, factor] = await Promise.all([
        cursorPosition(),
        getCurrentWindow().scaleFactor(),
      ]);
      const fallbackStart = { x: cursor.x, y: cursor.y };
      await invoke("start_dragging");
      const endCursor = await cursorPosition();
      fallbackDidDrag = exceedsDragThreshold(
        distanceBetweenPoints(fallbackStart, endCursor),
        PET_INTERACTION_CONFIG.windowDrag.dragThresholdCssPx,
        factor,
      );
    } catch (err) {
      console.error("拖拽失败:", err);
    } finally {
      hasDragged.current = fallbackDidDrag;
      endHairDrag();
      setState("idle");
      scheduler.resumeAgentActions();
    }
  };

  const showContextMenu = useCallback(
    async (position: ContextMenuPosition) => {
      if (contextMenuOpenRef.current) return;
      contextMenuOpenRef.current = true;
      setContextMenuOpen(true);
      scheduler.pauseAgentActions();

      try {
        await invoke("show_context_menu", { position });
      } catch (error) {
        console.error("打开右键菜单失败:", error);
      } finally {
        contextMenuOpenRef.current = false;
        setContextMenuOpen(false);
        scheduler.resumeAgentActions();
      }
    },
    [scheduler],
  );

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void showContextMenu({ x: event.clientX, y: event.clientY });
  };

  const triggerWave = useCallback(() => {
    if (hasDragged.current) return;
    const channel = getDefaultChannel("motion.play");
    if (!channel) return;
    const actionRequest: ActionRequest = {
      id: `wave-${Date.now()}`,
      type: "motion.play",
      payload: { motion: "wave" },
      source: "user",
      requestedAt: Date.now(),
    } as ActionRequest;
    scheduler.submit(actionRequest, { channel, priority: "user" });
  }, [scheduler]);

  const handleClick = useCallback(() => {
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    triggerWave();
  }, [triggerWave]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const opensContextMenu =
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10");
    if (opensContextMenu) {
      event.preventDefault();
      event.stopPropagation();
      const bounds = petElement.current?.getBoundingClientRect();
      if (bounds) {
        void showContextMenu({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
      }
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    triggerWave();
  };

  return (
    <div
      ref={petElement}
      aria-label="小洛宝，按回车招手，按菜单键打开菜单"
      className={`pet-shell${state === "sleep" ? " is-sleeping" : ""}`}
      data-action={action}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      role="button"
      style={{
        cursor: state === "drag" ? "grabbing" : "grab",
      }}
      tabIndex={0}
    >
      <TianyiArtwork action={action} expression={expression} />
    </div>
  );
};

export default TianyiPet;
