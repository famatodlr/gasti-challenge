import { Body, Controller, Inject, Post, Res } from '@nestjs/common';

import { normalizeChatRequest } from './chat.request.js';
import { ChatService } from './chat.service.js';
import type { ChatActivityEvent, ChatRequestBody, ChatResponseBody, NormalizedChatRequest } from './chat.types.js';

type ChatResponder = {
  answer: (request: NormalizedChatRequest) => Promise<string>;
  answerWithSteps: (request: NormalizedChatRequest) => Promise<ChatResponseBody>;
  streamAnswerEvents: (request: NormalizedChatRequest) => AsyncIterable<ChatActivityEvent>;
};

type SseResponse = {
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => void;
  end: () => void;
  flushHeaders?: () => void;
};

function writeSseEvent(response: SseResponse, event: ChatActivityEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

@Controller()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatResponder) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    const request = normalizeChatRequest(body);

    return await this.chatService.answerWithSteps(request);
  }

  @Post('chat/stream')
  async chatStream(@Body() body: ChatRequestBody, @Res() response: SseResponse): Promise<void> {
    const request = normalizeChatRequest(body);

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    try {
      for await (const event of this.chatService.streamAnswerEvents(request)) {
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
