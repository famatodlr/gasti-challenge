export type ActivityType = 'status' | 'tool_call' | 'tool_result' | 'warning' | 'error' | 'final_answer';

export type ActivityEvent = {
  type: ActivityType;
  label: string;
  toolName?: string;
  timestamp?: string;
  answer?: string;
};

export type ActivityFeedStatus = 'active' | 'complete' | 'warning' | 'error';

export type ActivityFeedItem = {
  id: string;
  type: ActivityType;
  label: string;
  status: ActivityFeedStatus;
  detail?: string;
  timestamp?: string;
};

const supportedActivityTypes = new Set<ActivityType>([
  'status',
  'tool_call',
  'tool_result',
  'warning',
  'error',
  'final_answer',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function displayLabel(event: ActivityEvent): string {
  if (event.type === 'status' && event.label === 'Generando respuesta final') {
    return 'Generando respuesta';
  }

  return event.label;
}

function toolKey(event: ActivityEvent, index: number): string {
  return event.toolName ?? `sin-nombre-${index}`;
}

function withOptionalDetails(item: ActivityFeedItem, event: Pick<ActivityEvent, 'toolName' | 'timestamp'>): ActivityFeedItem {
  return {
    ...item,
    ...(event.toolName ? { detail: event.toolName } : {}),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
  };
}

export function normalizeActivityEvent(value: unknown): ActivityEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !supportedActivityTypes.has(value.type as ActivityType)) {
    return null;
  }

  const label = readTrimmedString(value.label);

  if (!label) {
    return null;
  }

  const event: ActivityEvent = {
    type: value.type as ActivityType,
    label,
  };

  const toolName = readTrimmedString(value.toolName);
  const timestamp = readTrimmedString(value.timestamp);

  if (toolName) {
    event.toolName = toolName;
  }

  if (timestamp) {
    event.timestamp = timestamp;
  }

  if (typeof value.answer === 'string') {
    event.answer = value.answer;
  }

  return event;
}

export function normalizeActivityEvents(value: unknown): ActivityEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((event) => normalizeActivityEvent(event)).filter((event): event is ActivityEvent => event !== null);
}

export function createActivityFeedItems(events: readonly ActivityEvent[]): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  const pendingToolIndexes = new Map<string, number>();

  events.forEach((event, index) => {
    if (event.type === 'tool_call') {
      const key = toolKey(event, index);

      if (pendingToolIndexes.has(key)) {
        return;
      }

      pendingToolIndexes.set(key, items.length);
      items.push(
        withOptionalDetails(
          {
            id: `tool-${key}-${index}`,
            type: 'tool_call',
            label: 'Consultando herramienta',
            status: 'active',
          },
          event,
        ),
      );
      return;
    }

    if (event.type === 'tool_result') {
      const key = toolKey(event, index);
      const pendingIndex = pendingToolIndexes.get(key);

      if (pendingIndex !== undefined) {
        items[pendingIndex] = {
          ...items[pendingIndex],
          type: 'tool_result',
          label: 'Herramienta completada',
          status: 'complete',
          timestamp: event.timestamp ?? items[pendingIndex].timestamp,
        };
        pendingToolIndexes.delete(key);
        return;
      }

      items.push(
        withOptionalDetails(
          {
            id: `tool-${key}-${index}`,
            type: 'tool_result',
            label: 'Herramienta completada',
            status: 'complete',
          },
          event,
        ),
      );
      return;
    }

    if (event.type === 'warning') {
      items.push(
        withOptionalDetails(
          {
            id: `warning-${index}`,
            type: event.type,
            label: event.label,
            status: 'warning',
          },
          event,
        ),
      );
      return;
    }

    if (event.type === 'error') {
      items.push(
        withOptionalDetails(
          {
            id: `error-${index}`,
            type: event.type,
            label: event.label,
            status: 'error',
          },
          event,
        ),
      );
      return;
    }

    items.push(
      withOptionalDetails(
        {
          id: `${event.type}-${index}`,
          type: event.type,
          label: displayLabel(event),
          status: 'complete',
        },
        event,
      ),
    );
  });

  const lastItem = items.at(-1);

  if (lastItem?.type === 'status') {
    lastItem.status = 'active';
  }

  return items;
}
