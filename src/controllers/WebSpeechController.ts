import type {
  SpeechCacheStatus,
  SpeechConfiguration,
  SpeechController,
  SpeechSayOptions,
  SpeechVoice,
} from "../domain/controllers/types";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";
import { mapMouthLevel, mouthLevelAt, speechTextSeed } from "../domain/speech/mouthEnvelope";

export type SpeechErrorCode =
  | "speech_disabled"
  | "speech_unavailable"
  | "speech_cancelled"
  | "speech_failed";

export class SpeechControllerError extends Error {
  readonly code: SpeechErrorCode;

  constructor(code: SpeechErrorCode, message: string) {
    super(message);
    this.name = "SpeechControllerError";
    this.code = code;
  }
}

interface ActiveSpeech {
  reject: (error: Error) => void;
  stopMouth: () => void;
}

const DEFAULT_CONFIGURATION: SpeechConfiguration = {
  enabled: false,
  volume: 0.8,
  rate: 1,
  pitch: 1,
  voiceUri: "",
  reducedMotion: false,
};

/** 使用 WebView2/Windows 可用系统语音的本地 TTS 适配器。 */
export class WebSpeechController implements SpeechController {
  private readonly synthesis: SpeechSynthesis | null;
  private readonly createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
  private configuration = DEFAULT_CONFIGURATION;
  private active: ActiveSpeech | null = null;
  private disposed = false;

  constructor(options: {
    synthesis?: SpeechSynthesis | null;
    createUtterance?: ((text: string) => SpeechSynthesisUtterance) | null;
  } = {}) {
    this.synthesis = options.synthesis !== undefined
      ? options.synthesis
      : typeof window !== "undefined" && "speechSynthesis" in window
        ? window.speechSynthesis
        : null;
    this.createUtterance = options.createUtterance !== undefined
      ? options.createUtterance
      : typeof SpeechSynthesisUtterance !== "undefined"
        ? (text) => new SpeechSynthesisUtterance(text)
        : null;
  }

  isAvailable(): boolean {
    return !this.disposed && this.synthesis !== null && this.createUtterance !== null;
  }

  configure(configuration: SpeechConfiguration): void {
    this.configuration = {
      ...configuration,
      volume: clamp(configuration.volume, 0, 1),
      rate: clamp(configuration.rate, 0.5, 2),
      pitch: clamp(configuration.pitch, 0.5, 2),
    };
    if (!this.configuration.enabled || this.configuration.volume === 0) this.stop();
  }

  getVoices(): SpeechVoice[] {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices()
      .filter((voice) => voice.localService)
      .map((voice) => ({
        id: voice.voiceURI,
        name: voice.name,
        language: voice.lang,
        local: voice.localService,
      }));
  }

  say(text: string, options: SpeechSayOptions = {}): Promise<void> {
    const content = text.trim();
    if (!this.configuration.enabled) {
      return Promise.reject(new SpeechControllerError("speech_disabled", "语音朗读未启用"));
    }
    if (!this.isAvailable() || !this.synthesis || !this.createUtterance) {
      return Promise.reject(new SpeechControllerError("speech_unavailable", "当前 WebView 没有可用的系统语音合成"));
    }
    if (!content) {
      return Promise.reject(new SpeechControllerError("speech_failed", "朗读文本不能为空"));
    }

    this.stop();
    const synthesis = this.synthesis;
    const utterance = this.createUtterance(content);
    utterance.volume = this.configuration.volume;
    utterance.rate = this.configuration.rate;
    utterance.pitch = this.configuration.pitch;
    const localVoices = synthesis.getVoices().filter((candidate) => candidate.localService);
    const voice = localVoices.find(
      (candidate) => candidate.voiceURI === this.configuration.voiceUri,
    ) ?? localVoices.find((candidate) => candidate.default) ?? localVoices[0];
    if (voice) utterance.voice = voice;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let startedAt = 0;
      let mouthTimer: ReturnType<typeof setInterval> | undefined;
      const seed = speechTextSeed(content);
      const stopMouth = () => {
        if (mouthTimer !== undefined) clearInterval(mouthTimer);
        mouthTimer = undefined;
        options.onMouthLevel?.(0);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        stopMouth();
        if (this.active?.reject === reject) this.active = null;
        if (error) reject(error);
        else resolve();
      };
      this.active = {
        reject: (error) => finish(error),
        stopMouth,
      };
      utterance.onstart = () => {
        startedAt = performance.now();
        if (this.configuration.reducedMotion) {
          options.onMouthLevel?.(PET_ANIMATION_CONFIG.speechMouth.reducedMotionLevel);
          return;
        }
        const mouthConfig = PET_ANIMATION_CONFIG.speechMouth;
        const mapLevel = (level: number) => mapMouthLevel(level, {
          minimumOpen: mouthConfig.minimumOpen,
          maximumOpen: mouthConfig.normalMaximum,
          curveExponent: mouthConfig.curveExponent,
        });
        options.onMouthLevel?.(mapLevel(0.25));
        mouthTimer = setInterval(() => {
          options.onMouthLevel?.(mapLevel(mouthLevelAt(performance.now() - startedAt, seed)));
        }, mouthConfig.sampleIntervalMs);
      };
      utterance.onend = () => finish();
      utterance.onerror = (event) => finish(new SpeechControllerError(
        event.error === "canceled" || event.error === "interrupted"
          ? "speech_cancelled"
          : "speech_failed",
        `系统语音合成失败：${event.error}`,
      ));
      synthesis.speak(utterance);
    });
  }

  stop(): void {
    const active = this.active;
    this.active = null;
    if (active) {
      active.stopMouth();
      active.reject(new SpeechControllerError("speech_cancelled", "语音朗读已停止"));
    }
    this.synthesis?.cancel();
  }

  getCacheStatus(): SpeechCacheStatus {
    // Web Speech 音频由系统管理，应用不取得音频字节，也不建立磁盘缓存。
    return { entries: 0, bytes: 0, policy: "none" };
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
