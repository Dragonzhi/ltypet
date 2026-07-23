/**
 * Web Speech API 不提供音频采样，因此使用确定性的语音节奏包络驱动极简两态口型。
 * 这不是音素识别；未来支持 viseme 的 Provider 可直接绕过本函数提交精确开口量。
 */
export function mouthLevelAt(elapsedMs: number, textSeed: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const cycleMs = 138 + (textSeed % 5) * 7;
  const cycle = Math.floor(elapsedMs / cycleMs);
  const phase = (elapsedMs % cycleMs) / cycleMs;
  if ((cycle + textSeed) % 7 === 5) return 0.12;
  const pulse = Math.sin(Math.PI * phase) ** 0.72;
  const variation = 0.72 + ((cycle * 17 + textSeed) % 29) / 100;
  return clamp(0.16 + pulse * variation, 0, 1);
}

export function speechTextSeed(text: string): number {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
