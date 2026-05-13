import { NextResponse } from 'next/server';

export const DEFAULT_CHAT_API_URL = 'http://localhost:7311/chat';
export const GENERIC_CHAT_ERROR = 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
export const INVALID_INPUT_ERROR = 'Mandame una pregunta para consultar tus gastos.';
export const INVALID_RESPONSE_ERROR = 'Gasti respondió con un formato inesperado. Intentá de nuevo.';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type NormalizedChatPayload =
  | {
      message: string;
      messages?: never;
      resourceId?: string;
      threadId?: string;
    }
  | {
      message?: never;
      messages: ChatMessage[];
      resourceId?: string;
      threadId?: string;
    };

export type ChatActivityEventType = 'status' | 'tool_call' | 'tool_result' | 'warning' | 'error' | 'final_answer';

export type ChatActivityEvent = {
  type: ChatActivityEventType;
  label: string;
  toolName?: string;
  timestamp?: string;
  answer?: string;
};

const SUPPORTED_CHAT_ROLES = new Set<ChatRole>(['user', 'assistant']);
const SUPPORTED_ACTIVITY_TYPES = new Set<ChatActivityEventType>([
  'status',
  'tool_call',
  'tool_result',
  'warning',
  'error',
  'final_answer',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = value.role;
  const content = typeof value.content === 'string' ? value.content.trim() : '';

  if (typeof role !== 'string' || !SUPPORTED_CHAT_ROLES.has(role as ChatRole) || !content) {
    return null;
  }

  return { role: role as ChatRole, content };
}

export function normalizeMessages(body: unknown): ChatMessage[] | null {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return null;
  }

  const messages = body.messages.map((message) => normalizeMessage(message));

  if (messages.some((message) => message === null)) {
    return null;
  }

  const normalizedMessages = messages as ChatMessage[];
  const lastMessage = normalizedMessages.at(-1);

  if (normalizedMessages.length === 0 || lastMessage?.role !== 'user') {
    return null;
  }

  return normalizedMessages;
}

function normalizeLegacyMessage(body: Record<string, unknown>): string | null {
  const content = typeof body.message === 'string' ? body.message.trim() : '';
  return content ? content : null;
}

function normalizeOptionalContextString(
  body: Record<string, unknown>,
  key: 'resourceId' | 'threadId',
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return undefined;
  }

  const content = typeof body[key] === 'string' ? body[key].trim() : '';
  return content ? content : null;
}

export function normalizeChatPayload(body: unknown): NormalizedChatPayload | null {
  if (!isRecord(body)) {
    return null;
  }

  const hasMessage = Object.prototype.hasOwnProperty.call(body, 'message');
  const hasMessages = Object.prototype.hasOwnProperty.call(body, 'messages');

  if (hasMessage && hasMessages) {
    return null;
  }

  const resourceId = normalizeOptionalContextString(body, 'resourceId');
  const threadId = normalizeOptionalContextString(body, 'threadId');

  if (resourceId === null || threadId === null) {
    return null;
  }

  const context = {
    ...(resourceId ? { resourceId } : {}),
    ...(threadId ? { threadId } : {}),
  };

  if (hasMessages) {
    const messages = normalizeMessages(body);
    return messages ? { messages, ...context } : null;
  }

  const message = normalizeLegacyMessage(body);
  return message ? { message, ...context } : null;
}

function normalizeActivityEvent(value: unknown): ChatActivityEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !SUPPORTED_ACTIVITY_TYPES.has(value.type as ChatActivityEventType)) {
    return null;
  }

  if (typeof value.label !== 'string' || !value.label.trim()) {
    return null;
  }

  const event: ChatActivityEvent = {
    type: value.type as ChatActivityEventType,
    label: value.label,
  };

  if (typeof value.toolName === 'string' && value.toolName.trim()) {
    event.toolName = value.toolName;
  }

  if (typeof value.timestamp === 'string' && value.timestamp.trim()) {
    event.timestamp = value.timestamp;
  }

  if (typeof value.answer === 'string') {
    event.answer = value.answer;
  }

  return event;
}

export function normalizeActivityEvents(value: unknown): ChatActivityEvent[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const events = value.map((event) => normalizeActivityEvent(event));

  if (events.some((event) => event === null)) {
    return undefined;
  }

  return events as ChatActivityEvent[];
}

export function getBackendChatUrl(): string {
  return process.env.GASTI_CHAT_API_URL ?? DEFAULT_CHAT_API_URL;
}

export function getBackendStreamUrl(): string {
  return process.env.GASTI_CHAT_STREAM_API_URL ?? `${getBackendChatUrl().replace(/\/$/, '')}/stream`;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
