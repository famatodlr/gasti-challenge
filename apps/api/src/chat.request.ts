import { BadRequestException } from '@nestjs/common';

import type {
  ChatMessage,
  ChatRequestBody,
  ChatRequestContext,
  ChatRole,
  NormalizedChatRequest,
} from './chat.types.js';
import { MAX_CHAT_MESSAGE_CONTENT_LENGTH, MAX_LEGACY_STATELESS_MESSAGES } from './chat.types.js';

const SUPPORTED_CHAT_ROLES = new Set<ChatRole>(['user', 'assistant']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(value: Record<string, unknown>, key: keyof ChatRequestBody): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertContentLength(content: string, fieldName: string): void {
  if (content.length > MAX_CHAT_MESSAGE_CONTENT_LENGTH) {
    throw new BadRequestException(`${fieldName} must be at most ${MAX_CHAT_MESSAGE_CONTENT_LENGTH} characters.`);
  }
}

function normalizeLegacyMessage(value: unknown): ChatMessage {
  const content = typeof value === 'string' ? value.trim() : '';

  if (!content) {
    throw new BadRequestException('message must be a non-empty string.');
  }

  assertContentLength(content, 'message');

  return { role: 'user', content };
}

function normalizeMessage(value: unknown, index: number): ChatMessage {
  if (!isRecord(value)) {
    throw new BadRequestException(`messages[${index}] must be an object.`);
  }

  const role = value.role;
  if (typeof role !== 'string' || !SUPPORTED_CHAT_ROLES.has(role as ChatRole)) {
    throw new BadRequestException(`messages[${index}].role must be "user" or "assistant".`);
  }

  const content = typeof value.content === 'string' ? value.content.trim() : '';
  if (!content) {
    throw new BadRequestException(`messages[${index}].content must be a non-empty string.`);
  }

  assertContentLength(content, `messages[${index}].content`);

  return { role: role as ChatRole, content };
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('messages must be a non-empty array.');
  }

  const messages = value.map((message, index) => normalizeMessage(message, index));
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== 'user') {
    throw new BadRequestException('last message must have role "user".');
  }

  return messages;
}

function normalizeOptionalContextString(
  record: Record<string, unknown>,
  key: 'resourceId' | 'threadId',
): string | undefined {
  if (!hasOwnProperty(record, key)) {
    return undefined;
  }

  const value = record[key];
  const content = typeof value === 'string' ? value.trim() : '';

  if (!content) {
    throw new BadRequestException(`${key} must be a non-empty string when provided.`);
  }

  return content;
}

function normalizeChatContext(record: Record<string, unknown>): ChatRequestContext {
  const resourceId = normalizeOptionalContextString(record, 'resourceId');
  const threadId = normalizeOptionalContextString(record, 'threadId');
  const context: ChatRequestContext = {};

  if (resourceId) {
    context.resourceId = resourceId;
  }

  if (threadId) {
    context.threadId = threadId;
  }

  return context;
}

function hasProvidedString(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function buildMetadata(
  request: Pick<NormalizedChatRequest, 'mode' | 'messages' | 'context'>,
  {
    source,
    originalMessageCount,
    mixedLegacyNormalized = false,
    legacyContextCapped = false,
  }: {
    source: 'message' | 'messages';
    originalMessageCount: number;
    mixedLegacyNormalized?: boolean;
    legacyContextCapped?: boolean;
  },
): NormalizedChatRequest['metadata'] {
  const usesMemory = request.mode === 'memory';
  const hasThreadId = hasProvidedString(request.context.threadId);

  return {
    source,
    originalMessageCount,
    normalizedMessageCount: request.messages.length,
    usesMemory,
    mixedLegacyNormalized,
    legacyContextCapped,
    localDemoFallbackThread: usesMemory && !hasThreadId,
    hasResourceId: hasProvidedString(request.context.resourceId),
    hasThreadId,
  };
}

function buildMemoryRequest(
  messages: ChatMessage[],
  context: ChatRequestContext,
  metadata: Parameters<typeof buildMetadata>[1],
): NormalizedChatRequest {
  const request = {
    mode: 'memory' as const,
    messages,
    context,
  };

  return {
    ...request,
    metadata: buildMetadata(request, metadata),
  };
}

function buildStatelessRequest(
  messages: ChatMessage[],
  context: ChatRequestContext,
  metadata: Parameters<typeof buildMetadata>[1],
): NormalizedChatRequest {
  const request = {
    mode: 'stateless' as const,
    messages,
    context,
  };

  return {
    ...request,
    metadata: buildMetadata(request, metadata),
  };
}

export function normalizeChatRequest(body: ChatRequestBody): NormalizedChatRequest {
  const record = isRecord(body) ? body : {};
  const hasMessage = hasOwnProperty(record, 'message');
  const hasMessages = hasOwnProperty(record, 'messages');

  if (hasMessage && hasMessages) {
    throw new BadRequestException('Use either message or messages, not both.');
  }

  const context = normalizeChatContext(record);

  if (hasMessages) {
    const messages = normalizeMessages(record.messages);

    if (context.threadId) {
      return buildMemoryRequest([messages[messages.length - 1]], context, {
        source: 'messages',
        originalMessageCount: messages.length,
        mixedLegacyNormalized: true,
      });
    }

    const cappedMessages = messages.slice(-MAX_LEGACY_STATELESS_MESSAGES);

    return buildStatelessRequest(cappedMessages, context, {
      source: 'messages',
      originalMessageCount: messages.length,
      legacyContextCapped: cappedMessages.length < messages.length,
    });
  }

  return buildMemoryRequest([normalizeLegacyMessage(record.message)], context, {
    source: 'message',
    originalMessageCount: 1,
  });
}
