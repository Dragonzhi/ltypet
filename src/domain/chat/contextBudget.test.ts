import { describe, expect, it } from "vitest";
import { countMessageChars, fitMessagesToBudget } from "./contextBudget";
import type { ChatMessage } from "./types";

const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "older question" },
  { id: "2", role: "assistant", content: "older answer" },
  { id: "3", role: "user", content: "latest" },
];

describe("fitMessagesToBudget", () => {
  it("keeps the newest complete messages within budget", () => {
    expect(fitMessagesToBudget(messages, 18)).toEqual([
      { role: "assistant", content: "older answer" },
      { role: "user", content: "latest" },
    ]);
  });

  it("truncates only the newest message when it alone exceeds budget", () => {
    expect(fitMessagesToBudget(messages, 3)).toEqual([
      { role: "user", content: "est" },
    ]);
  });

  it("counts unicode code points rather than UTF-16 units", () => {
    const fitted = fitMessagesToBudget(
      [{ id: "1", role: "user", content: "A😀天" }],
      2,
    );
    expect(fitted[0]?.content).toBe("😀天");
    expect(countMessageChars(fitted)).toBe(2);
  });
});
