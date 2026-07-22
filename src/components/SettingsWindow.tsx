import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  PetSettings,
  WindowSettings,
  AnimationSettings,
  AudioSettings,
  AgentSettings,
  PomodoroSettings,
} from "../domain/settings/types";
import type { TimerKind, TimerSnapshot } from "../domain/controllers/types";
import { TauriTimerController } from "../controllers/TauriTimerController";
import { parseSettings } from "../domain/settings/validate";
import { createDefaultSettings } from "../domain/settings/defaults";

export default function SettingsWindow() {
  const [settings, setSettings] = useState<PetSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [timerController] = useState(() => new TauriTimerController());

  useEffect(() => {
    void (async () => {
      try {
        const json = await invoke<string | null>("load_settings");
        if (json) {
          const result = parseSettings(json);
          if (result.ok) {
            setSettings(result.settings);
            return;
          }
          setLoadError(result.reason);
        }
        setSettings(createDefaultSettings());
      } catch (err) {
        setLoadError(String(err));
        setSettings(createDefaultSettings());
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void listen<string>("settings-changed", (event) => {
      const result = parseSettings(event.payload);
      if (active && result.ok) setSettings(result.settings);
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void timerController.getState().then((state) => {
      if (active) setTimer(state);
    }).catch((error: unknown) => {
      if (active) setTimerError(String(error));
    });
    void timerController.onStateChange((event) => {
      if (active) setTimer(event.timer);
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch((error: unknown) => {
      if (active) setTimerError(String(error));
    });
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      active = false;
      unsubscribe?.();
      window.clearInterval(interval);
    };
  }, [timerController]);

  if (!settings) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 24 }}>加载中...</div>
      </div>
    );
  }

  const save = async (next: PetSettings) => {
    setSettings(next);
    try {
      const json = JSON.stringify(next, null, 2);
      await invoke("save_settings", { json });
    } catch (err) {
      console.error("保存设置失败:", err);
    }
  };

  const updateWindow = (partial: Partial<WindowSettings>) =>
    save({ ...settings, window: { ...settings.window, ...partial } });

  const updateAnimation = (partial: Partial<AnimationSettings>) =>
    save({ ...settings, animation: { ...settings.animation, ...partial } });

  const updateAudio = (partial: Partial<AudioSettings>) =>
    save({ ...settings, audio: { ...settings.audio, ...partial } });

  const updateAgent = (partial: Partial<AgentSettings>) =>
    save({ ...settings, agent: { ...settings.agent, ...partial } });

  const updatePomodoro = (partial: Partial<PomodoroSettings>) =>
    save({ ...settings, pomodoro: { ...settings.pomodoro, ...partial } });

  const runTimerCommand = async (
    command: () => Promise<TimerSnapshot>,
    clearAfter = false,
  ) => {
    setTimerError(null);
    try {
      const snapshot = await command();
      setTimer(clearAfter ? null : snapshot);
    } catch (error) {
      setTimerError(error instanceof Error ? error.message : String(error));
    }
  };

  const startTimer = (kind: TimerKind) => {
    const minutes = kind === "focus"
      ? settings.pomodoro.focusMinutes
      : settings.pomodoro.breakMinutes;
    const timerId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `timer-${Date.now()}`;
    void runTimerCommand(() => timerController.start({
      timerId,
      durationMs: minutes * 60_000,
      kind,
      label: kind === "focus" ? "专注时间" : "休息时间",
      showSystemReminder: settings.pomodoro.showSystemReminder,
      soundEnabled: settings.pomodoro.soundEnabled && settings.audio.enabled,
    }));
  };

  const remainingMs = timer?.status === "running" && timer.deadlineUnixMs !== null
    ? Math.max(0, timer.deadlineUnixMs - now)
    : timer?.remainingMs ?? 0;

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 18 }}>小洛宝设置</h1>
        {loadError && <div style={warnStyle}>设置文件损坏，已使用默认值</div>}
      </header>

      <main style={mainStyle}>
        <Section title="窗口">
          <Row label="始终置顶">
            <input
              type="checkbox"
              checked={settings.window.alwaysOnTop}
              onChange={(e) => updateWindow({ alwaysOnTop: e.target.checked })}
            />
          </Row>
          <Row label="轮廓外点击穿透">
            <input
              type="checkbox"
              checked={settings.window.clickThrough}
              onChange={(e) => updateWindow({ clickThrough: e.target.checked })}
            />
          </Row>
        </Section>

        <Section title="动画">
          <Row label="动作强度">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.animation.intensity}
              onChange={(e) =>
                updateAnimation({ intensity: Number(e.target.value) })
              }
              style={{ width: 160 }}
            />
            <span style={valueStyle}>
              {Math.round(settings.animation.intensity * 100)}%
            </span>
          </Row>
        </Section>

        <Section title="声音">
          <Row label="启用声音">
            <input
              type="checkbox"
              checked={settings.audio.enabled}
              onChange={(e) => updateAudio({ enabled: e.target.checked })}
            />
          </Row>
          <Row label="音量">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.audio.volume}
              onChange={(e) => updateAudio({ volume: Number(e.target.value) })}
              disabled={!settings.audio.enabled}
              style={{ width: 160 }}
            />
            <span style={valueStyle}>
              {Math.round(settings.audio.volume * 100)}%
            </span>
          </Row>
        </Section>

        <Section title="番茄钟">
          <Row label="专注时长（分钟）">
            <input
              type="number"
              min="1"
              max="180"
              value={settings.pomodoro.focusMinutes}
              onChange={(event) => updatePomodoro({
                focusMinutes: Math.min(180, Math.max(1, Math.round(Number(event.target.value) || 1))),
              })}
              style={numberInputStyle}
            />
          </Row>
          <Row label="休息时长（分钟）">
            <input
              type="number"
              min="1"
              max="180"
              value={settings.pomodoro.breakMinutes}
              onChange={(event) => updatePomodoro({
                breakMinutes: Math.min(180, Math.max(1, Math.round(Number(event.target.value) || 1))),
              })}
              style={numberInputStyle}
            />
          </Row>
          <Row label="完成时系统提醒">
            <input
              type="checkbox"
              checked={settings.pomodoro.showSystemReminder}
              onChange={(event) => updatePomodoro({ showSystemReminder: event.target.checked })}
            />
          </Row>
          <Row label="完成时提示音">
            <input
              type="checkbox"
              checked={settings.pomodoro.soundEnabled}
              onChange={(event) => updatePomodoro({ soundEnabled: event.target.checked })}
            />
          </Row>
          <div style={timerStatusStyle} aria-live="polite">
            {timer
              ? `${timer.label || "计时"} · ${timer.status === "running" ? "进行中" : "已暂停"} · ${formatDuration(remainingMs)}`
              : "当前没有计时"}
          </div>
          <div style={timerActionsStyle}>
            <button style={btnStyle} disabled={timer !== null} onClick={() => startTimer("focus")}>开始专注</button>
            <button style={btnStyle} disabled={timer !== null} onClick={() => startTimer("break")}>开始休息</button>
            {timer?.status === "running" && (
              <button style={btnStyle} onClick={() => void runTimerCommand(() => timerController.pause(timer.timerId))}>暂停</button>
            )}
            {timer?.status === "paused" && (
              <button style={btnStyle} onClick={() => void runTimerCommand(() => timerController.resume(timer.timerId))}>继续</button>
            )}
            {timer && (
              <button style={dangerBtnStyle} onClick={() => void runTimerCommand(() => timerController.cancel(timer.timerId), true)}>取消</button>
            )}
          </div>
          {timerError && <div style={warnStyle}>{timerError}</div>}
          <p style={hintStyle}>关闭设置窗口或重启桌宠不会丢失正在进行或暂停的计时。</p>
        </Section>

        <Section title="Agent">
          <Row label="启用 Agent">
            <input
              type="checkbox"
              checked={settings.agent.enabled}
              onChange={(e) => updateAgent({ enabled: e.target.checked })}
            />
          </Row>
          <p style={hintStyle}>
            关闭后所有 Agent 触发的行为将被丢弃，但手动触发的行为仍可执行。
          </p>
        </Section>

        <Section title="行为控制">
          <button
            style={dangerBtnStyle}
            onClick={() => {
              void invoke("stop_all_behaviors");
            }}
          >
            立即停止所有自主行为
          </button>
        </Section>
      </main>

      <footer style={footerStyle}>
        <button
          style={btnStyle}
          onClick={() => getCurrentWindow().close()}
        >
          关闭
        </button>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={rowStyle}>
      <span style={{ flex: 1 }}>{label}</span>
      {children}
    </label>
  );
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  color: "#222",
  background: "#fafafa",
};

const headerStyle: CSSProperties = {
  padding: "16px 20px 12px",
  borderBottom: "1px solid #e5e5e5",
  background: "#fff",
};

const mainStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 20px",
};

const sectionStyle: CSSProperties = {
  padding: "12px 0",
  borderBottom: "1px solid #eee",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "#888",
  margin: "0 0 8px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "6px 0",
  cursor: "pointer",
};

const valueStyle: CSSProperties = {
  minWidth: 40,
  textAlign: "right",
  color: "#666",
  fontVariantNumeric: "tabular-nums",
};

const numberInputStyle: CSSProperties = {
  width: 72,
  padding: "4px 6px",
};

const timerStatusStyle: CSSProperties = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 4,
  background: "#eef8f7",
  color: "#176b66",
  fontVariantNumeric: "tabular-nums",
};

const timerActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: "#888",
  margin: "4px 0 0",
};

const footerStyle: CSSProperties = {
  padding: "12px 20px",
  borderTop: "1px solid #e5e5e5",
  background: "#fff",
  display: "flex",
  justifyContent: "flex-end",
};

const btnStyle: CSSProperties = {
  padding: "6px 16px",
  background: "#f0f0f0",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

const dangerBtnStyle: CSSProperties = {
  ...btnStyle,
  background: "#fef2f2",
  borderColor: "#fca5a5",
  color: "#b91c1c",
};

const warnStyle: CSSProperties = {
  marginTop: 8,
  padding: "4px 8px",
  background: "#fef3c7",
  border: "1px solid #fcd34d",
  borderRadius: 4,
  fontSize: 12,
  color: "#92400e",
};
