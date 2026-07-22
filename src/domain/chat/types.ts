export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ProviderMessage {
  role: ChatRole;
  content: string;
}

export interface ChatProviderRequest {
  requestId: string;
  messages: ProviderMessage[];
}

export interface ChatStreamOptions {
  signal: AbortSignal;
  onDelta(delta: string): void;
}

export type ChatProviderId = "mock" | "openai-compatible";

export interface ChatProvider {
  readonly id: ChatProviderId;
  readonly external: boolean;
  stream(request: ChatProviderRequest, options: ChatStreamOptions): Promise<void>;
}

export type ChatErrorCode =
  | "cancelled"
  | "invalid_configuration"
  | "invalid_request"
  | "missing_api_key"
  | "invalid_api_key"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error"
  | "invalid_response"
  | "secret_store_error"
  | "request_conflict"
  | "internal_error";

export class ChatProviderError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ChatProviderError";
  }
}
