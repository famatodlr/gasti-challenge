import { BadRequestException, Body, Controller, Inject, Post, Res } from '@nestjs/common';

import { ChatService } from './chat.service.js';
import type { ChatActivityEvent, ChatMessage, ChatRequestBody, ChatResponseBody, ChatRole } from './chat.types.js';

type ChatResponder = {
  answer: (messages: ChatMessage[]) => Promise<string>;
  answerWithSteps: (messages: ChatMessage[]) => Promise<ChatResponseBody>;
  streamAnswerEvents: (messages: ChatMessage[]) => AsyncIterable<ChatActivityEvent>;
};

type SseResponse = {
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => void;
  end: () => void;
  flushHeaders?: () => void;
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

function normalizeChatRequest(body: ChatRequestBody): ChatMessage[] {
  const record = isRecord(body) ? body : {};
  const hasMessage = hasOwnProperty(record, 'message');
  const hasMessages = hasOwnProperty(record, 'messages');

  if (hasMessage && hasMessages) {
    throw new BadRequestException('Use either message or messages, not both.');
  }

  if (hasMessages) {
    return normalizeMessages(record.messages);
  }

  return normalizeLegacyMessage(record.message);
}

function writeSseEvent(response: SseResponse, event: ChatActivityEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

@Controller()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatResponder) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    return await this.chatService.answerWithSteps(normalizeChatRequest(body));
  }

  @Post('chat/stream')
  async chatStream(@Body() body: ChatRequestBody, @Res() response: SseResponse): Promise<void> {
    const messages = normalizeChatRequest(body);

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    try {
      for await (const event of this.chatService.streamAnswerEvents(messages)) {
        writeSseEvent(response, event);
      }
    } catch {
      writeSseEvent(response, {
        type: 'error',
        label: 'No pude generar una respuesta. Intentá de nuevo.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      response.end();
    }
  }
}
