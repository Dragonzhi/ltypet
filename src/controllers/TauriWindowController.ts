import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import type { WindowController } from "../domain/controllers/types";
import type { WindowTarget, WindowSemanticPosition } from "../domain/actions/types";

export class TauriWindowController implements WindowController {
  private disposed = false;

  constructor() {
    // No initialization needed for M3
  }

  async moveTo(target: WindowTarget, _options?: { durationMs?: number }): Promise<void> {
    if (this.disposed) throw new Error("窗口控制器已释放");

    const window = getCurrentWindow();

    if (target.kind === "semantic") {
      const monitor = await currentMonitor();
      if (!monitor) {
        // No monitor detected; center as fallback
        await window.center();
        return;
      }

      const winSize = await window.outerSize();
      const pos = calculateSemanticPosition(
        target.position,
        { x: monitor.position.x, y: monitor.position.y },
        { width: monitor.size.width, height: monitor.size.height },
        { width: winSize.width, height: winSize.height },
      );

      await window.setPosition(new PhysicalPosition(Math.round(pos.x), Math.round(pos.y)));
    } else if (target.kind === "normalized") {
      const monitor = await currentMonitor();
      if (!monitor) {
        await window.center();
        return;
      }

      const winSize = await window.outerSize();
      const x = monitor.position.x + target.x * (monitor.size.width - winSize.width);
      const y = monitor.position.y + target.y * (monitor.size.height - winSize.height);

      await window.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
    }
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

    await getCurrentWindow().center();
  }

  dispose(): void {
    this.disposed = true;
  }
}

interface Position2D {
  x: number;
  y: number;
}

interface Size2D {
  width: number;
  height: number;
}

function calculateSemanticPosition(
  position: WindowSemanticPosition,
  monitorPos: Position2D,
  monitorSize: Size2D,
  winSize: Size2D,
): Position2D {
  const centerX = monitorPos.x + (monitorSize.width - winSize.width) / 2;
  const centerY = monitorPos.y + (monitorSize.height - winSize.height) / 2;

  switch (position) {
    case "center":
      return { x: centerX, y: centerY };
    case "top":
      return { x: centerX, y: monitorPos.y };
    case "bottom":
      return { x: centerX, y: monitorPos.y + monitorSize.height - winSize.height };
    case "left":
      return { x: monitorPos.x, y: centerY };
    case "right":
      return { x: monitorPos.x + monitorSize.width - winSize.width, y: centerY };
    case "top-left":
      return { x: monitorPos.x, y: monitorPos.y };
    case "top-right":
      return { x: monitorPos.x + monitorSize.width - winSize.width, y: monitorPos.y };
    case "bottom-left":
      return { x: monitorPos.x, y: monitorPos.y + monitorSize.height - winSize.height };
    case "bottom-right":
      return { x: monitorPos.x + monitorSize.width - winSize.width, y: monitorPos.y + monitorSize.height - winSize.height };
  }
}
