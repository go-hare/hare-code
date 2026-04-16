import type {
  HostEvent,
  NotificationEvent,
  RuntimeEvent,
} from '../types/index.js'
import type { SessionManager } from './SessionManager.js'

export class HostEventAdapter {
  #sessions: SessionManager

  constructor(sessions: SessionManager) {
    this.#sessions = sessions
  }

  publish(event: HostEvent): {
    normalizedEvent: HostEvent
    runtimeEvent: RuntimeEvent
  } {
    const normalized = this.#sessions.recordHostEvent(event)

    const runtimeEvent: NotificationEvent = {
      type: 'notification',
      conversationId: normalized.conversationId,
      turnId: normalized.turnId,
      message: normalized.text || normalized.eventType,
      title: normalized.eventType,
      metadata: {
        ...normalized.metadata,
        source: 'host',
        hostEventType: normalized.eventType,
        hostRole: normalized.role,
      },
    }

    return {
      normalizedEvent: normalized,
      runtimeEvent,
    }
  }
}
