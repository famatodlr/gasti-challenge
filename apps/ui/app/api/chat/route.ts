import { NextResponse } from 'next/server';

const DEFAULT_CHAT_API_URL = 'http://localhost:3001/chat';
const GENERIC_CHAT_ERROR = 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
const INVALID_INPUT_ERROR = 'Mandame una pregunta para consultar tus gastos.';
const INVALID_RESPONSE_ERROR = 'Gasti respondió con un formato inesperado. Intentá de nuevo.';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type NormalizedChatPayload =
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

const SUPPORTED_CHAT_ROLES = new Set<ChatRole>(['user', 'assistant']);

function isRecord(value: unknown): value is Record<string, unknown> {
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

function normalizeMessages(body: unknown): ChatMessage[] | null {
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

function normalizeChatPayload(body: unknown): NormalizedChatPayload | null {
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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const payload = normalizeChatPayload(body);

  if (!payload) {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const backendUrl = process.env.GASTI_CHAT_API_URL ?? DEFAULT_CHAT_API_URL;

  try {
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const backendBody = await backendResponse.json().catch(() => null);

    if (!backendResponse.ok) {
      return jsonError(GENERIC_CHAT_ERROR, backendResponse.status);
    }

    if (!isRecord(backendBody) || typeof backendBody.answer !== 'string') {
      return jsonError(INVALID_RESPONSE_ERROR, 502);
    }

    return NextResponse.json({ answer: backendBody.answer });
  } catch {
    return jsonError(GENERIC_CHAT_ERROR, 502);
  }
}
