import { Body, Controller, Inject, Post } from '@nestjs/common';

import { normalizeChatRequest } from './chat.request.js';
import { ChatService } from './chat.service.js';
import type { ChatRequestBody, ChatResponseBody, NormalizedChatRequest } from './chat.types.js';

type ChatResponder = {
  answer: (request: NormalizedChatRequest) => Promise<string>;
};

@Controller()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatResponder) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    const request = normalizeChatRequest(body);

    return { answer: await this.chatService.answer(request) };
  }
}
