import {
  ChatProviderError,
  type ChatProvider,
  type ChatProviderRequest,
  type ChatStreamOptions,
} from "../domain/chat/types";

export interface MockChatProviderOptions {
  chunkDelayMs?: number;
}

export class MockChatProvider implements ChatProvider {
  readonly id = "mock" as const;
  readonly external = false;
  private readonly chunkDelayMs: number;

  constructor(options: MockChatProviderOptions = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 35;
  }

  async stream(
    request: ChatProviderRequest,
    options: ChatStreamOptions,
  ): Promise<void> {
    const prompt = [...request.messages].reverse().find((message) =>
      message.role === "user"
    )?.content.trim();
    if (!prompt) {
      throw new ChatProviderError("invalid_request", "请输入想说的话");
    }
    const response = `（离线 Mock）我收到了：${prompt}`;
    for (const chunk of splitText(response, 4)) {
      if (options.signal.aborted) {
        throw new ChatProviderError("cancelled", "已停止生成");
      }
      await abortableDelay(this.chunkDelayMs, options.signal);
      options.onDelta(chunk);
    }
  }
}

function splitText(text: string, size: number): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(""));
  }
  return chunks;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ChatProviderError("cancelled", "已停止生成"));
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(new ChatProviderError("cancelled", "已停止生成"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
