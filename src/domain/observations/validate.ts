import {
  OBSERVATION_PROTOCOL_VERSION,
  type DevAgentStatusPayload,
  type MediaPlaybackPayload,
  type ObservationEvent,
  type ObservationEventType,
  type ObservationValidationResult,
} from "./types";

const EVENT_TYPES: readonly ObservationEventType[] = ["media.playback", "dev-agent.status"];
const ENVELOPE_KEYS = [
  "protocolVersion",
  "id",
  "source",
  "type",
  "observedAt",
  "sensitivity",
  "payload",
  "correlationId",
] as const;
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

export function validateObservationEvent(
  input: unknown,
  options: { maxPayloadBytes: number },
): ObservationValidationResult {
  if (!isRecord(input)) return invalid("观察事件必须是对象");
  const extraEnvelopeKey = firstUnexpectedKey(input, ENVELOPE_KEYS);
  if (extraEnvelopeKey) return invalid(`观察事件包含未声明字段：${extraEnvelopeKey}`);
  if (input.protocolVersion !== OBSERVATION_PROTOCOL_VERSION) {
    return invalid(`不支持的观察事件协议版本：${String(input.protocolVersion)}`);
  }
  if (!isBoundedString(input.id, 1, 128)) return invalid("id 必须是 1 到 128 字符的字符串");
  if (!isRecord(input.source)) return invalid("source 必须是对象");
  if (firstUnexpectedKey(input.source, ["kind", "id"])) return invalid("source 只能包含 kind 和 id");
  if (input.source.kind !== "system" && input.source.kind !== "plugin") return invalid("source.kind 必须是 system 或 plugin");
  if (typeof input.source.id !== "string" || !SOURCE_ID_PATTERN.test(input.source.id)) {
    return invalid("source.id 必须是稳定的小写 ID，且只包含字母、数字、点、下划线或连字符");
  }
  if (typeof input.type !== "string" || !EVENT_TYPES.includes(input.type as ObservationEventType)) {
    return invalid(`未知观察事件类型：${String(input.type)}`);
  }
  if (typeof input.observedAt !== "number" || !Number.isFinite(input.observedAt) || input.observedAt < 0) {
    return invalid("observedAt 必须是有限非负时间戳");
  }
  if (input.sensitivity !== "status" && input.sensitivity !== "metadata" && input.sensitivity !== "content") {
    return invalid("sensitivity 必须是 status、metadata 或 content");
  }
  if (input.correlationId !== undefined && !isBoundedString(input.correlationId, 1, 128)) {
    return invalid("correlationId 必须是 1 到 128 字符的字符串");
  }
  if (!isRecord(input.payload)) return invalid("payload 必须是对象");
  const payloadBytes = encodedLength(input.payload);
  if (payloadBytes === null) return invalid("payload 无法序列化为 JSON");
  if (payloadBytes > options.maxPayloadBytes) {
    return { ok: false, code: "payload_too_large", reason: `payload 超过 ${options.maxPayloadBytes} 字节限制` };
  }

  const payloadResult = input.type === "media.playback"
    ? validateMediaPayload(input.payload)
    : validateDevAgentPayload(input.payload);
  if (!payloadResult.ok) return payloadResult;
  return {
    ok: true,
    event: {
      protocolVersion: OBSERVATION_PROTOCOL_VERSION,
      id: input.id,
      source: { kind: input.source.kind, id: input.source.id },
      type: input.type,
      observedAt: input.observedAt,
      sensitivity: input.sensitivity,
      payload: payloadResult.payload,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    } as ObservationEvent,
  };
}

function validateMediaPayload(payload: Record<string, unknown>):
  | { ok: true; payload: MediaPlaybackPayload }
  | { ok: false; code: "invalid_event"; reason: string } {
  const extra = firstUnexpectedKey(payload, ["state"]);
  if (extra) return invalid(`media.playback payload 包含未声明字段：${extra}`);
  if (payload.state !== "playing" && payload.state !== "paused" && payload.state !== "stopped") {
    return invalid("media.playback state 必须是 playing、paused 或 stopped");
  }
  return { ok: true, payload: { state: payload.state } };
}

function validateDevAgentPayload(payload: Record<string, unknown>):
  | { ok: true; payload: DevAgentStatusPayload }
  | { ok: false; code: "invalid_event"; reason: string } {
  const extra = firstUnexpectedKey(payload, ["state"]);
  if (extra) return invalid(`dev-agent.status payload 包含未声明字段：${extra}`);
  const states: readonly DevAgentStatusPayload["state"][] = [
    "session_started",
    "working",
    "waiting_for_user",
    "completed",
    "failed",
    "stopped",
  ];
  if (typeof payload.state !== "string" || !states.includes(payload.state as DevAgentStatusPayload["state"])) {
    return invalid(`未知开发 Agent 状态：${String(payload.state)}`);
  }
  return { ok: true, payload: { state: payload.state as DevAgentStatusPayload["state"] } };
}

function invalid(reason: string): { ok: false; code: "invalid_event"; reason: string } {
  return { ok: false, code: "invalid_event", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function firstUnexpectedKey(value: Record<string, unknown>, allowed: readonly string[]): string | undefined {
  return Object.keys(value).find((key) => !allowed.includes(key));
}

function encodedLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}
