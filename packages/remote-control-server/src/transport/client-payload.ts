import type { SessionEvent } from "./event-bus";

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

function extractKernelRuntimeEnvelope(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isKernelRuntimeEnvelope(value.envelope)) return value.envelope as Record<string, unknown>;
  if (isKernelRuntimeEnvelope(value)) return value;

  const raw = value.raw;
  if (isKernelRuntimeEnvelope(raw)) {
    return raw as Record<string, unknown>;
  }
  if (isRecord(raw) && isKernelRuntimeEnvelope(raw.envelope)) {
    return raw.envelope as Record<string, unknown>;
  }

  const message = value.message;
  if (isKernelRuntimeEnvelope(message)) {
    return message as Record<string, unknown>;
  }
  if (isRecord(message) && isKernelRuntimeEnvelope(message.envelope)) {
    return message.envelope as Record<string, unknown>;
  }

  return undefined;
}

/**
 * Convert an internal session event into the SDK/control message shape that
 * bridge workers consume on both the legacy WS path and the v2 worker SSE path.
 */
export function toClientPayload(event: SessionEvent): Record<string, unknown> {
  const payload = event.payload as Record<string, unknown> | null;
  const messageUuid =
    typeof payload?.uuid === "string" && payload.uuid ? payload.uuid : event.id;

  if (event.type === "kernel_runtime_event") {
    const envelope = extractKernelRuntimeEnvelope(payload);
    return {
      type: "kernel_runtime_event",
      uuid: messageUuid,
      session_id: event.sessionId,
      ...(envelope ? { envelope } : { message: payload ?? {} }),
    };
  }

  if (event.type === "user" || event.type === "user_message") {
    return {
      type: "user",
      uuid: messageUuid,
      session_id: event.sessionId,
      ...(payload?.isSynthetic === true ? { isSynthetic: true } : {}),
      message: {
        role: "user",
        content: payload?.content ?? payload?.message ?? "",
      },
    };
  }

  if (event.type === "permission_response" || event.type === "control_response") {
    const approved = !!payload?.approved;
    const existingResponse = payload?.response as Record<string, unknown> | undefined;
    if (existingResponse) {
      return { type: "control_response", response: existingResponse };
    }

    const updatedInput = payload?.updated_input as Record<string, unknown> | undefined;
    const updatedPermissions = payload?.updated_permissions as Record<string, unknown>[] | undefined;
    const feedbackMessage = payload?.message as string | undefined;

    return {
      type: "control_response",
      response: {
        subtype: approved ? "success" : "error",
        request_id: payload?.request_id ?? "",
        ...(approved
          ? {
              response: {
                behavior: "allow" as const,
                ...(updatedInput ? { updatedInput } : {}),
                ...(updatedPermissions ? { updatedPermissions } : {}),
              },
            }
          : {
              error: "Permission denied by user",
              response: { behavior: "deny" as const },
              ...(feedbackMessage ? { message: feedbackMessage } : {}),
            }),
      },
    };
  }

  if (event.type === "interrupt") {
    return {
      type: "control_request",
      request_id: event.id,
      request: { subtype: "interrupt" },
    };
  }

  if (event.type === "control_request") {
    return {
      type: "control_request",
      request_id: payload?.request_id ?? event.id,
      request: payload?.request ?? payload,
    };
  }

  return {
    type: event.type,
    uuid: messageUuid,
    session_id: event.sessionId,
    message: payload,
  };
}
