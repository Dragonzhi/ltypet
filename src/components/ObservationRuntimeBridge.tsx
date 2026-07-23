import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ObservationSettings } from "../domain/settings/types";
import type { ObservationSourceGrant } from "../domain/observations/types";
import { usePetRuntime } from "../hooks/usePetRuntime";

const WINDOWS_MEDIA_SOURCE: ObservationSourceGrant = {
  source: { kind: "system", id: "windows-media-session" },
  eventTypes: ["media.playback"],
  maxSensitivity: "status",
};

const DEV_CONSOLE_SOURCE: ObservationSourceGrant = {
  source: { kind: "system", id: "debug-console" },
  eventTypes: ["media.playback", "dev-agent.status"],
  maxSensitivity: "status",
};

/**
 * 将持久化设置应用到主窗口唯一的 ObservationHost。
 * 第三方插件授权不会在这里使用通配符，M13-C 将由插件注册表逐项加入 grant。
 */
export default function ObservationRuntimeBridge({ settings }: { settings: ObservationSettings | null }) {
  const { observationHost } = usePetRuntime();
  const enabled = settings?.enabled ?? false;
  const systemMediaEnabled = settings?.systemMediaEnabled ?? false;
  const diagnosticsEnabled = settings?.diagnosticsEnabled ?? true;
  const quietHoursEnabled = settings?.quietHoursEnabled ?? false;
  const quietHoursStartMinute = settings?.quietHoursStartMinute ?? 22 * 60;
  const quietHoursEndMinute = settings?.quietHoursEndMinute ?? 8 * 60;
  const [safetyPaused, setSafetyPaused] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen("agent-stop-all", () => {
      // 总开关本来就是关闭状态时，不让一次安全停止污染未来的首次启用。
      if (enabledRef.current) setSafetyPaused(true);
    }).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!enabled) setSafetyPaused(false);
  }, [enabled]);

  useEffect(() => {
    const grants: ObservationSourceGrant[] = [];
    if (systemMediaEnabled) grants.push(WINDOWS_MEDIA_SOURCE);
    if (import.meta.env.DEV) grants.push(DEV_CONSOLE_SOURCE);
    observationHost.configure({
      enabled: enabled && !safetyPaused,
      diagnosticsEnabled,
      grants,
      quietHours: {
        enabled: quietHoursEnabled,
        startMinute: quietHoursStartMinute,
        endMinute: quietHoursEndMinute,
      },
    });
    return () => {
      observationHost.configure({ enabled: false, diagnosticsEnabled, grants: [] });
    };
  }, [
    diagnosticsEnabled,
    enabled,
    observationHost,
    quietHoursEnabled,
    quietHoursEndMinute,
    quietHoursStartMinute,
    safetyPaused,
    systemMediaEnabled,
  ]);

  return null;
}
