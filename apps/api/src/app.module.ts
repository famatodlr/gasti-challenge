import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ChatController } from './chat.controller.js';
import {
  ChatService,
  GASTI_FINANCE_AGENT,
  GASTI_WORKFLOW_RUNNER,
  defaultFinanceAgent,
  defaultFinanceWorkflowRunner,
} from './chat.service.js';

@Module({
  controllers: [AppController, ChatController],
  providers: [
    ChatService,
    { provide: GASTI_FINANCE_AGENT, useValue: defaultFinanceAgent },
    { provide: GASTI_WORKFLOW_RUNNER, useValue: defaultFinanceWorkflowRunner },
  ],
})
export class AppModule {}
