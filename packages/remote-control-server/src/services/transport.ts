import { getEventBus } from "../transport/event-bus";
import { v4 as uuid } from "uuid";

/**
 * Extract plain text from various message payload formats.
 * Handles:
 *   { content: "text" }
 *   { message: { role: "user", content: "text" } }
 *   { message: { content: [{type:"text",text:"..."}] } }
 */
function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? payload : "";
  }

  const p = payload as Record<string, unknown>;

  // Direct content field
  if (typeof p.content === "string" && p.content) return p.content;

  // message.content (child process format)
  const msg = p.message;
  if (msg && typeof msg === "object") {
    const mc = (msg as Record<string, unknown>).content;
    if (typeof mc === "string") return mc;
    if (Array.isArray(mc)) {
      return mc
        .filter((b: unknown) => typeof b === "object" && b !== null && (b as Record<string, unknown>).type === "text")
        .map((b: Record<string, unknown>) => (b as Record<string, unknown>).text || "")
        .join("");
    }
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isKernelRuntimeEnvelope(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === "kernel.runtime.v1" &&
    typeof value.messageId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.timestamp === "string" &&
    value.source === "kernel_runtime" &&
    (value.kind === "ack" || value.kind === "event" || value.kind === "error" || value.kind === "pong")
  );
}

function extractKernelRuntimeEnvelope(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isKernelRuntimeEnvelope(payload.envelope)) return payload.envelope as Record<string, unknown>;
  if (isKernelRuntimeEnvelope(payload)) return payload;

  const raw = payload.raw;
  if (isKernelRuntimeEnvelope(raw)) return raw as Record<string, unknown>;
  if (isRecord(raw) && isKernelRuntimeEnvelope(raw.envelope)) {
    return raw.envelope as Record<string, unknown>;
  }

  const message = payload.message;
  if (isKernelRuntimeEnvelope(message)) return message as Record<string, unknown>;
  if (isRecord(message) && isKernelRuntimeEnvelope(message.envelope)) {
    return message.envelope as Record<string, unknown>;
  }

  return undefined;
}

/**
 * Normalize event payload into a flat structure with guaranteed `content` string.
 * Preserves original payload in `raw` field and keeps tool-specific fields.
 */
export function normalizePayload(type: string, payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { content: typeof payload === "string" ? payload : "", raw: payload };
  }

  const p = payload as Record<string, unknown>;
  const content = extractContent(payload);

  const normalized: Record<string, unknown> = {
    content,
    raw: payload,
  };

  if (typeof p.uuid === "string" && p.uuid) normalized.uuid = p.uuid;
  if (typeof p.isSynthetic === "boolean") normalized.isSynthetic = p.isSynthetic;
  if (typeof p.status === "string") normalized.status = p.status;
  if (typeof p.subtype === "string") normalized.subtype = p.subtype;

  // Preserve tool fields
  if (p.tool_name) normalized.tool_name = p.tool_name;
  if (p.name) normalized.tool_name = p.name;
  if (p.tool_input) normalized.tool_input = p.tool_input;
  if (p.input) normalized.tool_input = p.input;

  // Preserve permission fields
  if (p.request_id) normalized.request_id = p.request_id;
  if (p.request) normalized.request = p.request;
  if (p.approved !== undefined) normalized.approved = p.approved;
  if (p.updated_input) normalized.updated_input = p.updated_input;

  // Preserve message field for backward compat
  if (p.message) normalized.message = p.message;

  if (type === "kernel_runtime_event") {
    const envelope = extractKernelRuntimeEnvelope(p);
    if (envelope) normalized.envelope = envelope;
  }

  if (type === "task_state") {
    if (typeof p.task_list_id === "string") normalized.task_list_id = p.task_list_id;
    if (typeof p.taskListId === "string") normalized.taskListId = p.taskListId;
    if (Array.isArray(p.tasks)) normalized.tasks = p.tasks;
  }

  return normalized;
}

/** Publish an event to a session's bus (in-memory only) */
export function publishSessionEvent(
  sessionId: string,
  type: string,
  payload: unknown,
  direction: "inbound" | "outbound",
) {
  const bus = getEventBus(sessionId);
  const eventId = uuid();

  const normalized = normalizePayload(type, payload);

  const event = bus.publish({
    id: eventId,
    sessionId,
    type,
    payload: normalized,
    direction,
  });

  return event;
}
