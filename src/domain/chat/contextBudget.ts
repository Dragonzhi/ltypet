import type { ChatMessage, ProviderMessage } from "./types";

/**
 * 以 Unicode 字符数限制外发上下文。优先保留最近消息，并保证本次用户消息存在。
 * 这是供应商无关的保守预算；真正 token 数仍由具体模型决定。
 */
export function fitMessagesToBudget(
  messages: readonly ChatMessage[],
  maxChars: number,
): ProviderMessage[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) return [];

  const selected: ProviderMessage[] = [];
  let remaining = maxChars;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.content.length === 0) continue;
    const chars = Array.from(message.content);
    if (chars.length <= remaining) {
      selected.push({ role: message.role, content: message.content });
      remaining -= chars.length;
      continue;
    }
    if (selected.length === 0) {
      selected.push({
        role: message.role,
        content: chars.slice(chars.length - remaining).join(""),
      });
    }
    break;
  }
  return selected.reverse();
}

export function countMessageChars(messages: readonly ProviderMessage[]): number {
  return messages.reduce(
    (total, message) => total + Array.from(message.content).length,
    0,
  );
}
