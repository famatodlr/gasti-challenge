import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common';

import { ChatService } from './chat.service.js';

type ChatRequestBody = {
  message?: unknown;
};

type ChatResponseBody = {
  answer: string;
};

type ChatResponder = {
  answer: (message: string) => Promise<string>;
};

@Controller()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatResponder) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      throw new BadRequestException('message must be a non-empty string.');
    }

    return { answer: await this.chatService.answer(message) };
  }
}
