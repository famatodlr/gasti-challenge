import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common';

import { ChatService } from './chat.service.js';
import type { ChatMessage, ChatRequestBody, ChatRequestContext, ChatResponseBody, ChatRole } from './chat.types.js';

type ChatResponder = {
  answer: (messages: ChatMessage[], context?: ChatRequestContext) => Promise<string>;
};

type NormalizedChatRequest = {
  messages: ChatMessage[];
  context: ChatRequestContext;
};

const SUPPORTED_CHAT_ROLES = new Set<ChatRole>(['user', 'assistant']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(value: Record<string, unknown>, key: keyof ChatRequestBody): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeLegacyMessage(value: unknown): ChatMessage[] {
  const content = typeof value === 'string' ? value.trim() : '';

  if (!content) {
    throw new BadRequestException('message must be a non-empty string.');
  }

  return [{ role: 'user', content }];
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
  return {
    resourceId: normalizeOptionalContextString(record, 'resourceId'),
    threadId: normalizeOptionalContextString(record, 'threadId'),
  };
}

function normalizeChatRequest(body: ChatRequestBody): NormalizedChatRequest {
  const record = isRecord(body) ? body : {};
  const hasMessage = hasOwnProperty(record, 'message');
  const hasMessages = hasOwnProperty(record, 'messages');

  if (hasMessage && hasMessages) {
    throw new BadRequestException('Use either message or messages, not both.');
  }

  const context = normalizeChatContext(record);

  if (hasMessages) {
    return { messages: normalizeMessages(record.messages), context };
  }

  return { messages: normalizeLegacyMessage(record.message), context };
}

@Controller()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatResponder) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    const request = normalizeChatRequest(body);

    return { answer: await this.chatService.answer(request.messages, request.context) };
  }
}
