import { describe, expect, it, vi } from "vitest";
import { MockChatProvider } from "./MockChatProvider";

describe("MockChatProvider", () => {
  it("streams deterministic offline chunks", async () => {
    vi.useFakeTimers();
    const provider = new MockChatProvider({ chunkDelayMs: 10 });
    const chunks: string[] = [];
    const promise = provider.stream(
      { requestId: "r1", messages: [{ role: "user", content: "你好" }] },
      { signal: new AbortController().signal, onDelta: (chunk) => chunks.push(chunk) },
    );
    await vi.runAllTimersAsync();
    await promise;
    expect(chunks.join("")).toBe("（离线 Mock）我收到了：你好");
    vi.useRealTimers();
  });

  it("supports cancellation", async () => {
    vi.useFakeTimers();
    const provider = new MockChatProvider({ chunkDelayMs: 10 });
    const controller = new AbortController();
    const promise = provider.stream(
      { requestId: "r1", messages: [{ role: "user", content: "你好" }] },
      { signal: controller.signal, onDelta: () => undefined },
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "cancelled" });
    vi.useRealTimers();
  });
});
