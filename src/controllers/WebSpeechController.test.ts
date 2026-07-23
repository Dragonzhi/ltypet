import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechControllerError, WebSpeechController } from "./WebSpeechController";

class FakeSpeechSynthesis {
  spoken: SpeechSynthesisUtterance | null = null;
  cancelCalls = 0;
  voices = [
    { voiceURI: "local-zh", name: "本地中文", lang: "zh-CN", localService: true, default: true },
    { voiceURI: "remote", name: "远程音色", lang: "zh-CN", localService: false, default: false },
  ] as SpeechSynthesisVoice[];

  getVoices() { return this.voices; }
  speak(utterance: SpeechSynthesisUtterance) {
    this.spoken = utterance;
    utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
  }
  cancel() { this.cancelCalls += 1; }
}

function createUtterance(text: string): SpeechSynthesisUtterance {
  return {
    text,
    volume: 1,
    rate: 1,
    pitch: 1,
    voice: null,
    onstart: null,
    onend: null,
    onerror: null,
  } as unknown as SpeechSynthesisUtterance;
}

function createController(fake: FakeSpeechSynthesis) {
  return new WebSpeechController({
    synthesis: fake as unknown as SpeechSynthesis,
    createUtterance,
  });
}

describe("WebSpeechController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("默认关闭，并且只公开本地系统音色", async () => {
    const fake = new FakeSpeechSynthesis();
    const controller = createController(fake);
    expect(controller.getVoices()).toEqual([
      { id: "local-zh", name: "本地中文", language: "zh-CN", local: true },
    ]);
    await expect(controller.say("你好")).rejects.toMatchObject({ code: "speech_disabled" });
  });

  it("朗读期间生成有限口型并在结束后归零", async () => {
    const fake = new FakeSpeechSynthesis();
    const controller = createController(fake);
    controller.configure({
      enabled: true,
      volume: 0.7,
      rate: 1.2,
      pitch: 0.9,
      voiceUri: "local-zh",
      reducedMotion: false,
    });
    const levels: number[] = [];
    const promise = controller.say("你好，小洛宝", { onMouthLevel: (level) => levels.push(level) });
    await vi.advanceTimersByTimeAsync(150);
    fake.spoken?.onend?.(new Event("end") as SpeechSynthesisEvent);
    await promise;

    expect(fake.spoken?.voice?.voiceURI).toBe("local-zh");
    expect(levels.length).toBeGreaterThan(2);
    expect(levels.every((level) => level >= 0 && level <= 0.55)).toBe(true);
    expect(levels.some((level) => level > 0 && level < 0.3)).toBe(true);
    expect(levels[levels.length - 1]).toBe(0);
    expect(controller.getCacheStatus()).toEqual({ entries: 0, bytes: 0, policy: "none" });
  });

  it("停止时取消系统朗读并拒绝尚未完成的请求", async () => {
    const fake = new FakeSpeechSynthesis();
    const controller = createController(fake);
    controller.configure({
      enabled: true,
      volume: 1,
      rate: 1,
      pitch: 1,
      voiceUri: "",
      reducedMotion: true,
    });
    const promise = controller.say("需要停止");
    controller.stop();
    await expect(promise).rejects.toBeInstanceOf(SpeechControllerError);
    expect(fake.cancelCalls).toBeGreaterThan(0);
  });
});
