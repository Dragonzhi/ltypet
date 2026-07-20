import type { CollectedMotionEvent, MotionEventHandlers } from "./types";

export const dispatchMotionEvents = (
  collected: readonly CollectedMotionEvent[],
  handlers: MotionEventHandlers,
) => {
  for (const { event } of collected) {
    switch (event.type) {
      case "blink":
        handlers.onBlink?.();
        break;
      case "mouthOpen":
        handlers.onMouthOpen?.();
        break;
      case "mouthClose":
        handlers.onMouthClose?.();
        break;
      case "sfx":
      case "custom":
        handlers.onDiagnostic?.({
          code: "unsupported-event",
          message: `已忽略未注册的动作事件 ${event.type}`,
          severity: "warn",
        });
        break;
    }
  }
};
