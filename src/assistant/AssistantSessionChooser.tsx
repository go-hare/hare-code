import React from 'react';
import { Text } from '@anthropic/ink';
import { Select } from '../components/CustomSelect/index.js';
import { Dialog } from '../components/design-system/Dialog.js';
import { useRegisterOverlay } from '../context/overlayContext.js';
import { formatRelativeTime } from '../utils/format.js';
import type { AssistantSession } from './sessionDiscovery.js';

type Props = {
  sessions: AssistantSession[];
  onSelect: (id: string) => void;
  onCancel: () => void;
};

const DIALOG_TITLE = 'Select Assistant Session';

function getStatusLabel(status: AssistantSession['status']): string {
  switch (status) {
    case 'requires_action':
      return 'needs input';
    case 'running':
      return 'running';
    case 'idle':
      return 'idle';
    case 'archived':
      return 'archived';
    default:
      return status;
  }
}

function buildSessionDescription(session: AssistantSession): string {
  const parts = [session.environmentName, session.cwd, session.repo].filter((part): part is string => Boolean(part));

  return parts.join(' · ') || 'No session details available';
}

function getUpdatedTimeLabel(updatedAt: string): string {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return updatedAt;
  }

  return formatRelativeTime(parsed);
}

export function AssistantSessionChooser({ sessions, onSelect, onCancel }: Props): React.ReactNode {
  useRegisterOverlay('assistant-session-chooser');

  if (sessions.length === 0) {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onCancel}>
        <Text>No assistant sessions are currently available.</Text>
      </Dialog>
    );
  }

  const options = sessions.map(session => {
    const relativeTime = getUpdatedTimeLabel(session.updatedAt);
    const statusLabel = getStatusLabel(session.status);

    return {
      label: (
        <Text>
          {session.title}{' '}
          <Text dimColor={true}>
            {statusLabel} · {relativeTime}
          </Text>
        </Text>
      ),
      description: buildSessionDescription(session),
      value: session.id,
    };
  });

  return (
    <Dialog
      title={DIALOG_TITLE}
      subtitle={`Found ${sessions.length} assistant bridge sessions. Choose one to attach to.`}
      onCancel={onCancel}
      hideInputGuide={true}
    >
      <Select
        options={options}
        defaultValue={sessions[0]?.id}
        onChange={onSelect}
        onCancel={onCancel}
        layout="compact-vertical"
      />
    </Dialog>
  );
}
