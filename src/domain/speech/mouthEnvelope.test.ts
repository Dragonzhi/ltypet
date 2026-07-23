import { describe, expect, it } from "vitest";
import { mapMouthLevel, mouthLevelAt, speechTextSeed } from "./mouthEnvelope";

describe("speech mouth envelope", () => {
  it("生成有限、确定且有变化的开口量", () => {
    const seed = speechTextSeed("你好，小洛宝");
    const levels = [0, 40, 80, 140, 220, 360].map((time) => mouthLevelAt(time, seed));
    expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true);
    expect(new Set(levels.map((level) => level.toFixed(3))).size).toBeGreaterThan(2);
    expect(speechTextSeed("你好，小洛宝")).toBe(seed);
  });

  it("非法时间安全回到闭嘴", () => {
    expect(mouthLevelAt(-1, 1)).toBe(0);
    expect(mouthLevelAt(Number.NaN, 1)).toBe(0);
  });

  it("把模拟节奏压缩到自然说话范围，并让中等输入偏向小开口", () => {
    const mapping = { minimumOpen: 0.08, maximumOpen: 0.55, curveExponent: 1.7 };
    expect(mapMouthLevel(0, mapping)).toBe(0);
    expect(mapMouthLevel(1, mapping)).toBeCloseTo(0.55);
    expect(mapMouthLevel(0.5, mapping)).toBeGreaterThanOrEqual(0.08);
    expect(mapMouthLevel(0.5, mapping)).toBeLessThan(0.32);
    expect(mapMouthLevel(Number.NaN, mapping)).toBe(0);
  });
});
