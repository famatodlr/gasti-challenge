import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ChatController } from './chat.controller.js';
import { ChatService, GASTI_FINANCE_AGENT, defaultFinanceAgent } from './chat.service.js';

@Module({
  controllers: [AppController, ChatController],
  providers: [ChatService, { provide: GASTI_FINANCE_AGENT, useValue: defaultFinanceAgent }],
})
export class AppModule {}
