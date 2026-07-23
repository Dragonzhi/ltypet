import { describe, expect, it } from "vitest";
import { bondLevelFor, buildMemoryContext, type MemorySnapshot } from "./types";

function snapshot(): MemorySnapshot {
  return {
    schemaVersion: 1,
    entries: [{
      id: "m1",
      category: "preference",
      content: "喜欢喝绿茶",
      source: "user_saved",
      reason: "用户在设置中明确保存",
      createdAtMs: 1,
      updatedAtMs: 1,
    }],
    bond: { points: 12, dailyDate: "2026-07-23", dailyAwards: 1, recentInteractionIds: [], events: [] },
    updatedAtMs: 1,
  };
}

describe("memory domain", () => {
  it("derives transparent bond levels from fixed thresholds", () => {
    expect(bondLevelFor(0).name).toBe("初识");
    expect(bondLevelFor(30).name).toBe("亲近");
    expect(bondLevelFor(100).nextAt).toBeNull();
  });

  it("builds a bounded, injection-aware model context", () => {
    const context = buildMemoryContext(snapshot(), 180);
    expect(context).toContain("用户明确保存");
    expect(context).toContain("喜欢喝绿茶");
    expect(Array.from(context ?? "").length).toBeLessThanOrEqual(180);
  });

  it("keeps the safety and bond summary before optional entry lines", () => {
    const context = buildMemoryContext(snapshot(), 120);
    const safetyIndex = context?.indexOf("不可信") ?? -1;
    const bondIndex = context?.indexOf("羁绊状态") ?? -1;
    const entryIndex = context?.indexOf("喜欢喝绿茶") ?? -1;
    expect(safetyIndex).toBeGreaterThanOrEqual(0);
    expect(bondIndex).toBeGreaterThan(safetyIndex);
    if (entryIndex >= 0) expect(entryIndex).toBeGreaterThan(bondIndex);
  });
});
